-- ============================================================
-- 0010 — Data de envio do documento + rede de segurança numérica da RN-01
--
-- Duas mudanças independentes:
--
-- 1) DATA DE ENVIO (sent_at): campo opcional na reserva para registrar quando
--    o documento foi efetivamente enviado, com lembrete de que isso deve
--    acontecer o quanto antes após a reserva do número. Pode ser preenchida
--    na hora ou depois, editando a reserva (mesma regra de autoria da 0005).
--
-- 2) UNICIDADE NUMÉRICA (bucket_year + índice novo): a reserva já é atômica e
--    à prova de corrida hoje (reserve_number trava a linha do bucket em
--    document_counters com FOR UPDATE dentro de uma transação — dois
--    cliques simultâneos já recebem números distintos). O que faltava é que
--    a REDE DE SEGURANÇA contra duplicidade (o índice único) era sobre a
--    STRING formatted_number, não sobre o número em si — se o formato ou o
--    prefixo do documento mudar no futuro, o mesmo número poderia gerar duas
--    strings diferentes e escapar do índice antigo. A coluna bucket_year
--    (o ano do bucket, já calculado em reserve_number/set_secretaria_counter,
--    0 quando o tipo não reinicia anualmente) permite um índice único sobre
--    (doc_id, bucket_secretaria, bucket_year, number) — a garantia direta que
--    o doc 03 §2 já previa. O índice antigo (sobre formatted_number)
--    permanece; os dois se complementam.
--
-- Como aplicar: cole no SQL Editor do Supabase e execute. Idempotente e
-- retrocompatível — os parâmetros novos das funções têm default null/0,
-- então um frontend antigo ainda em cache continua funcionando durante o
-- deploy (mudança aditiva, nada é removido antes da hora).
--
-- IMPORTANTE — pré-checagem antes de aplicar: rode
--   select doc_id, bucket_secretaria, number, count(*)
--     from public.reservations
--    group by doc_id, bucket_secretaria, number having count(*) > 1;
-- Se retornar alguma linha, PARE e resolva os duplicados antes de criar o
-- índice único da seção 3 (senão a criação do índice falha, o que é o
-- comportamento correto: melhor falhar aqui do que mascarar o problema).
-- ============================================================

-- ============================================================
-- 1. Coluna da data de envio
-- ============================================================
alter table public.reservations
  add column if not exists sent_at date;

-- ============================================================
-- 2. bucket_year — ano do bucket já usado implicitamente em reserve_number
--    e set_secretaria_counter, agora persistido como coluna própria.
-- ============================================================
alter table public.reservations
  add column if not exists bucket_year integer;

-- Backfill: extrai o ano do sufixo "/AAAA" de formatted_number quando o tipo
-- reinicia anualmente; senão 0 (numeração contínua).
update public.reservations r
   set bucket_year = case
         when coalesce(d.yearly_reset, false)
           then coalesce(nullif(substring(r.formatted_number from '/(\d{4})$'), '')::int,
                         extract(year from r.timestamp)::int)
         else 0
       end
  from public.documents d
 where d.id = r.doc_id
   and r.bucket_year is null;

-- Reservas com doc_id órfão (documento excluído) ficam no bucket contínuo.
update public.reservations set bucket_year = 0 where bucket_year is null;

alter table public.reservations alter column bucket_year set default 0;
alter table public.reservations alter column bucket_year set not null;

-- ============================================================
-- 3. Índice único numérico — reforça a RN-01 sem depender da formatação
-- ============================================================
create unique index if not exists uq_reservations_doc_bucket_year_number
  on public.reservations (doc_id, bucket_secretaria, bucket_year, number);

-- ============================================================
-- 4. reserve_number — mesma lógica da 0008, + sent_at e bucket_year
-- ============================================================
drop function if exists public.reserve_number(uuid, uuid, text, text, text, text, text);

create or replace function public.reserve_number(
  p_doc_id          uuid,
  p_user_id         uuid,
  p_subject         text default null,
  p_dest_secretaria text default null,
  p_dest_nome       text default null,
  p_dest_setor      text default null,
  p_observacoes     text default null,
  p_sent_at         date default null
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

  -- Lock pessimista na linha do bucket — é isso que torna a reserva atômica:
  -- uma segunda chamada concorrente espera aqui até a primeira terminar, e
  -- então lê o valor já incrementado. Nunca duas chamadas veem o mesmo número.
  select current_number into v_number
    from public.document_counters
   where doc_id = v_doc.id and secretaria = v_bucket_sec and year = v_bucket_year
   for update;

  -- Formato idêntico ao formatNumber() do app.js — largura mínima de 3
  -- dígitos SEM truncar (greatest evita o corte do lpad com 4+ dígitos).
  v_formatted := trim(
    coalesce(v_doc.prefix || ' ', '') ||
    lpad(v_number::text, greatest(3, length(v_number::text)), '0') ||
    case when coalesce(v_doc.yearly_reset, false) then '/' || v_year else '' end
  );

  insert into public.reservations
    (doc_id, doc_name, number, formatted_number, subject,
     dest_secretaria, dest_nome, dest_setor, observacoes, sent_at,
     user_id, user_name, user_cargo, user_setor, user_secretaria,
     bucket_secretaria, bucket_year)
  values
    (v_doc.id, v_doc.name, v_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
     nullif(trim(coalesce(p_dest_secretaria, '')), ''), nullif(trim(coalesce(p_dest_nome, '')), ''),
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
$$;

-- ============================================================
-- 5. update_reservation — mesma lógica da 0008, agora comparando também a
--    data de envio (log antes→depois só do que mudou)
-- ============================================================
drop function if exists public.update_reservation(uuid, uuid, text, text, text, text, text);

create or replace function public.update_reservation(
  p_reservation_id  uuid,
  p_user_id         uuid,
  p_subject         text,
  p_dest_secretaria text,
  p_dest_nome       text,
  p_dest_setor      text default null,
  p_observacoes     text default null,
  p_sent_at         date default null
) returns public.reservations
language plpgsql
as $$
declare
  v_res        public.reservations%rowtype;
  v_user       public.users%rowtype;
  v_old_sub    text; v_old_sec text; v_old_nome text; v_old_setor text; v_old_obs text;
  v_new_sub    text; v_new_sec text; v_new_nome text; v_new_setor text; v_new_obs text;
  v_old_sent   text; v_new_sent text;
  v_changes    text := '';
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if v_res.status <> 'ativa' then raise exception 'Reserva anulada não pode ser editada'; end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  -- Edição exclusiva do autor (sem exceção para admin)
  if v_res.user_id <> v_user.id then
    raise exception 'Apenas quem reservou pode editar esta reserva';
  end if;

  -- Valores antigos e novos normalizados (para comparar e registrar)
  v_old_sub   := coalesce(v_res.subject, '');
  v_old_sec   := coalesce(v_res.dest_secretaria, '');
  v_old_nome  := coalesce(v_res.dest_nome, '');
  v_old_setor := coalesce(v_res.dest_setor, '');
  v_old_obs   := coalesce(v_res.observacoes, '');
  v_old_sent  := coalesce(to_char(v_res.sent_at, 'DD/MM/YYYY'), '');
  v_new_sub   := coalesce(nullif(trim(coalesce(p_subject, '')), ''), '');
  v_new_sec   := coalesce(nullif(trim(coalesce(p_dest_secretaria, '')), ''), '');
  v_new_nome  := coalesce(nullif(trim(coalesce(p_dest_nome, '')), ''), '');
  v_new_setor := coalesce(nullif(trim(coalesce(p_dest_setor, '')), ''), '');
  v_new_obs   := coalesce(nullif(trim(coalesce(p_observacoes, '')), ''), '');
  v_new_sent  := coalesce(to_char(p_sent_at, 'DD/MM/YYYY'), '');

  if v_old_sub is distinct from v_new_sub then
    v_changes := v_changes || 'Ementa: "' || v_old_sub || '" → "' || v_new_sub || '"' || E'\n';
  end if;
  if v_old_sec is distinct from v_new_sec then
    v_changes := v_changes || 'Secretaria de destino: "' || v_old_sec || '" → "' || v_new_sec || '"' || E'\n';
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
     set subject         = nullif(v_new_sub, ''),
         dest_secretaria = nullif(v_new_sec, ''),
         dest_nome       = nullif(v_new_nome, ''),
         dest_setor      = nullif(v_new_setor, ''),
         observacoes     = nullif(v_new_obs, ''),
         sent_at         = p_sent_at,
         edited_at       = timezone('utc', now())
   where id = p_reservation_id
   returning * into v_res;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('edicao', 'Editou reserva ' || v_res.formatted_number,
          v_res.doc_name || E'\n' || v_changes, v_user.id, v_user.name);

  return v_res;
end;
$$;

-- ============================================================
-- 6. set_secretaria_counter — troca o casamento de string (formatted_number
--    like '%/' || v_year) por bucket_year = v_year, agora que a coluna existe
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
$$;

notify pgrst, 'reload schema';
