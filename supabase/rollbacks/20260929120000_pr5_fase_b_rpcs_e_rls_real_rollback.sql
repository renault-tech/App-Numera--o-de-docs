-- Rollback do PR5 (20260929120000_pr5_fase_b_rpcs_e_rls_real.sql):
-- restaura a fase A das 4 RPCs (modo de compatibilidade sem sessão, com
-- telemetria) e a RLS aberta original (`using(true) with check(true)` nas
-- 6 tabelas, EXECUTE de volta para `anon` nas 4 RPCs, grants de
-- truncate/trigger/references/select de volta para anon/authenticated).

create or replace function public.reserve_number(
  p_doc_id uuid,
  p_user_id uuid,
  p_subject text default null,
  p_dest_secretaria text default null,
  p_dest_nome text default null,
  p_dest_setor text default null,
  p_observacoes text default null,
  p_sent_at date default null,
  p_dest_secretarias jsonb default null
)
returns public.reservations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_doc          public.documents%rowtype;
  v_user         public.users%rowtype;
  v_year         integer := extract(year from now())::integer;
  v_bucket_sec   text;
  v_bucket_year  integer;
  v_number       integer;
  v_formatted    text;
  v_dest_secs    jsonb;
  v_dest_label   text;
  v_res          public.reservations;
  v_uid          uuid := auth.uid();
  v_effective_id uuid;
begin
  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not coalesce(v_doc.enabled, true) then raise exception 'Documento desativado'; end if;

  if v_uid is not null then
    if p_user_id is not null and p_user_id <> v_uid then
      raise exception 'Identidade não confere com a sessão';
    end if;
    v_effective_id := v_uid;
  else
    v_effective_id := p_user_id;
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Chamada sem sessão (compat.)', 'reserve_number | p_user_id=' || coalesce(p_user_id::text, 'null'), null, 'Telemetria');
  end if;

  select * into v_user from public.users where id = v_effective_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if coalesce(v_user.approved, false) = false and v_user.role <> 'admin' then
    raise exception 'Usuário aguarda aprovação do administrador'; end if;
  if v_user.role = 'user_readonly' then
    raise exception 'Usuário somente leitura não pode reservar números'; end if;
  if v_user.role = 'user_restricted'
     and not (v_doc.id::text in (select jsonb_array_elements_text(coalesce(v_user.allowed_documents, '[]'::jsonb)))) then
    raise exception 'Sem permissão para este tipo de documento'; end if;

  if p_dest_secretarias is not null
     and jsonb_typeof(p_dest_secretarias) = 'array'
     and jsonb_array_length(p_dest_secretarias) > 0 then
    v_dest_secs := p_dest_secretarias;
  elsif nullif(trim(coalesce(p_dest_secretaria, '')), '') is not null then
    v_dest_secs := jsonb_build_array(trim(p_dest_secretaria));
  else
    v_dest_secs := '[]'::jsonb;
  end if;
  select string_agg(x, ', ') into v_dest_label
    from jsonb_array_elements_text(v_dest_secs) as t(x);

  if coalesce(v_doc.per_secretaria, false) then
    v_bucket_sec := coalesce(nullif(trim(v_user.secretaria), ''), '');
    if v_bucket_sec = '' then
      raise exception 'Defina sua secretaria para reservar este documento';
    end if;
  else
    v_bucket_sec := '';
  end if;
  v_bucket_year := case when coalesce(v_doc.yearly_reset, false) then v_year else 0 end;

  insert into public.document_counters (doc_id, secretaria, year, current_number)
  values (v_doc.id, v_bucket_sec, v_bucket_year, coalesce(v_doc.start_number, 1))
  on conflict (doc_id, secretaria, year) do nothing;

  select current_number into v_number
    from public.document_counters
   where doc_id = v_doc.id and secretaria = v_bucket_sec and year = v_bucket_year
   for update;

  v_formatted := trim(
    coalesce(v_doc.prefix || ' ', '') ||
    lpad(v_number::text, greatest(3, length(v_number::text)), '0') ||
    case when coalesce(v_doc.yearly_reset, false) then '/' || v_year else '' end
  );

  insert into public.reservations
    (doc_id, doc_name, number, formatted_number, subject,
     dest_secretaria, dest_secretarias, dest_nome, dest_setor, observacoes, sent_at,
     user_id, user_name, user_cargo, user_setor, user_secretaria,
     bucket_secretaria, bucket_year)
  values
    (v_doc.id, v_doc.name, v_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
     nullif(coalesce(v_dest_label, ''), ''), v_dest_secs,
     nullif(trim(coalesce(p_dest_nome, '')), ''),
     nullif(trim(coalesce(p_dest_setor, '')), ''), nullif(trim(coalesce(p_observacoes, '')), ''), p_sent_at,
     v_user.id, v_user.name, v_user.cargo, v_user.setor, v_user.secretaria,
     v_bucket_sec, v_bucket_year)
  returning * into v_res;

  update public.document_counters
     set current_number = v_number + 1,
         updated_at     = timezone('utc', now())
   where doc_id = v_doc.id and secretaria = v_bucket_sec and year = v_bucket_year;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('reserva', 'Reservou ' || v_doc.name, 'Número: ' || v_formatted, v_user.id, v_user.name);

  return v_res;
end;
$function$;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_user_id uuid, p_reason text)
returns public.reservations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_res  public.reservations%rowtype;
  v_user public.users%rowtype;
  v_uid          uuid := auth.uid();
  v_effective_id uuid;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Esta reserva já foi anulada'; end if;

  if v_uid is not null then
    if p_user_id is not null and p_user_id <> v_uid then
      raise exception 'Identidade não confere com a sessão';
    end if;
    v_effective_id := v_uid;
  else
    v_effective_id := p_user_id;
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Chamada sem sessão (compat.)', 'cancel_reservation | p_user_id=' || coalesce(p_user_id::text, 'null'), null, 'Telemetria');
  end if;

  select * into v_user from public.users where id = v_effective_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_res.user_id <> v_user.id and v_user.role <> 'admin' then
    raise exception 'Apenas quem reservou (ou um administrador) pode anular esta reserva';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da anulação';
  end if;

  update public.reservations
     set status           = 'anulada',
         cancel_reason    = trim(p_reason),
         canceled_at      = timezone('utc', now()),
         canceled_by      = v_user.id,
         canceled_by_name = v_user.name
   where id = p_reservation_id
   returning * into v_res;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('anulacao', 'Anulou reserva ' || v_res.formatted_number,
          'Documento: ' || v_res.doc_name || ' | Motivo: ' || trim(p_reason),
          v_user.id, v_user.name);

  return v_res;
end;
$function$;

create or replace function public.update_reservation(
  p_reservation_id uuid,
  p_user_id uuid,
  p_subject text,
  p_dest_secretaria text,
  p_dest_nome text,
  p_dest_setor text default null,
  p_observacoes text default null,
  p_sent_at date default null,
  p_dest_secretarias jsonb default null
)
returns public.reservations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_res        public.reservations%rowtype;
  v_user       public.users%rowtype;
  v_old_sub    text; v_old_sec text; v_old_nome text; v_old_setor text; v_old_obs text;
  v_new_sub    text; v_new_sec text; v_new_nome text; v_new_setor text; v_new_obs text;
  v_old_sent   text; v_new_sent text;
  v_dest_secs  jsonb;
  v_changes    text := '';
  v_uid          uuid := auth.uid();
  v_effective_id uuid;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Reserva anulada não pode ser editada'; end if;

  if v_uid is not null then
    if p_user_id is not null and p_user_id <> v_uid then
      raise exception 'Identidade não confere com a sessão';
    end if;
    v_effective_id := v_uid;
  else
    v_effective_id := p_user_id;
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Chamada sem sessão (compat.)', 'update_reservation | p_user_id=' || coalesce(p_user_id::text, 'null'), null, 'Telemetria');
  end if;

  select * into v_user from public.users where id = v_effective_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  if v_res.user_id <> v_user.id then
    raise exception 'Apenas quem reservou pode editar esta reserva';
  end if;

  if p_dest_secretarias is not null
     and jsonb_typeof(p_dest_secretarias) = 'array'
     and jsonb_array_length(p_dest_secretarias) > 0 then
    v_dest_secs := p_dest_secretarias;
  elsif nullif(trim(coalesce(p_dest_secretaria, '')), '') is not null then
    v_dest_secs := jsonb_build_array(trim(p_dest_secretaria));
  else
    v_dest_secs := '[]'::jsonb;
  end if;

  v_old_sub   := coalesce(v_res.subject, '');
  v_old_sec   := coalesce(v_res.dest_secretaria, '');
  v_old_nome  := coalesce(v_res.dest_nome, '');
  v_old_setor := coalesce(v_res.dest_setor, '');
  v_old_obs   := coalesce(v_res.observacoes, '');
  v_old_sent  := coalesce(to_char(v_res.sent_at, 'DD/MM/YYYY'), '');
  v_new_sub   := coalesce(nullif(trim(coalesce(p_subject, '')), ''), '');
  select coalesce(string_agg(x, ', '), '') into v_new_sec
    from jsonb_array_elements_text(v_dest_secs) as t(x);
  v_new_nome  := coalesce(nullif(trim(coalesce(p_dest_nome, '')), ''), '');
  v_new_setor := coalesce(nullif(trim(coalesce(p_dest_setor, '')), ''), '');
  v_new_obs   := coalesce(nullif(trim(coalesce(p_observacoes, '')), ''), '');
  v_new_sent  := coalesce(to_char(p_sent_at, 'DD/MM/YYYY'), '');

  if v_old_sub is distinct from v_new_sub then
    v_changes := v_changes || 'Ementa: "' || v_old_sub || '" → "' || v_new_sub || '"' || E'\n';
  end if;
  if v_old_sec is distinct from v_new_sec then
    v_changes := v_changes || 'Secretarias de destino: "' || v_old_sec || '" → "' || v_new_sec || '"' || E'\n';
  end if;
  if v_old_nome is distinct from v_new_nome then
    v_changes := v_changes || 'Destinatário: "' || v_old_nome || '" → "' || v_new_nome || '"' || E'\n';
  end if;
  if v_old_setor is distinct from v_new_setor then
    v_changes := v_changes || 'Setor de destino: "' || v_old_setor || '" → "' || v_new_setor || '"' || E'\n';
  end if;
  if v_old_obs is distinct from v_new_obs then
    v_changes := v_changes || 'Observações: "' || v_old_obs || '" → "' || v_new_obs || '"' || E'\n';
  end if;
  if v_old_sent is distinct from v_new_sent then
    v_changes := v_changes || 'Data de envio: "' || v_old_sent || '" → "' || v_new_sent || '"' || E'\n';
  end if;

  v_changes := trim(both E'\n' from v_changes);
  if v_changes = '' then v_changes := 'Sem alterações de conteúdo'; end if;

  update public.reservations
     set subject          = nullif(v_new_sub, ''),
         dest_secretaria  = nullif(v_new_sec, ''),
         dest_secretarias = v_dest_secs,
         dest_nome        = nullif(v_new_nome, ''),
         dest_setor       = nullif(v_new_setor, ''),
         observacoes      = nullif(v_new_obs, ''),
         sent_at          = p_sent_at,
         edited_at        = timezone('utc', now())
   where id = p_reservation_id
   returning * into v_res;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('edicao', 'Editou reserva ' || v_res.formatted_number,
          v_res.doc_name || E'\n' || v_changes, v_user.id, v_user.name);

  return v_res;
end;
$function$;

create or replace function public.set_secretaria_counter(p_doc_id uuid, p_secretaria text, p_next_number integer, p_year integer default null)
returns public.document_counters
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_doc      public.documents%rowtype;
  v_sec      text;
  v_year     integer;
  v_max_used integer;
  v_row      public.document_counters%rowtype;
  v_uid      uuid := auth.uid();
begin
  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;

  if v_uid is not null then
    if not public.eh_admin() then
      raise exception 'Apenas administradores podem ajustar a numeração';
    end if;
  else
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Chamada sem sessão (compat.)', 'set_secretaria_counter | doc=' || p_doc_id::text || ' secretaria=' || coalesce(p_secretaria, ''), null, 'Telemetria');
  end if;

  if p_next_number is null or p_next_number < 1 then
    raise exception 'Número inicial inválido';
  end if;

  if coalesce(v_doc.per_secretaria, false) then
    v_sec := coalesce(nullif(trim(p_secretaria), ''), '');
    if v_sec = '' then
      raise exception 'Informe a secretaria';
    end if;
  else
    v_sec := '';
  end if;

  v_year := case when coalesce(v_doc.yearly_reset, false)
                 then coalesce(p_year, extract(year from now())::int)
                 else 0 end;

  select max(number) into v_max_used
    from public.reservations
   where doc_id = p_doc_id
     and bucket_secretaria = v_sec
     and bucket_year = v_year;

  if v_max_used is not null and p_next_number <= v_max_used then
    raise exception 'Já existe o número % reservado nesta secretaria; escolha um valor maior que %', v_max_used, v_max_used;
  end if;

  insert into public.document_counters (doc_id, secretaria, year, current_number)
  values (p_doc_id, v_sec, v_year, p_next_number)
  on conflict (doc_id, secretaria, year)
  do update set current_number = excluded.current_number,
                updated_at     = timezone('utc', now())
  returning * into v_row;

  return v_row;
end;
$function$;

grant execute on function public.reserve_number(uuid, uuid, text, text, text, text, text, date, jsonb) to anon, authenticated, service_role;
grant execute on function public.cancel_reservation(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.update_reservation(uuid, uuid, text, text, text, text, text, date, jsonb) to anon, authenticated, service_role;
grant execute on function public.set_secretaria_counter(uuid, text, integer, integer) to anon, authenticated, service_role;

drop policy if exists "le_users" on public.users;
drop policy if exists "le_documents" on public.documents;
drop policy if exists "escreve_documents_insert" on public.documents;
drop policy if exists "escreve_documents_update" on public.documents;
drop policy if exists "escreve_documents_delete" on public.documents;
drop policy if exists "le_reservations" on public.reservations;
drop policy if exists "le_document_counters" on public.document_counters;
drop policy if exists "le_logs" on public.logs;
drop policy if exists "grava_logs" on public.logs;
drop policy if exists "le_app_config_publica_anon" on public.app_config;
drop policy if exists "le_app_config_publica_authenticated" on public.app_config;
drop policy if exists "escreve_app_config_insert" on public.app_config;
drop policy if exists "escreve_app_config_update" on public.app_config;
drop policy if exists "escreve_app_config_delete" on public.app_config;

grant select on public.users to anon;
grant truncate, trigger, references on public.users, public.documents, public.reservations, public.document_counters, public.logs, public.app_config to anon, authenticated;

create policy "Enable all access for all users" on public.users for all using (true) with check (true);
create policy "Enable all access for all users" on public.documents for all using (true) with check (true);
create policy "Enable all access for all users" on public.reservations for all using (true) with check (true);
create policy "Enable all access for all users" on public.document_counters for all using (true) with check (true);
create policy "Enable all access for all users" on public.logs for all using (true) with check (true);
create policy "Enable all access for all users" on public.app_config for all using (true) with check (true);
