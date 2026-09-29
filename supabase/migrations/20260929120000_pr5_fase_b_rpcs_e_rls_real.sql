-- PR5 do plano de migração de auth (docs/PLANO_MIGRACAO_AUTH.md, seções 2
-- fase B e 4): impõe auth.uid() de verdade nas 4 RPCs de negócio (fim do
-- modo de compatibilidade sem sessão) e fecha a RLS das 6 tabelas, hoje
-- todas com uma única policy `using(true) with check(true)`.
--
-- NÃO APLICAR sem reconferir antes: `select count(*) from public.logs
-- where action = 'Chamada sem sessão (compat.)' and timestamp > now() -
-- interval '48 hours'` precisa estar em ZERO (critério do próprio plano).
-- Em 29/09/2026, às 11:29 UTC, ainda não estava (última chamada às
-- 11:25 UTC, mais de 1h depois do PR3 — ver CLAUDE.md).
--
-- Pré-requisito (já aplicado antes desta migration, commit
-- "Pré-requisito do PR5" em app-numera--o-de-docs): app.js/auth-service.js
-- não podem mais ter nenhuma escrita direta em tabela que dependa da RLS
-- aberta — conferido por grep de .insert(/.update(/.delete(/.upsert( nos
-- dois arquivos antes de escrever esta migration.

-- ===========================================================================
-- 1. Fase B das RPCs de negócio: auth.uid() obrigatório, p_user_id ignorado
--    (mantido na assinatura só por compatibilidade com quem ainda manda o
--    parâmetro — nunca removido aqui, só no PR6).
-- ===========================================================================

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
begin
  if v_uid is null then
    raise exception 'Sessão obrigatória';
  end if;

  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not coalesce(v_doc.enabled, true) then raise exception 'Documento desativado'; end if;

  select * into v_user from public.users where id = v_uid;
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
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão obrigatória';
  end if;

  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Esta reserva já foi anulada'; end if;

  select * into v_user from public.users where id = v_uid;
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
  v_uid        uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão obrigatória';
  end if;

  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Reserva anulada não pode ser editada'; end if;

  select * into v_user from public.users where id = v_uid;
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
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem ajustar a numeração';
  end if;

  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;

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

-- anon perde EXECUTE nas 4 (fim do modo de compatibilidade sem sessão);
-- revoke from public (não só anon) porque uma função nova/recriada pode
-- herdar grant de PUBLIC que revoke...from anon sozinho não remove (lição
-- já repetida à exaustão nos outros 3 repos desta plataforma).
revoke all on function public.reserve_number(uuid, uuid, text, text, text, text, text, date, jsonb) from public;
revoke all on function public.cancel_reservation(uuid, uuid, text) from public;
revoke all on function public.update_reservation(uuid, uuid, text, text, text, text, text, date, jsonb) from public;
revoke all on function public.set_secretaria_counter(uuid, text, integer, integer) from public;

grant execute on function public.reserve_number(uuid, uuid, text, text, text, text, text, date, jsonb) to authenticated, service_role;
grant execute on function public.cancel_reservation(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.update_reservation(uuid, uuid, text, text, text, text, text, date, jsonb) to authenticated, service_role;
grant execute on function public.set_secretaria_counter(uuid, text, integer, integer) to authenticated, service_role;

-- ===========================================================================
-- 2. RLS de verdade nas 6 tabelas (seção 4 do plano) — troca a única policy
--    aberta ("Enable all access for all users", using(true) with check(true))
--    por policies por operação, e revoga os grants excedentes que davam
--    para contornar RLS de qualquer jeito (TRUNCATE ignora RLS por completo).
-- ===========================================================================

drop policy if exists "Enable all access for all users" on public.users;
drop policy if exists "Enable all access for all users" on public.documents;
drop policy if exists "Enable all access for all users" on public.reservations;
drop policy if exists "Enable all access for all users" on public.document_counters;
drop policy if exists "Enable all access for all users" on public.logs;
drop policy if exists "Enable all access for all users" on public.app_config;

revoke truncate, trigger, references on public.users, public.documents, public.reservations, public.document_counters, public.logs, public.app_config from anon, authenticated;

-- users: cada um só a própria linha, admin vê todas; anon não vê nada
-- (revoke explícito, além da RLS, pra dar erro de permissão limpo em vez
-- de depender só do using(false) implícito); escrita só por RPC/trigger.
revoke select on public.users from anon;

create policy "le_users" on public.users
for select to authenticated
using (id = auth.uid() or public.eh_admin());

-- documents: leitura para quem está aprovado (ou admin); CRUD é feito
-- direto pela tela de admin (sem RPC própria), então precisa de policy de
-- escrita mesmo.
create policy "le_documents" on public.documents
for select to authenticated
using (public.usuario_aprovado());

create policy "escreve_documents_insert" on public.documents
for insert to authenticated
with check (public.eh_admin());

create policy "escreve_documents_update" on public.documents
for update to authenticated
using (public.eh_admin())
with check (public.eh_admin());

create policy "escreve_documents_delete" on public.documents
for delete to authenticated
using (public.eh_admin());

-- reservations: regra exata de app.js:948-958 (getVisibleReservations),
-- não um recorte aproximado — usa user_secretaria (de quem RESERVOU, não
-- o destino). Escrita só pelas RPCs (nenhuma policy de insert/update/delete
-- = negado por padrão).
create policy "le_reservations" on public.reservations
for select to authenticated
using (
  public.eh_admin()
  or exists (
    select 1 from public.documents d
    where d.id = reservations.doc_id and coalesce(d.per_secretaria, false) = false
  )
  or (
    (select u.secretaria from public.users u where u.id = auth.uid()) is not null
    and reservations.user_secretaria = (select u.secretaria from public.users u where u.id = auth.uid())
  )
  or (
    (select u.secretaria from public.users u where u.id = auth.uid()) is null
    and reservations.user_id = auth.uid()
  )
);

-- document_counters: leitura para aprovado/admin, escrita só pelas RPCs.
create policy "le_document_counters" on public.document_counters
for select to authenticated
using (public.usuario_aprovado());

-- logs: só admin lê; insert direto (addLog em app.js) exige a própria
-- identidade (o trigger logs_identidade_real já reescreve user_id/user_name
-- pela sessão real de qualquer forma — a policy é defesa em profundidade,
-- não a única barreira); update/delete continuam sem policy nenhuma (nega
-- por padrão), reforçando o trigger logs_imutaveis que já bloqueia os dois.
create policy "le_logs" on public.logs
for select to authenticated
using (public.eh_admin());

create policy "grava_logs" on public.logs
for insert to authenticated
with check (user_id = auth.uid());

-- app_config: as 2 chaves em uso (secretaria_list, secretariaPermissions)
-- + loginDiretoBloqueado (citada no plano, ainda não criada) precisam ser
-- legíveis por qualquer autenticado/anon ANTES do login (tela de cadastro
-- usa a lista de secretarias) — escrita só admin. Duas policies, não uma
-- só "to anon, authenticated" — o Postgres não garante avaliar o `using`
-- na ordem escrita nem parar no primeiro `true` de um OR; achado real ao
-- testar: `anon` batia "permission denied for function eh_admin" mesmo
-- quando a CHAVE já bastava para liberar, porque o planner tentava
-- resolver o outro lado do OR de qualquer jeito. Isolando `eh_admin()`
-- numa policy que só vale para `authenticated` (que sempre tem EXECUTE
-- nela), `anon` nunca chega perto dela.
create policy "le_app_config_publica_anon" on public.app_config
for select to anon
using (key in ('secretaria_list', 'secretariaPermissions', 'loginDiretoBloqueado'));

create policy "le_app_config_publica_authenticated" on public.app_config
for select to authenticated
using (key in ('secretaria_list', 'secretariaPermissions', 'loginDiretoBloqueado') or public.eh_admin());

create policy "escreve_app_config_insert" on public.app_config
for insert to authenticated
with check (public.eh_admin());

create policy "escreve_app_config_update" on public.app_config
for update to authenticated
using (public.eh_admin())
with check (public.eh_admin());

create policy "escreve_app_config_delete" on public.app_config
for delete to authenticated
using (public.eh_admin());
