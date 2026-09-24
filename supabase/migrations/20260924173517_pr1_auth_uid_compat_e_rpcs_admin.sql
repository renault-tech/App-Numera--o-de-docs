-- PR1 do plano de migração de auth (docs/PLANO_MIGRACAO_AUTH.md): banco
-- aditivo e compatível. Nada aqui muda o comportamento de quem ainda usa o
-- login legado (fallback em texto puro) nem exige RLS nova — isso é PR5.
-- Nenhum destes objetos é chamado pelo app.js/auth-service.js publicados
-- ainda (são todos usados só a partir do PR3+), então esta migration não
-- tem efeito visível hoje — é seguro aplicar a qualquer hora, mesmo fora
-- da janela das 17h combinada com o usuário (não muda nada do que os
-- servidores usam agora).
--
-- Testada transacionalmente antes de aplicar: 30 cenários (T1-T26, com
-- sub-testes T2b/T3b/T4b/T8b/T12b), incluindo o achado real de que a base
-- de produção tem 3 contas admin (não só uma) — a proteção do "último
-- admin ativo" em admin_atualizar_usuario/admin_desativar_usuario só foi
-- corretamente exercitada isolando TODAS as contas admin reais dentro da
-- própria transação de teste (nunca commitado). Ver
-- supabase/tests/002_pr1_auth_uid_compat.sql para o roteiro completo.

-- ============================================================
-- 1) Coluna ativo (soft delete para admin_desativar_usuario)
-- ============================================================
alter table public.users add column if not exists ativo boolean not null default true;

-- ============================================================
-- 2) Helpers de identidade
-- ============================================================
create or replace function public.eh_admin()
returns boolean
language sql
security definer
stable
set search_path to ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role = 'admin'
      and coalesce(approved, false)
      and coalesce(ativo, true)
  );
$$;

revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated, service_role;

create or replace function public.usuario_aprovado()
returns boolean
language sql
security definer
stable
set search_path to ''
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and coalesce(ativo, true)
      and (coalesce(approved, false) or role = 'admin')
  );
$$;

revoke all on function public.usuario_aprovado() from public;
grant execute on function public.usuario_aprovado() to authenticated, service_role;

-- ============================================================
-- 3) Trigger de cadastro: cria o perfil em public.users assim que a conta
--    nasce em auth.users (signUp nativo do Numera ou createUser via Hub/
--    script de migração). Nunca falha (on conflict do nothing) e sempre
--    nasce user_restricted/approved=false, mesmo que a metadata diga outra
--    coisa — aprovação e nível de acesso são decisão de admin, não do
--    cadastro. Quando o id já existe em public.users (contas migradas no
--    PR2, ou aprovarNumera do Hub que já faz upsert por conta própria),
--    este trigger não faz nada.
-- ============================================================
create or replace function public.criar_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_username   text;
  v_base       text;
  v_secretaria text;
  v_allowed    jsonb;
  v_sufixo     int := 0;
begin
  v_base := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if v_base is null then
    v_base := split_part(coalesce(new.email, 'usuario'), '@', 1);
  end if;
  v_username := v_base;

  while exists (select 1 from public.users where username = v_username) loop
    v_sufixo := v_sufixo + 1;
    v_username := v_base || v_sufixo::text;
  end loop;

  v_secretaria := nullif(trim(coalesce(new.raw_user_meta_data->>'secretaria', '')), '');
  v_allowed := '[]'::jsonb;
  if v_secretaria is not null then
    select coalesce(value -> v_secretaria, '[]'::jsonb) into v_allowed
      from public.app_config where key = 'secretariaPermissions';
    v_allowed := coalesce(v_allowed, '[]'::jsonb);
  end if;

  -- password NOT NULL sem default: este trigger roda ANTES do upsert que
  -- authService.signUp() faz em seguida (com a senha real) — precisa de um
  -- placeholder aqui, nunca fica sem valor. Para contas futuras criadas só
  -- pela Admin API (sem upsert de cliente depois), fica vazio de propósito
  -- — a credencial de verdade mora em auth.users, não aqui.
  insert into public.users
    (id, email, username, password, name, cargo, setor, secretaria, role, allowed_documents, approved, ativo)
  values
    (new.id,
     new.email,
     v_username,
     '',
     coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''), v_username),
     nullif(trim(coalesce(new.raw_user_meta_data->>'cargo', '')), ''),
     nullif(trim(coalesce(new.raw_user_meta_data->>'setor', '')), ''),
     v_secretaria,
     'user_restricted',
     v_allowed,
     false,
     true)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists criar_perfil_apos_signup on auth.users;
create trigger criar_perfil_apos_signup
  after insert on auth.users
  for each row execute function public.criar_perfil_usuario();

-- ============================================================
-- 4) Trigger de identidade real em logs — só age quando existe sessão de
--    verdade (auth.uid() não nulo). Quem ainda usa o login legado continua
--    exatamente como hoje (cliente decide user_id/user_name); ninguém com
--    sessão real do Auth consegue mais forjar "quem fez".
-- ============================================================
create or replace function public.forcar_identidade_log()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    new.user_id := v_uid;
    select name into new.user_name from public.users where id = v_uid;
  end if;
  return new;
end;
$$;

drop trigger if exists logs_identidade_real on public.logs;
create trigger logs_identidade_real
  before insert on public.logs
  for each row execute function public.forcar_identidade_log();

-- ============================================================
-- 5) RPCs de negócio — fase A (compatível: auth.uid() se existir, senão
--    cai para p_user_id vindo do cliente, com log de telemetria). Corpo
--    idêntico ao vigente (conferido via pg_get_functiondef antes de
--    escrever esta migration, base = 20260924050000), só a resolução de
--    identidade muda.
-- ============================================================
create or replace function public.reserve_number(
  p_doc_id uuid,
  p_user_id uuid,
  p_subject text DEFAULT NULL::text,
  p_dest_secretaria text DEFAULT NULL::text,
  p_dest_nome text DEFAULT NULL::text,
  p_dest_setor text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text,
  p_sent_at date DEFAULT NULL::date,
  p_dest_secretarias jsonb DEFAULT NULL::jsonb
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  p_dest_setor text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text,
  p_sent_at date DEFAULT NULL::date,
  p_dest_secretarias jsonb DEFAULT NULL::jsonb
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

create or replace function public.set_secretaria_counter(p_doc_id uuid, p_secretaria text, p_next_number integer, p_year integer DEFAULT NULL::integer)
RETURNS document_counters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

-- ============================================================
-- 6) RPCs de admin (security definer, eh_admin() gated) — não chamadas
--    pelo front ainda (isso é PR3/PR4), só criadas aqui.
-- ============================================================
create or replace function public.admin_aprovar_usuario(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin      public.users%rowtype;
  v_alvo       public.users%rowtype;
  v_has_custom boolean;
  v_defaults   jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem aprovar usuários';
  end if;
  select * into v_admin from public.users where id = auth.uid();

  select * into v_alvo from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  v_has_custom := jsonb_array_length(coalesce(v_alvo.allowed_documents, '[]'::jsonb)) > 0;
  select coalesce(value -> v_alvo.secretaria, '[]'::jsonb) into v_defaults
    from public.app_config where key = 'secretariaPermissions';
  v_defaults := coalesce(v_defaults, '[]'::jsonb);

  if not v_has_custom and jsonb_array_length(v_defaults) > 0 then
    update public.users set approved = true, allowed_documents = v_defaults where id = p_user_id;
  else
    update public.users set approved = true where id = p_user_id;
  end if;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('cadastro', 'Aprovou usuário', v_alvo.name, v_admin.id, v_admin.name);

  select * into v_alvo from public.users where id = p_user_id;
  return v_alvo;
end;
$$;

revoke all on function public.admin_aprovar_usuario(uuid) from public;
grant execute on function public.admin_aprovar_usuario(uuid) to authenticated, service_role;

create or replace function public.admin_atualizar_usuario(
  p_user_id uuid,
  p_name text,
  p_cargo text,
  p_setor text,
  p_secretaria text,
  p_username text,
  p_role text,
  p_allowed_documents jsonb
)
returns public.users
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin        public.users%rowtype;
  v_alvo         public.users%rowtype;
  v_total_admins int;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem editar usuários';
  end if;
  select * into v_admin from public.users where id = auth.uid();

  select * into v_alvo from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  if p_role not in ('admin', 'user_full', 'user_restricted', 'user_readonly') then
    raise exception 'Nível de permissão inválido';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Informe o nome';
  end if;
  if nullif(trim(coalesce(p_username, '')), '') is null then
    raise exception 'Informe o login';
  end if;

  if v_alvo.role = 'admin' and p_role <> 'admin' then
    if v_alvo.id = auth.uid() then
      raise exception 'Você não pode remover seu próprio acesso de administrador';
    end if;
    select count(*) into v_total_admins
      from public.users where role = 'admin' and coalesce(ativo, true);
    if v_total_admins <= 1 then
      raise exception 'Não é possível rebaixar o único administrador restante';
    end if;
  end if;

  update public.users
     set name = trim(p_name),
         cargo = nullif(trim(coalesce(p_cargo, '')), ''),
         setor = nullif(trim(coalesce(p_setor, '')), ''),
         secretaria = nullif(trim(coalesce(p_secretaria, '')), ''),
         username = trim(p_username),
         role = p_role,
         allowed_documents = coalesce(p_allowed_documents, '[]'::jsonb)
   where id = p_user_id
   returning * into v_alvo;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('cadastro', 'Editou usuário', v_alvo.name, v_admin.id, v_admin.name);

  return v_alvo;
end;
$$;

revoke all on function public.admin_atualizar_usuario(uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.admin_atualizar_usuario(uuid, text, text, text, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.admin_aplicar_padrao_secretaria(p_secretaria text, p_docs jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin public.users%rowtype;
  v_perms jsonb;
  v_count integer;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem aplicar padrões de secretaria';
  end if;
  select * into v_admin from public.users where id = auth.uid();

  if nullif(trim(coalesce(p_secretaria, '')), '') is null then
    raise exception 'Informe a secretaria';
  end if;
  if p_docs is null or jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) = 0 then
    raise exception 'Marque ao menos um documento';
  end if;

  select coalesce(value, '{}'::jsonb) into v_perms from public.app_config where key = 'secretariaPermissions';
  v_perms := coalesce(v_perms, '{}'::jsonb) || jsonb_build_object(p_secretaria, p_docs);
  insert into public.app_config (key, value) values ('secretariaPermissions', v_perms)
    on conflict (key) do update set value = excluded.value;

  update public.users
     set allowed_documents = p_docs
   where secretaria = p_secretaria and role in ('user_restricted', 'user_readonly');
  get diagnostics v_count = row_count;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('cadastro', 'Aplicou padrão de ' || p_secretaria, v_count || ' usuário(s)', v_admin.id, v_admin.name);

  return v_count;
end;
$$;

revoke all on function public.admin_aplicar_padrao_secretaria(text, jsonb) from public;
grant execute on function public.admin_aplicar_padrao_secretaria(text, jsonb) to authenticated, service_role;

create or replace function public.admin_desativar_usuario(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin        public.users%rowtype;
  v_alvo         public.users%rowtype;
  v_total_admins int;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem desativar usuários';
  end if;
  select * into v_admin from public.users where id = auth.uid();

  select * into v_alvo from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  if v_alvo.id = auth.uid() then
    raise exception 'Você não pode desativar sua própria conta';
  end if;

  if v_alvo.role = 'admin' then
    select count(*) into v_total_admins
      from public.users where role = 'admin' and coalesce(ativo, true);
    if v_total_admins <= 1 then
      raise exception 'Não é possível desativar o único administrador restante';
    end if;
  end if;

  update public.users set ativo = false where id = p_user_id returning * into v_alvo;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('cadastro', 'Desativou usuário', v_alvo.name, v_admin.id, v_admin.name);

  return v_alvo;
end;
$$;

revoke all on function public.admin_desativar_usuario(uuid) from public;
grant execute on function public.admin_desativar_usuario(uuid) to authenticated, service_role;

-- ============================================================
-- 7) Ações do próprio usuário (auth.uid() fixo) — não chamadas pelo front
--    ainda, isso é PR3.
-- ============================================================
create or replace function public.salvar_ordem_cards(p_ids jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão necessária para salvar a ordem dos cards';
  end if;
  update public.users set card_order = coalesce(p_ids, '[]'::jsonb) where id = auth.uid();
end;
$$;

revoke all on function public.salvar_ordem_cards(jsonb) from public;
grant execute on function public.salvar_ordem_cards(jsonb) to authenticated, service_role;

create or replace function public.marcar_login_origem(p_origem text DEFAULT 'direto'::text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.users
     set ultimo_acesso_origem = p_origem,
         veio_do_hub_em = case when p_origem = 'hub' then timezone('utc', now()) else veio_do_hub_em end
   where id = auth.uid();
end;
$$;

revoke all on function public.marcar_login_origem(text) from public;
grant execute on function public.marcar_login_origem(text) to authenticated, service_role;
