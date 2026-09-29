-- Complementa admin_desativar_usuario (PR1): sem esta RPC, uma vez
-- desativado, um usuario nao tinha como ser reativado a nao ser por SQL
-- direto. Preparação do PR3 (docs/PLANO_MIGRACAO_AUTH.md) -- aditiva, zero
-- efeito visivel ate o front chamar (fora da janela das 17h de proposito,
-- mesma logica ja usada no PR1: nada aqui muda comportamento de quem
-- ainda usa o login legado).
create or replace function public.admin_reativar_usuario(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin public.users%rowtype;
  v_alvo  public.users%rowtype;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem reativar usuários';
  end if;
  select * into v_admin from public.users where id = auth.uid();

  select * into v_alvo from public.users where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;

  update public.users set ativo = true where id = p_user_id returning * into v_alvo;

  insert into public.logs (type, action, details, user_id, user_name)
  values ('cadastro', 'Reativou usuário', v_alvo.name, v_admin.id, v_admin.name);

  return v_alvo;
end;
$$;

revoke all on function public.admin_reativar_usuario(uuid) from public;
grant execute on function public.admin_reativar_usuario(uuid) to authenticated, service_role;
