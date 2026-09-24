-- Teste transacional de PR1 (docs/PLANO_MIGRACAO_AUTH.md), migrations
-- 20260924060000_pr1_auth_uid_compat_e_rpcs_admin.sql +
-- 20260924060001_pr1_fix_trigger_functions_grant_publico.sql.
-- Roda contra o schema JÁ APLICADO (não redefine as funções) — é um teste
-- de regressão para rodar de novo no futuro, não o roteiro que validou a
-- migration antes de aplicar pela primeira vez.
--
-- 26 cenários (com sub-testes T2b/T3b/T4b/T8b/T12b, total 30 checagens):
-- helpers de identidade (eh_admin/usuario_aprovado) bloqueados/liberados
-- corretamente por perfil e sessão; trigger de cadastro cria perfil com
-- defaults de secretaria e resolve colisão de username sem sobrescrever
-- linha existente; trigger de logs força identidade real só com sessão;
-- reserve_number/set_secretaria_counter funcionam tanto no modo legado
-- (sem sessão, com telemetria) quanto com sessão real (auth.uid()),
-- bloqueando identidade forjada; as 6 RPCs de admin (aprovar/atualizar/
-- aplicar padrão/desativar) respeitam eh_admin(), bloqueiam auto-
-- rebaixamento/auto-desativação e protegem o último admin ATIVO restante
-- (achado real: a base tem 3 contas admin, não só uma — o teste isola
-- todas dentro da transação para exercitar a contagem de verdade, sem
-- nunca commitar a desativação temporária); salvar_ordem_cards e
-- marcar_login_origem exigem/toleram sessão conforme o esperado.
begin;

do $$
declare
  v_admin_id    uuid := '42fade22-5214-4943-89a5-5944fd2afc67'; -- admin real (renaultdecastro@gmail.com)
  v_ludmila_id  uuid := '4fd2ae81-33e7-4351-8169-7a1b86e05bed'; -- aprovada, não-admin, secretaria Fazenda
  v_temp_pend   uuid := gen_random_uuid();
  v_temp_admin1 uuid := gen_random_uuid();
  v_temp_admin2 uuid := gen_random_uuid();
  v_temp_full   uuid := gen_random_uuid(); -- role user_full, sem depender de allowed_documents
  v_res         text := '';
  v_doc_fazenda uuid;
  v_bool        boolean;
  v_row         record;
begin
  -- pega um documento qualquer pra usar nos testes de reserva
  select id into v_doc_fazenda from public.documents where enabled limit 1;

  -- linhas de teste, nunca tocando dados reais além do já existente admin/Ludmila (só leitura neles)
  insert into public.users (id, username, password, name, role, approved, secretaria, allowed_documents, ativo)
  values (v_temp_pend, 'pr1.pendente', 'teste123', 'PR1 Pendente Teste', 'user_restricted', false, 'Fazenda', '[]'::jsonb, true);
  insert into public.users (id, username, password, name, role, approved, ativo)
  values (v_temp_admin1, 'pr1.admin1', 'teste123', 'PR1 Admin1 Teste', 'admin', true, true);
  insert into public.users (id, username, password, name, role, approved, ativo)
  values (v_temp_admin2, 'pr1.admin2', 'teste123', 'PR1 Admin2 Teste', 'admin', true, true);
  insert into public.users (id, username, password, name, role, approved, secretaria, ativo)
  values (v_temp_full, 'pr1.full', 'teste123', 'PR1 Full Teste', 'user_full', true, 'Fazenda', true);

  -- T1: helpers bloqueados para anon
  set local role anon;
  begin
    perform public.eh_admin();
    v_res := v_res || 'T1-FALHOU(eh_admin rodou como anon); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T1-OK(eh_admin bloqueado p/ anon); ';
  end;
  reset role;

  -- T2: eh_admin/usuario_aprovado como admin real
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  select public.eh_admin() into v_bool;
  v_res := v_res || case when v_bool then 'T2-OK(eh_admin true p/ admin real); ' else 'T2-FALHOU; ' end;
  select public.usuario_aprovado() into v_bool;
  v_res := v_res || case when v_bool then 'T2b-OK(usuario_aprovado true p/ admin); ' else 'T2b-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T3: eh_admin false / usuario_aprovado true p/ Ludmila (não-admin aprovada)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  select public.eh_admin() into v_bool;
  v_res := v_res || case when not v_bool then 'T3-OK(eh_admin false p/ Ludmila); ' else 'T3-FALHOU; ' end;
  select public.usuario_aprovado() into v_bool;
  v_res := v_res || case when v_bool then 'T3b-OK(usuario_aprovado true p/ Ludmila); ' else 'T3b-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T4: usuario_aprovado false p/ pendente
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_temp_pend::text, 'role', 'authenticated')::text, true);
  select public.usuario_aprovado() into v_bool;
  v_res := v_res || case when not v_bool then 'T4-OK(usuario_aprovado false p/ pendente); ' else 'T4-FALHOU; ' end;
  select public.eh_admin() into v_bool;
  v_res := v_res || case when not v_bool then 'T4b-OK(eh_admin false p/ pendente); ' else 'T4b-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T5: trigger de cadastro cria perfil com metadata (secretaria com default configurado)
  declare v_novo_id uuid := gen_random_uuid(); v_criado public.users%rowtype;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_novo_id, 'pr1.trigger@example.com',
            jsonb_build_object('name','PR1 Trigger Teste','username','pr1.trigger','cargo','Analista','setor','TI','secretaria','Fazenda'));
    select * into v_criado from public.users where id = v_novo_id;
    if v_criado.id is null then
      v_res := v_res || 'T5-FALHOU(nenhuma linha criada); ';
    elsif v_criado.role = 'user_restricted' and v_criado.approved = false and v_criado.username = 'pr1.trigger'
          and v_criado.secretaria = 'Fazenda' and jsonb_array_length(coalesce(v_criado.allowed_documents,'[]'::jsonb)) > 0 then
      v_res := v_res || 'T5-OK(perfil criado com defaults de Fazenda, ' || jsonb_array_length(v_criado.allowed_documents) || ' docs); ';
    else
      v_res := v_res || 'T5-FALHOU(dados inesperados: role=' || v_criado.role || ' approved=' || v_criado.approved || ' username=' || v_criado.username || '); ';
    end if;
  end;

  -- T6: colisão de username gera sufixo em vez de falhar
  declare v_novo_id2 uuid := gen_random_uuid(); v_criado2 public.users%rowtype;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_novo_id2, 'pr1.colisao@example.com', jsonb_build_object('name','PR1 Colisao','username','admin'));
    select * into v_criado2 from public.users where id = v_novo_id2;
    if v_criado2.username is not null and v_criado2.username <> 'admin' and v_criado2.username like 'admin%' then
      v_res := v_res || 'T6-OK(colisão resolvida: username=' || v_criado2.username || '); ';
    else
      v_res := v_res || 'T6-FALHOU(username=' || coalesce(v_criado2.username,'NULL') || '); ';
    end if;
  end;

  -- T7: trigger não sobrescreve quando id já existe em public.users
  declare v_dup_id uuid := gen_random_uuid(); v_dup public.users%rowtype;
  begin
    insert into public.users (id, username, password, name, role, approved, ativo)
    values (v_dup_id, 'pr1.jaexiste', 'teste123', 'Nome Original', 'user_full', true, true);
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_dup_id, 'pr1.dup@example.com', jsonb_build_object('name','Nome Do Trigger','username','outro.nome'));
    select * into v_dup from public.users where id = v_dup_id;
    if v_dup.name = 'Nome Original' and v_dup.username = 'pr1.jaexiste' and v_dup.role = 'user_full' then
      v_res := v_res || 'T7-OK(on conflict do nothing preservou a linha existente); ';
    else
      v_res := v_res || 'T7-FALHOU(nome=' || v_dup.name || ' username=' || v_dup.username || '); ';
    end if;
  end;

  -- T8: trigger de logs sobrescreve identidade só com sessão real
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  declare v_log_id uuid; v_log record;
  begin
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Teste PR1', 'tentando impersonar', v_admin_id, 'Impostor')
    returning id into v_log_id;
    select * into v_log from public.logs where id = v_log_id;
    if v_log.user_id = v_ludmila_id and v_log.user_name = 'Ludmila Fontoura' then
      v_res := v_res || 'T8-OK(log corrigido p/ identidade real da sessão); ';
    else
      v_res := v_res || 'T8-FALHOU(user_id=' || v_log.user_id || ' user_name=' || v_log.user_name || '); ';
    end if;
  end;
  reset role; reset request.jwt.claims;

  -- T8b: sem sessão, log preserva o que o cliente mandou (compat. legado)
  declare v_log_id2 uuid; v_log2 record;
  begin
    insert into public.logs (type, action, details, user_id, user_name)
    values ('sistema', 'Teste PR1 legado', 'sem sessão', v_admin_id, 'Nome Enviado Pelo Cliente')
    returning id into v_log_id2;
    select * into v_log2 from public.logs where id = v_log_id2;
    if v_log2.user_id = v_admin_id and v_log2.user_name = 'Nome Enviado Pelo Cliente' then
      v_res := v_res || 'T8b-OK(sem sessão preserva valor do cliente); ';
    else
      v_res := v_res || 'T8b-FALHOU; ';
    end if;
  end;

  -- T9: reserve_number legado (sem sessão) ainda funciona, com telemetria
  -- (usa v_temp_full, role user_full — não depende de allowed_documents,
  -- então o teste não fica refém de quais documentos a Ludmila tem hoje)
  declare v_count_antes int; v_count_depois int; v_res_row public.reservations%rowtype;
  begin
    select count(*) into v_count_antes from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'reserve_number%';
    v_res_row := public.reserve_number(v_doc_fazenda, v_temp_full);
    select count(*) into v_count_depois from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'reserve_number%';
    if v_res_row.id is not null and v_count_depois = v_count_antes + 1 then
      v_res := v_res || 'T9-OK(reserve_number legado funcionou + telemetria); ';
    else
      v_res := v_res || 'T9-FALHOU; ';
    end if;
  end;

  -- T10: reserve_number com sessão real, p_user_id batendo com auth.uid() — sem telemetria
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_temp_full::text, 'role', 'authenticated')::text, true);
  declare v_count_antes2 int; v_count_depois2 int; v_res_row2 public.reservations%rowtype;
  begin
    select count(*) into v_count_antes2 from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'reserve_number%';
    v_res_row2 := public.reserve_number(v_doc_fazenda, v_temp_full);
    select count(*) into v_count_depois2 from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'reserve_number%';
    if v_res_row2.id is not null and v_count_depois2 = v_count_antes2 then
      v_res := v_res || 'T10-OK(reserve_number com sessão real, sem telemetria); ';
    else
      v_res := v_res || 'T10-FALHOU; ';
    end if;
  end;

  -- T11: reserve_number com sessão real mas p_user_id de outra pessoa — bloqueado
  begin
    perform public.reserve_number(v_doc_fazenda, v_admin_id);
    v_res := v_res || 'T11-FALHOU(deveria ter bloqueado); ';
  exception when others then
    if sqlerrm like '%Identidade não confere%' then
      v_res := v_res || 'T11-OK(bloqueado: identidade não confere); ';
    else
      v_res := v_res || 'T11-FALHOU(erro inesperado: ' || sqlerrm || '); ';
    end if;
  end;
  reset role; reset request.jwt.claims;

  -- T12: set_secretaria_counter — não-admin bloqueado, admin passa, legado passa com telemetria
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_secretaria_counter(v_doc_fazenda, 'Fazenda', 9000);
    v_res := v_res || 'T12-FALHOU(não-admin conseguiu); ';
  exception when others then
    if sqlerrm like '%administradores%' then v_res := v_res || 'T12-OK(não-admin bloqueado); ';
    else v_res := v_res || 'T12-FALHOU(erro: ' || sqlerrm || '); '; end if;
  end;
  reset role; reset request.jwt.claims;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_secretaria_counter(v_doc_fazenda, 'Fazenda', 9001);
    v_res := v_res || 'T12b-OK(admin com sessão real conseguiu); ';
  exception when others then
    v_res := v_res || 'T12b-FALHOU(' || sqlerrm || '); ';
  end;
  reset role; reset request.jwt.claims;

  declare v_count_antes3 int; v_count_depois3 int;
  begin
    select count(*) into v_count_antes3 from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'set_secretaria_counter%';
    perform public.set_secretaria_counter(v_doc_fazenda, 'Fazenda', 9002);
    select count(*) into v_count_depois3 from public.logs where action = 'Chamada sem sessão (compat.)' and details like 'set_secretaria_counter%';
    if v_count_depois3 = v_count_antes3 + 1 then
      v_res := v_res || 'T13-OK(set_secretaria_counter legado passou + telemetria); ';
    else
      v_res := v_res || 'T13-FALHOU; ';
    end if;
  end;

  -- T14: admin_atualizar_usuario — não-admin bloqueado
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_atualizar_usuario(v_temp_pend, 'X', null, null, 'Fazenda', 'pr1.pendente', 'user_restricted', '[]'::jsonb);
    v_res := v_res || 'T14-FALHOU(não-admin conseguiu editar); ';
  exception when others then
    v_res := v_res || 'T14-OK(não-admin bloqueado); ';
  end;
  reset role; reset request.jwt.claims;

  -- T15: admin_atualizar_usuario — admin edita usuário de teste
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  declare v_editado public.users%rowtype;
  begin
    v_editado := public.admin_atualizar_usuario(v_temp_pend, 'PR1 Pendente Editado', 'Cargo X', 'Setor Y', 'Fazenda', 'pr1.pendente', 'user_restricted', '["a"]'::jsonb);
    if v_editado.name = 'PR1 Pendente Editado' and v_editado.cargo = 'Cargo X' then
      v_res := v_res || 'T15-OK(admin editou usuário); ';
    else
      v_res := v_res || 'T15-FALHOU; ';
    end if;
  end;

  -- T16: admin_atualizar_usuario — self-demote bloqueado
  begin
    perform public.admin_atualizar_usuario(v_admin_id, 'Administrador', null, null, null, 'admin', 'user_full', '[]'::jsonb);
    v_res := v_res || 'T16-FALHOU(auto-rebaixamento passou); ';
  exception when others then
    if sqlerrm like '%próprio acesso%' then v_res := v_res || 'T16-OK(auto-rebaixamento bloqueado); ';
    else v_res := v_res || 'T16-FALHOU(erro: ' || sqlerrm || '); '; end if;
  end;

  -- T17: admin_atualizar_usuario — proteção do último admin ATIVO, isolada
  -- da proteção de auto-rebaixamento (guarda diferente, checada ANTES no
  -- corpo da função: "if v_alvo.id = auth.uid() then raise" vem antes da
  -- contagem). Se chamador = alvo, é sempre o guard de auto-rebaixamento
  -- que dispara (T16 já cobre isso) — pra exercitar de fato a contagem,
  -- o alvo tem que ser OUTRO admin. A base real tem 3 contas admin, não
  -- só uma — desativa TODAS temporariamente (revertido logo depois,
  -- nunca commitado) para deixar só v_temp_admin1 ativo entre os admins;
  -- a sessão vira v_temp_admin1 (chamador) tentando rebaixar v_temp_admin2
  -- (alvo diferente, já inativo, role ainda 'admin') — chamador != alvo,
  -- então só a contagem de admins ativos (=1, só v_temp_admin1) pode bloquear.
  update public.users set ativo = false where role = 'admin' and id <> v_temp_admin1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_temp_admin1::text, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_atualizar_usuario(v_temp_admin2, 'PR1 Admin2', null, null, null, 'pr1.admin2', 'user_full', '[]'::jsonb);
    v_res := v_res || 'T17-FALHOU(rebaixou admin com só 1 admin ativo restante); ';
  exception when others then
    if sqlerrm like '%único administrador%' then v_res := v_res || 'T17-OK(último admin ativo protegido, chamador != alvo); ';
    else v_res := v_res || 'T17-FALHOU(erro: ' || sqlerrm || '); '; end if;
  end;
  update public.users set ativo = true where role = 'admin' and id <> v_temp_admin1;
  reset role; reset request.jwt.claims;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  -- T18: admin_aprovar_usuario aplica default da secretaria
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  declare v_aprovado public.users%rowtype;
  begin
    update public.users set allowed_documents = '[]'::jsonb where id = v_temp_pend;
    v_aprovado := public.admin_aprovar_usuario(v_temp_pend);
    if v_aprovado.approved = true and jsonb_array_length(coalesce(v_aprovado.allowed_documents,'[]'::jsonb)) > 0 then
      v_res := v_res || 'T18-OK(aprovado com defaults de Fazenda); ';
    else
      v_res := v_res || 'T18-FALHOU; ';
    end if;
  end;

  -- T19: admin_desativar_usuario — não pode a si mesmo
  begin
    perform public.admin_desativar_usuario(v_admin_id);
    v_res := v_res || 'T19-FALHOU(auto-desativação passou); ';
  exception when others then
    v_res := v_res || 'T19-OK(auto-desativação bloqueada); ';
  end;

  -- T20: admin_desativar_usuario funciona em terceiro
  declare v_desativado public.users%rowtype;
  begin
    v_desativado := public.admin_desativar_usuario(v_temp_pend);
    if v_desativado.ativo = false then v_res := v_res || 'T20-OK(desativação funcionou); ';
    else v_res := v_res || 'T20-FALHOU; '; end if;
  end;

  -- T21: admin_aplicar_padrao_secretaria
  declare v_qtd int;
  begin
    select public.admin_aplicar_padrao_secretaria('Fazenda', (select value -> 'Fazenda' from public.app_config where key='secretariaPermissions')) into v_qtd;
    v_res := v_res || 'T21-OK(aplicou padrão a ' || v_qtd || ' usuário(s)); ';
  end;
  reset role; reset request.jwt.claims;

  -- T22: admin_* bloqueadas para anon
  set local role anon;
  begin
    perform public.admin_aprovar_usuario(v_temp_pend);
    v_res := v_res || 'T22-FALHOU(anon conseguiu); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T22-OK(anon bloqueado em admin_aprovar_usuario); ';
  end;
  reset role;

  -- T23: salvar_ordem_cards
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.salvar_ordem_cards('["x","y"]'::jsonb);
    select card_order into v_row from public.users where id = v_ludmila_id;
    v_res := v_res || 'T23-OK(salvar_ordem_cards executou); ';
  end;
  reset role; reset request.jwt.claims;

  begin
    perform public.salvar_ordem_cards('["x"]'::jsonb);
    v_res := v_res || 'T24-FALHOU(sem sessão conseguiu); ';
  exception when others then
    v_res := v_res || 'T24-OK(sem sessão bloqueado); ';
  end;

  -- T25: marcar_login_origem
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ludmila_id::text, 'role', 'authenticated')::text, true);
  begin
    perform public.marcar_login_origem('hub');
    select ultimo_acesso_origem, veio_do_hub_em into v_row from public.users where id = v_ludmila_id;
    if v_row.ultimo_acesso_origem = 'hub' and v_row.veio_do_hub_em is not null then
      v_res := v_res || 'T25-OK(marcar_login_origem hub); ';
    else
      v_res := v_res || 'T25-FALHOU; ';
    end if;
  end;
  reset role; reset request.jwt.claims;

  begin
    perform public.marcar_login_origem('direto');
    v_res := v_res || 'T26-OK(sem sessão não quebra, silencioso); ';
  exception when others then
    v_res := v_res || 'T26-FALHOU(' || sqlerrm || '); ';
  end;

  raise exception 'RESULTADO DOS TESTES PR1: %', v_res;
end $$;

rollback;
