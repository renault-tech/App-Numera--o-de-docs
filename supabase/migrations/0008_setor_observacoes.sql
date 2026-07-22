-- ============================================================
-- 0008 — Setor de destino (opcional) + Observações da reserva
--
-- Ao reservar um número, além da secretaria de destino e do destinatário,
-- o usuário pode informar um SETOR específico daquela secretaria (livre,
-- texto) e uma OBSERVAÇÃO sobre o documento. Ambos opcionais, aparecem no
-- histórico (detalhe da reserva) e podem ser editados (log antes→depois,
-- mesmo padrão da migração 0006).
--
-- Como aplicar: cole no SQL Editor do Supabase e execute. Idempotente e
-- retrocompatível (frontend antigo continua funcionando — novos parâmetros
-- têm default null).
-- ============================================================

-- 1. Colunas novas em reservations
alter table public.reservations
  add column if not exists dest_setor  text,
  add column if not exists observacoes text;

-- ============================================================
-- 2. reserve_number — mesma lógica da 0006, só acrescenta os dois campos
-- ============================================================
drop function if exists public.reserve_number(uuid, uuid, text, text, text);

create or replace function public.reserve_number(
  p_doc_id          uuid,
  p_user_id         uuid,
  p_subject         text default null,
  p_dest_secretaria text default null,
  p_dest_nome       text default null,
  p_dest_setor      text default null,
  p_observacoes     text default null
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

  -- Formato idêntico ao formatNumber() do app.js — largura mínima de 3
  -- dígitos SEM truncar (greatest evita o corte do lpad com 4+ dígitos).
  v_formatted := trim(
    coalesce(v_doc.prefix || ' ', '') ||
    lpad(v_number::text, greatest(3, length(v_number::text)), '0') ||
    case when coalesce(v_doc.yearly_reset, false) then '/' || v_year else '' end
  );

  insert into public.reservations
    (doc_id, doc_name, number, formatted_number, subject,
     dest_secretaria, dest_nome, dest_setor, observacoes,
     user_id, user_name, user_cargo, user_setor, user_secretaria, bucket_secretaria)
  values
    (v_doc.id, v_doc.name, v_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
     nullif(trim(coalesce(p_dest_secretaria, '')), ''), nullif(trim(coalesce(p_dest_nome, '')), ''),
     nullif(trim(coalesce(p_dest_setor, '')), ''), nullif(trim(coalesce(p_observacoes, '')), ''),
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
-- 3. update_reservation — mesma lógica da 0006, agora comparando também
--    setor de destino e observações (log antes→depois só do que mudou)
-- ============================================================
drop function if exists public.update_reservation(uuid, uuid, text, text, text);

create or replace function public.update_reservation(
  p_reservation_id  uuid,
  p_user_id         uuid,
  p_subject         text,
  p_dest_secretaria text,
  p_dest_nome       text,
  p_dest_setor      text default null,
  p_observacoes     text default null
) returns public.reservations
language plpgsql
as $$
declare
  v_res        public.reservations%rowtype;
  v_user       public.users%rowtype;
  v_old_sub    text; v_old_sec text; v_old_nome text; v_old_setor text; v_old_obs text;
  v_new_sub    text; v_new_sec text; v_new_nome text; v_new_setor text; v_new_obs text;
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
  v_new_sub   := coalesce(nullif(trim(coalesce(p_subject, '')), ''), '');
  v_new_sec   := coalesce(nullif(trim(coalesce(p_dest_secretaria, '')), ''), '');
  v_new_nome  := coalesce(nullif(trim(coalesce(p_dest_nome, '')), ''), '');
  v_new_setor := coalesce(nullif(trim(coalesce(p_dest_setor, '')), ''), '');
  v_new_obs   := coalesce(nullif(trim(coalesce(p_observacoes, '')), ''), '');

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

  v_changes := trim(both E'\n' from v_changes);
  if v_changes = '' then v_changes := 'Sem alterações de conteúdo'; end if;

  update public.reservations
     set subject         = nullif(v_new_sub, ''),
         dest_secretaria = nullif(v_new_sec, ''),
         dest_nome       = nullif(v_new_nome, ''),
         dest_setor      = nullif(v_new_setor, ''),
         observacoes     = nullif(v_new_obs, ''),
         edited_at       = timezone('utc', now())
   where id = p_reservation_id
   returning * into v_res;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('edicao', 'Editou reserva ' || v_res.formatted_number,
          v_res.doc_name || E'\n' || v_changes, v_user.id, v_user.name);

  return v_res;
end;
$$;
