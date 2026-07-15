-- ============================================================
-- 0003 — Numeração por secretaria
--
-- Até aqui cada tipo de documento tinha UM contador global
-- (documents.current_number). Todas as secretarias compartilhavam a
-- mesma sequência de Ofício. Agora cada secretaria pode ter sua própria
-- sequência por tipo de documento, controlado por um flag por tipo.
--
-- O contador autoritativo sai de documents.current_number e passa a
-- viver em document_counters, com chave (doc_id, secretaria, year):
--   bucket_secretaria = per_secretaria ? secretaria_do_usuario : ''
--   bucket_year       = yearly_reset   ? ano_atual            : 0
-- O reset anual vira estrutural (ano novo = bucket novo, semeado de
-- start_number) — dispensa last_reset_year.
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e
-- execute. É idempotente e seguro rodar mais de uma vez.
-- ============================================================

-- 1. Flag por tipo de documento
alter table public.documents
  add column if not exists per_secretaria boolean not null default false;

-- 2. Tabela de contadores por bucket (autoritativa daqui pra frente)
create table if not exists public.document_counters (
  id             uuid default uuid_generate_v4() primary key,
  doc_id         uuid    not null references public.documents(id) on delete cascade,
  secretaria     text    not null default '',   -- '' = bucket global; senão o nome da secretaria
  year           integer not null default 0,    -- 0 = contínuo; senão o ano civil
  current_number integer not null,              -- PRÓXIMO número a emitir
  updated_at     timestamptz not null default timezone('utc', now()),
  unique (doc_id, secretaria, year)
);

create index if not exists ix_document_counters_doc on public.document_counters (doc_id);

alter table public.document_counters enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'document_counters'
       and policyname = 'Enable all access for all users'
  ) then
    create policy "Enable all access for all users"
      on public.document_counters for all using (true) with check (true);
  end if;
end $$;

-- 3. Coluna de bucket na reserva (para o índice de unicidade ser ciente do bucket)
alter table public.reservations
  add column if not exists bucket_secretaria text not null default '';

-- 4. Semear document_counters a partir do contador global existente.
--    Todo doc nasce per_secretaria=false, então o bucket '' herda a
--    contagem atual e nada muda para os tipos que continuam globais.
insert into public.document_counters (doc_id, secretaria, year, current_number)
select
  d.id,
  '',
  case when coalesce(d.yearly_reset, false)
       then coalesce(d.last_reset_year, extract(year from now())::int)
       else 0 end,
  coalesce(d.current_number, d.start_number, 1)
from public.documents d
on conflict (doc_id, secretaria, year) do nothing;

-- 5. Índice de unicidade ciente do bucket.
--    Duas secretarias podem legitimamente gerar "Of. 001/2026" para o
--    mesmo doc_id; o bucket na chave evita colisão falsa. Para docs
--    globais o bucket é '' e o guard equivale ao antigo.
drop index if exists uq_reservations_doc_formatted;
create unique index if not exists uq_reservations_doc_bucket_formatted
  on public.reservations (doc_id, bucket_secretaria, formatted_number);

-- ============================================================
-- 6. RPC de reserva (reescrita) — serializa no contador do bucket
-- ============================================================
create or replace function public.reserve_number(
  p_doc_id  uuid,
  p_user_id uuid,
  p_subject text default null
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

  -- Regra de bucket
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
     user_id, user_name, user_cargo, user_setor, user_secretaria, bucket_secretaria)
  values
    (v_doc.id, v_doc.name, v_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
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
-- 7. RPC de configuração — admin define o próximo número de uma
--    secretaria para um tipo de documento (go-live), validando.
-- ============================================================
create or replace function public.set_secretaria_counter(
  p_doc_id     uuid,
  p_secretaria text,
  p_next_number integer,
  p_year       integer default null
) returns public.document_counters
language plpgsql
as $$
declare
  v_doc      public.documents%rowtype;
  v_sec      text;
  v_year     integer;
  v_max_used integer;
  v_row      public.document_counters%rowtype;
begin
  select * into v_doc from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento não encontrado'; end if;

  if p_next_number is null or p_next_number < 1 then
    raise exception 'Número inicial inválido';
  end if;

  -- Deriva o bucket a partir dos flags do documento
  if coalesce(v_doc.per_secretaria, false) then
    v_sec := coalesce(nullif(trim(p_secretaria), ''), '');
    if v_sec = '' then
      raise exception 'Informe a secretaria';
    end if;
  else
    -- Documento global: só existe o bucket '' (ignora secretaria informada)
    v_sec := '';
  end if;

  v_year := case when coalesce(v_doc.yearly_reset, false)
                 then coalesce(p_year, extract(year from now())::int)
                 else 0 end;

  -- Não permitir definir número <= maior já reservado naquele bucket/ano
  select max(number) into v_max_used
    from public.reservations
   where doc_id = p_doc_id
     and bucket_secretaria = v_sec
     and (
       not coalesce(v_doc.yearly_reset, false)
       or formatted_number like '%/' || v_year
     );

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
$$;
