-- ============================================================
-- 0002 — Reserva atômica de números (elimina condição de corrida)
--
-- Antes: o navegador lia current_number, inseria a reserva e depois
-- incrementava o contador em passos separados. Dois usuários
-- simultâneos podiam receber O MESMO número — exatamente o problema
-- que o sistema existe para impedir (RN-01, docs/01-visao-geral.md).
--
-- Agora: a função reserve_number() faz tudo numa única transação com
-- lock de linha (FOR UPDATE). O frontend chama via supabase.rpc() e,
-- se a função não existir, cai no fluxo antigo (compatibilidade).
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do projeto
-- Supabase e execute.
-- ============================================================

create or replace function public.reserve_number(
  p_doc_id  uuid,
  p_user_id uuid,
  p_subject text default null
) returns public.reservations
language plpgsql
as $$
declare
  v_doc       public.documents%rowtype;
  v_user      public.users%rowtype;
  v_year      integer := extract(year from now())::integer;
  v_formatted text;
  v_res       public.reservations;
begin
  -- Lock pessimista: serializa reservas concorrentes do mesmo documento
  select * into v_doc from public.documents where id = p_doc_id for update;
  if not found then
    raise exception 'Documento não encontrado';
  end if;
  if not coalesce(v_doc.enabled, true) then
    raise exception 'Documento desativado';
  end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado';
  end if;
  if coalesce(v_user.approved, false) = false and v_user.role <> 'admin' then
    raise exception 'Usuário aguarda aprovação do administrador';
  end if;
  if v_user.role = 'user_readonly' then
    raise exception 'Usuário somente leitura não pode reservar números';
  end if;
  if v_user.role = 'user_restricted'
     and not (v_doc.id::text in (select jsonb_array_elements_text(coalesce(v_user.allowed_documents, '[]'::jsonb)))) then
    raise exception 'Sem permissão para este tipo de documento';
  end if;

  -- Reset anual preguiçoso (funciona mesmo sem job agendado)
  if coalesce(v_doc.yearly_reset, false) and coalesce(v_doc.last_reset_year, 0) <> v_year then
    v_doc.current_number  := v_doc.start_number;
    v_doc.last_reset_year := v_year;
  end if;

  -- Mesmo formato usado pelo frontend (formatNumber em app.js)
  v_formatted := trim(
    coalesce(v_doc.prefix || ' ', '') ||
    lpad(v_doc.current_number::text, 3, '0') ||
    case when coalesce(v_doc.yearly_reset, false) then '/' || v_year else '' end
  );

  insert into public.reservations
    (doc_id, doc_name, number, formatted_number, subject,
     user_id, user_name, user_cargo, user_setor, user_secretaria)
  values
    (v_doc.id, v_doc.name, v_doc.current_number, v_formatted, nullif(trim(coalesce(p_subject, '')), ''),
     v_user.id, v_user.name, v_user.cargo, v_user.setor, v_user.secretaria)
  returning * into v_res;

  update public.documents
     set current_number  = v_doc.current_number + 1,
         last_reset_year = v_doc.last_reset_year
   where id = v_doc.id;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('reserva', 'Reservou ' || v_doc.name, 'Número: ' || v_formatted, v_user.id, v_user.name);

  return v_res;
end;
$$;

-- Rede de segurança final da RN-01: mesmo que algum caminho fora da função
-- tente gravar, o banco recusa número formatado repetido no mesmo documento.
-- (Se este índice falhar por duplicatas pré-existentes, localize-as com:
--   select doc_id, formatted_number, count(*) from public.reservations
--    group by 1,2 having count(*) > 1;
--  resolva os casos e rode o create index novamente.)
create unique index if not exists uq_reservations_doc_formatted
  on public.reservations (doc_id, formatted_number);
