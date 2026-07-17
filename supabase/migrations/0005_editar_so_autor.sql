-- ============================================================
-- 0005 — Edição de reserva restrita ao autor
--
-- Reforço de regra: a EDIÇÃO de ementa/destinatário passa a ser exclusiva
-- de quem reservou o número — nem o administrador reescreve dados de
-- terceiros (a edição fica sempre atribuída ao autor).
--
-- A ANULAÇÃO (cancel_reservation) NÃO muda: continua permitida ao dono OU
-- ao admin, como rede de segurança (permite invalidar um número errado
-- mesmo que o autor tenha saído/faltado), sempre com motivo e log.
--
-- Como aplicar: cole no SQL Editor do Supabase e execute. Idempotente.
-- Retrocompatível: só endurece a permissão de update_reservation.
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

  -- Edição exclusiva do autor (sem exceção para admin)
  if v_res.user_id <> v_user.id then
    raise exception 'Apenas quem reservou pode editar esta reserva';
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
