-- Aparência por pessoa (acompanha a conta entre computadores). Aditivo: colunas nulas = padrão do app.
alter table public.users add column if not exists pref_tema text check (pref_tema in ('auto','claro','escuro'));
alter table public.users add column if not exists pref_estilo text check (pref_estilo in ('apple','classico'));

create or replace function public.salvar_preferencias(p_tema text, p_estilo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sem sessão'; end if;
  update public.users
     set pref_tema = coalesce(p_tema, pref_tema),
         pref_estilo = coalesce(p_estilo, pref_estilo)
   where id = v_uid;
end $$;
revoke execute on function public.salvar_preferencias(text,text) from public, anon;
grant execute on function public.salvar_preferencias(text,text) to authenticated, service_role;
