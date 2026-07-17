-- ============================================================
-- 0004 — Destinatário da reserva + anulação/edição
--
-- 1. A reserva passa a registrar PARA QUEM o documento foi enviado:
--    dest_secretaria (secretaria de destino ou 'Externo / Outro órgão')
--    e dest_nome (nome do destinatário).
-- 2. Ciclo de vida: uma reserva pode ser ANULADA (permanece no histórico
--    com selo e motivo; o número nunca é reemitido — o contador não volta)
--    ou EDITADA (ementa/destinatário; número e tipo jamais mudam — RN-01).
--    Quem pode: o dono da reserva ou um admin, sempre com log.
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e
-- execute. É idempotente e seguro rodar mais de uma vez.
-- Compatibilidade: o frontend antigo continua funcionando após aplicar
-- (os parâmetros novos de reserve_number têm default null).
-- ============================================================

-- 1. Colunas novas em reservations
alter table public.reservations
  add column if not exists dest_secretaria text,
  add column if not exists dest_nome       text,
  add column if not exists status          text not null default 'ativa',
  add column if not exists cancel_reason   text,
  add column if not exists canceled_at     timestamptz,
  add column if not exists canceled_by     uuid,
  add column if not exists canceled_by_name text,
  add column if not exists edited_at       timestamptz;

-- Check de status (não existe "add constraint if not exists")
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'chk_reservations_status'
       and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint chk_reservations_status check (status in ('ativa','anulada'));
  end if;
end $$;

-- ============================================================
-- 2. reserve_number — nova assinatura com destinatário.
--    O drop é obrigatório: manter a assinatura antiga junto com a nova
--    (que tem defaults) tornaria a chamada de 3 argumentos ambígua no
--    PostgREST. Com o drop, chamadas antigas de 3 argumentos continuam
--    resolvendo para esta função (defaults null).
-- ============================================================
drop function if exists public.reserve_number(uuid, uuid, text);

create or replace function public.reserve_number(
  p_doc_id          uuid,
  p_user_id         uuid,
  p_subject         text default null,
  p_dest_secretaria text default null,
  p_dest_nome       text default null
) returns public.reservations
language plpgsql
as $$
declare
  v_doc         public.documents%rowtype;
  v_user        public.users%rowtype;
  v_year        integer := extract(year from now())::integer;
  v_bucket_sec  text;
  v_bucket_year integer;
  v_number      integer;
  v_formatted   text;
  v_res         public.reservations;
begin
  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;
  if not coalesce(v_doc.enabled, true) then raise exception 'Documento desativado'; end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if coalesce(v_user.approved, false) = false and v_user.role <> 'admin' then
    raise exception 'Usuário aguarda aprovação do administrador'; end if;
  if v_user.role = 'user_readonly' then
    raise exception 'Usuário somente leitura não pode reservar números'; end if;
  if v_user.role = 'user_restricted'
     and not (v_doc.id::text in (select jsonb_array_elements_text(coalesce(v_user.allowed_documents, '[]'::jsonb)))) then
    raise exception 'Sem permissão para este tipo de documento'; end if;

  -- Regra de bucket (migração 0003)
  if coalesce(v_doc.per_secretaria, false) then
    v_bucket_sec := coalesce(nullif(trim(v_user.secretaria), ''), '');
    if v_bucket_sec = '' then
      raise exception 'Defina sua secretaria para reservar este documento';
    end if;
  else
    v_bucket_sec := '';
  end if;
  v_bucket_year := case when coalesce(v_doc.yearly_reset, false) then v_year else 0 end;

  -- Find-or-create race-safe do contador (semente = start_number)
  insert into public.document_counters (doc_id, secretaria, year, current_number)
  values (v_doc.id, v_bucket_sec, v_bucket_year, coalesce(v_doc.start_number, 1))
  on conflict (doc_id, secretaria, year) do nothing;

  -- Lock pessimista na linha do bucket
  select current_number into v_number
    from public.document_counters
   where doc_id = v_doc.id and secretaria = v_bucket_sec and year = v_bucket_year
   for update;

  -- Formato idêntico ao formatNumber() do app.js
  v_formatted := trim(
    coalesce(v_doc.prefix || ' ', '') ||
    lpad(v_number::text, 3, '0') ||
    case when coalesce(v_doc.yearly_reset, false) then '/' || v_year else '' end
  );

  insert into public.reservations
    (doc_id, doc_name, number, formatted_number, subject,
     dest_secretaria, dest_nome,
     user_id, user_name, user_cargo, user_setor, user_secretaria, bucket_secretaria)
  values
    (v_doc.id, v_doc.name, v_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
     nullif(trim(coalesce(p_dest_secretaria, '')), ''), nullif(trim(coalesce(p_dest_nome, '')), ''),
     v_user.id, v_user.name, v_user.cargo, v_user.setor, v_user.secretaria, v_bucket_sec)
  returning * into v_res;

  update public.document_counters
     set current_number = v_number + 1,
         updated_at     = timezone('utc', now())
   where doc_id = v_doc.id and secretaria = v_bucket_sec and year = v_bucket_year;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('reserva', 'Reservou ' || v_doc.name, 'Número: ' || v_formatted, v_user.id, v_user.name);

  return v_res;
end;
$$;

-- ============================================================
-- 3. cancel_reservation — anula uma reserva (dono ou admin).
--    A linha permanece no histórico com status='anulada'; o contador
--    NÃO regride, então o número anulado jamais é reemitido.
-- ============================================================
create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_user_id        uuid,
  p_reason         text
) returns public.reservations
language plpgsql
as $$
declare
  v_res  public.reservations%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Esta reserva já foi anulada'; end if;

  select * into v_user from public.users where id = p_user_id;
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
$$;

-- ============================================================
-- 4. update_reservation — edita ementa/destinatário (dono ou admin).
--    Número e tipo de documento NUNCA mudam (RN-01).
-- ============================================================
create or replace function public.update_reservation(
  p_reservation_id  uuid,
  p_user_id         uuid,
  p_subject         text,
  p_dest_secretaria text,
  p_dest_nome       text
) returns public.reservations
language plpgsql
as $$
declare
  v_res  public.reservations%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Reserva anulada não pode ser editada'; end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_res.user_id <> v_user.id and v_user.role <> 'admin' then
    raise exception 'Apenas quem reservou (ou um administrador) pode editar esta reserva';
  end if;

  update public.reservations
     set subject         = nullif(trim(coalesce(p_subject, '')), ''),
         dest_secretaria = nullif(trim(coalesce(p_dest_secretaria, '')), ''),
         dest_nome       = nullif(trim(coalesce(p_dest_nome, '')), ''),
         edited_at       = timezone('utc', now())
   where id = p_reservation_id
   returning * into v_res;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('edicao', 'Editou reserva ' || v_res.formatted_number,
          'Documento: ' || v_res.doc_name, v_user.id, v_user.name);

  return v_res;
end;
$$;
