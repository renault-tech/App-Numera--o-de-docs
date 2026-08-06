-- ============================================================
-- 0011 — Múltiplas secretarias de destino na reserva
--
-- Até aqui uma reserva tinha UMA secretaria de destino (`dest_secretaria
-- text`). Na prática um mesmo ofício/memorando costuma ser endereçado a
-- várias secretarias de uma vez — ou a todas elas (circular). Esta migração
-- troca o campo único por uma LISTA (`dest_secretarias jsonb`), mantendo o
-- campo antigo preenchido com a lista formatada para leitura.
--
-- Por que manter as duas colunas:
--   • `dest_secretarias` (jsonb) é a fonte da verdade — permite filtrar/
--     contar por secretaria de destino no futuro sem quebrar strings;
--   • `dest_secretaria` (text) segue existindo com o rótulo já montado
--     ("Educação, Saúde"), então relatórios, buscas e qualquer frontend
--     ainda em cache continuam funcionando sem enxergar a coluna nova.
--     Quem escreve as duas é sempre a função — nunca o cliente.
--
-- "Todas as secretarias" é gravado como um VALOR SENTINELA dentro da lista
-- (mesmo padrão do já existente "Externo / Outro órgão"), e não expandido
-- para os nomes das secretarias do momento. Assim a intenção original fica
-- registrada de forma auditável: a reserva foi endereçada a *todas*, e não
-- a uma fotografia da lista de secretarias daquele dia.
--
-- Como aplicar: cole no SQL Editor do Supabase e execute. Idempotente e
-- retrocompatível — os parâmetros novos têm default null, então uma aba
-- antiga ainda aberta continua reservando normalmente pelo campo único.
-- ============================================================

-- ============================================================
-- 1. Coluna nova + backfill a partir do campo único
-- ============================================================
alter table public.reservations
  add column if not exists dest_secretarias jsonb not null default '[]'::jsonb;

update public.reservations
   set dest_secretarias = jsonb_build_array(trim(dest_secretaria))
 where dest_secretarias = '[]'::jsonb
   and nullif(trim(coalesce(dest_secretaria, '')), '') is not null;

-- ============================================================
-- 2. reserve_number — mesma lógica da 0010, + lista de destinos
-- ============================================================
drop function if exists public.reserve_number(uuid, uuid, text, text, text, text, text, date);

create or replace function public.reserve_number(
  p_doc_id           uuid,
  p_user_id          uuid,
  p_subject          text  default null,
  p_dest_secretaria  text  default null,
  p_dest_nome        text  default null,
  p_dest_setor       text  default null,
  p_observacoes      text  default null,
  p_sent_at          date  default null,
  p_dest_secretarias jsonb default null
) returns public.reservations
language plpgsql
as $$
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

  -- Destino: prefere a lista nova; cai no campo único quando a chamada vem
  -- de um frontend ainda em cache (retrocompatibilidade da janela de deploy).
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

  -- Lock pessimista na linha do bucket — é isso que torna a reserva atômica.
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
$$;

-- ============================================================
-- 3. update_reservation — idem, com o antes→depois da lista de destinos
-- ============================================================
drop function if exists public.update_reservation(uuid, uuid, text, text, text, text, text, date);

create or replace function public.update_reservation(
  p_reservation_id   uuid,
  p_user_id          uuid,
  p_subject          text,
  p_dest_secretaria  text,
  p_dest_nome        text,
  p_dest_setor       text  default null,
  p_observacoes      text  default null,
  p_sent_at          date  default null,
  p_dest_secretarias jsonb default null
) returns public.reservations
language plpgsql
as $$
declare
  v_res        public.reservations%rowtype;
  v_user       public.users%rowtype;
  v_old_sub    text; v_old_sec text; v_old_nome text; v_old_setor text; v_old_obs text;
  v_new_sub    text; v_new_sec text; v_new_nome text; v_new_setor text; v_new_obs text;
  v_old_sent   text; v_new_sent text;
  v_dest_secs  jsonb;
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

  -- Destino: mesma regra de compatibilidade do reserve_number
  if p_dest_secretarias is not null
     and jsonb_typeof(p_dest_secretarias) = 'array'
     and jsonb_array_length(p_dest_secretarias) > 0 then
    v_dest_secs := p_dest_secretarias;
  elsif nullif(trim(coalesce(p_dest_secretaria, '')), '') is not null then
    v_dest_secs := jsonb_build_array(trim(p_dest_secretaria));
  else
    v_dest_secs := '[]'::jsonb;
  end if;

  -- Valores antigos e novos normalizados (para comparar e registrar)
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
$$;

notify pgrst, 'reload schema';
