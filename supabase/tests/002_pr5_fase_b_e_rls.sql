-- Teste transacional do PR5 (docs/PLANO_MIGRACAO_AUTH.md, seções 2 fase B
-- e 4), migration 20260929120000_pr5_fase_b_rpcs_e_rls_real.sql.
-- Roda contra o schema JÁ APLICADO (não redefine funções/policies) — é um
-- teste de regressão para rodar de novo no futuro, não o roteiro que
-- validou a migration antes de aplicar pela primeira vez (esse rodou a
-- migration inteira dentro da própria transação de teste, sem nunca
-- commitar — ver histórico em CLAUDE.md).
--
-- 28 cenários: as 4 RPCs de negócio exigem auth.uid() de verdade (sem
-- mais o modo de compatibilidade sem sessão) e `anon` perde EXECUTE nelas;
-- set_secretaria_counter sempre exige eh_admin(), mesmo sem sessão nenhuma
-- (antes passava direto); RLS de `users` (cada um só a própria linha,
-- anon sem nada), `documents` (leitura por aprovado, escrita só admin),
-- `reservations` (regra exata de visibilidade por secretaria — pública
-- quando o documento não é per_secretaria, restrita à mesma secretaria de
-- quem reservou quando é, e só a própria reserva para quem não tem
-- secretaria), `document_counters` (leitura por aprovado), `logs` (leitura
-- só admin, insert exige identidade própria — e o trigger
-- logs_identidade_real corrige qualquer tentativa de forjar user_id antes
-- da RLS nem checar, então o insert nunca falha por isso, só a identidade
-- gravada é que nunca é a forjada) e `app_config` (leitura pública só das
-- chaves conhecidas, escrita só admin).
--
-- Lição registrada em CLAUDE.md, refletida aqui: RLS em UPDATE/DELETE não
-- lança exceção quando a USING clause filtra a linha — o comando só afeta
-- 0 linhas, silenciosamente. Testar isso com GET DIAGNOSTICS ROW_COUNT,
-- nunca com `exception when insufficient_privilege` (que só dispara para
-- negação de GRANT ou falha de WITH CHECK em INSERT).
begin;

do $$
declare
  v_admin_id    uuid := '42fade22-5214-4943-89a5-5944fd2afc67'; -- admin real
  v_fazenda_a   uuid := gen_random_uuid();
  v_fazenda_b   uuid := gen_random_uuid();
  v_saude       uuid := gen_random_uuid();
  v_sem_sec     uuid := gen_random_uuid();
  v_doc_geral   uuid := '338bd875-a503-4079-a527-0a11bea5c6b0'; -- Decreto, per_secretaria=false
  v_doc_sec     uuid := '5aadabd4-abb7-429d-b1b9-0d3f1873e3b1'; -- Ofício, per_secretaria=true
  v_res         text := '';
  v_row         record;
  v_count       int;
  v_bool        boolean;
begin
  insert into public.users (id, username, password, name, role, approved, secretaria, allowed_documents, ativo)
  values (v_fazenda_a, 'pr5.fazenda_a', 'x', 'PR5 Fazenda A', 'user_restricted', true, 'Fazenda', jsonb_build_array(v_doc_geral::text, v_doc_sec::text), true);
  insert into public.users (id, username, password, name, role, approved, secretaria, allowed_documents, ativo)
  values (v_fazenda_b, 'pr5.fazenda_b', 'x', 'PR5 Fazenda B', 'user_restricted', true, 'Fazenda', jsonb_build_array(v_doc_geral::text, v_doc_sec::text), true);
  insert into public.users (id, username, password, name, role, approved, secretaria, allowed_documents, ativo)
  values (v_saude, 'pr5.saude', 'x', 'PR5 Saude', 'user_restricted', true, 'Saúde', jsonb_build_array(v_doc_geral::text, v_doc_sec::text), true);
  insert into public.users (id, username, password, name, role, approved, secretaria, allowed_documents, ativo)
  values (v_sem_sec, 'pr5.semsec', 'x', 'PR5 Sem Secretaria', 'user_restricted', true, null, jsonb_build_array(v_doc_geral::text, v_doc_sec::text), true);

  -- reservas de apoio, inseridas direto (role ainda é o dono/superuser aqui, RLS não se aplica)
  insert into public.reservations (doc_id, doc_name, number, formatted_number, status, bucket_secretaria, bucket_year, dest_secretarias, user_id, user_secretaria, timestamp)
  values (v_doc_geral, 'Decreto', 9901, 'DEC-T 9901', 'ativa', '', 0, '[]'::jsonb, v_fazenda_a, 'Fazenda', now());
  insert into public.reservations (doc_id, doc_name, number, formatted_number, status, bucket_secretaria, bucket_year, dest_secretarias, user_id, user_secretaria, timestamp)
  values (v_doc_sec, 'Ofício', 9902, 'OF-T 9902', 'ativa', 'Fazenda', 0, '[]'::jsonb, v_fazenda_a, 'Fazenda', now());
  insert into public.reservations (doc_id, doc_name, number, formatted_number, status, bucket_secretaria, bucket_year, dest_secretarias, user_id, user_secretaria, timestamp)
  values (v_doc_sec, 'Ofício', 9903, 'OF-T 9903', 'ativa', 'Saúde', 0, '[]'::jsonb, v_saude, 'Saúde', now());
  insert into public.reservations (doc_id, doc_name, number, formatted_number, status, bucket_secretaria, bucket_year, dest_secretarias, user_id, user_secretaria, timestamp)
  values (v_doc_sec, 'Ofício', 9904, 'OF-T 9904', 'ativa', '', 0, '[]'::jsonb, v_sem_sec, null, now());

  -- T1: reserve_number com sessão real funciona
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  begin
    perform public.reserve_number(v_doc_geral, null);
    v_res := v_res || 'T1-OK; ';
  exception when others then
    v_res := v_res || 'T1-FALHOU(' || sqlerrm || '); ';
  end;
  reset role; reset request.jwt.claims;

  -- T2: reserve_number sem sessão falha com 'Sessão obrigatória' (fim do modo compat.)
  set local role authenticated;
  begin
    perform public.reserve_number(v_doc_geral, v_fazenda_a);
    v_res := v_res || 'T2-FALHOU(rodou sem sessão); ';
  exception when others then
    v_res := v_res || case when sqlerrm = 'Sessão obrigatória' then 'T2-OK; ' else 'T2-FALHOU(' || sqlerrm || '); ' end;
  end;
  reset role;

  -- T3: reserve_number como anon é barrado por GRANT
  set local role anon;
  begin
    perform public.reserve_number(v_doc_geral, v_fazenda_a);
    v_res := v_res || 'T3-FALHOU(anon conseguiu); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T3-OK; ';
  when others then
    v_res := v_res || 'T3-FALHOU(erro inesperado: ' || sqlerrm || '); ';
  end;
  reset role;

  -- T4: cancel_reservation sem sessão falha
  set local role authenticated;
  begin
    perform public.cancel_reservation((select id from public.reservations where formatted_number = 'DEC-T 9901'), v_fazenda_a, 'motivo teste');
    v_res := v_res || 'T4-FALHOU(rodou sem sessão); ';
  exception when others then
    v_res := v_res || case when sqlerrm = 'Sessão obrigatória' then 'T4-OK; ' else 'T4-FALHOU(' || sqlerrm || '); ' end;
  end;
  reset role;

  -- T5: update_reservation sem sessão falha
  set local role authenticated;
  begin
    perform public.update_reservation((select id from public.reservations where formatted_number = 'DEC-T 9901'), v_fazenda_a, 'novo assunto', null, null);
    v_res := v_res || 'T5-FALHOU(rodou sem sessão); ';
  exception when others then
    v_res := v_res || case when sqlerrm = 'Sessão obrigatória' then 'T5-OK; ' else 'T5-FALHOU(' || sqlerrm || '); ' end;
  end;
  reset role;

  -- T6: set_secretaria_counter por não-admin com sessão é bloqueado
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_secretaria_counter(v_doc_sec, 'Fazenda', 9100);
    v_res := v_res || 'T6-FALHOU(não-admin conseguiu); ';
  exception when others then
    v_res := v_res || case when sqlerrm = 'Apenas administradores podem ajustar a numeracao' then 'T6-OK; ' else 'T6-FALHOU(' || sqlerrm || '); ' end;
  end;
  reset role; reset request.jwt.claims;

  -- T7: set_secretaria_counter sem sessão nenhuma TAMBÉM exige admin agora (antes passava direto)
  set local role authenticated;
  begin
    perform public.set_secretaria_counter(v_doc_sec, 'Fazenda', 9100);
    v_res := v_res || 'T7-FALHOU(sem sessão conseguiu ajustar numeração); ';
  exception when others then
    v_res := v_res || 'T7-OK; ';
  end;
  reset role;

  -- T8: set_secretaria_counter como admin funciona (número bem acima de qualquer uso real)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  begin
    select * into v_row from public.set_secretaria_counter(v_doc_geral, null, 5000000);
    v_res := v_res || case when v_row.current_number = 5000000 then 'T8-OK; ' else 'T8-FALHOU; ' end;
  exception when others then
    v_res := v_res || 'T8-FALHOU(' || sqlerrm || '); ';
  end;
  reset role; reset request.jwt.claims;

  -- T9: set_secretaria_counter como anon é barrado por GRANT
  set local role anon;
  begin
    perform public.set_secretaria_counter(v_doc_geral, null, 5000001);
    v_res := v_res || 'T9-FALHOU(anon conseguiu); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T9-OK; ';
  when others then
    v_res := v_res || 'T9-FALHOU(erro inesperado: ' || sqlerrm || '); ';
  end;
  reset role;

  -- T10: anon não lê nada de users (revoke select explícito na tabela)
  set local role anon;
  begin
    perform count(*) from public.users;
    v_res := v_res || 'T10-FALHOU(anon leu users); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T10-OK; ';
  end;
  reset role;

  -- T11: usuário comum só vê a própria linha em users
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users;
  v_res := v_res || case when v_count = 1 then 'T11-OK; ' else 'T11-FALHOU(viu ' || v_count || '); ' end;
  reset role; reset request.jwt.claims;

  -- T12: admin vê todas as linhas de users
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users;
  v_res := v_res || case when v_count >= 5 then 'T12-OK; ' else 'T12-FALHOU(' || v_count || '); ' end;
  reset role; reset request.jwt.claims;

  -- T13: não-admin não consegue inserir documento
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.documents (name, start_number, current_number, per_secretaria) values ('PR5 teste', 1, 1, false);
    v_res := v_res || 'T13-FALHOU(não-admin inseriu documento); ';
  exception when insufficient_privilege then
    v_res := v_res || 'T13-OK; ';
  end;
  reset role; reset request.jwt.claims;

  -- T14: admin insere/atualiza/apaga documento
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.documents (id, name, start_number, current_number, per_secretaria) values (gen_random_uuid(), 'PR5 teste admin', 1, 1, false);
    update public.documents set current_number = 2 where name = 'PR5 teste admin';
    delete from public.documents where name = 'PR5 teste admin';
    v_res := v_res || 'T14-OK; ';
  exception when others then
    v_res := v_res || 'T14-FALHOU(' || sqlerrm || '); ';
  end;
  reset role; reset request.jwt.claims;

  -- T15: anon lê chave pública de app_config
  set local role anon;
  select count(*) into v_count from public.app_config where key = 'secretaria_list';
  v_res := v_res || case when v_count = 1 then 'T15-OK; ' else 'T15-FALHOU; ' end;
  reset role;

  -- T16: não-admin não escreve em app_config (RLS filtra a linha, 0 rows, sem exceção)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  update public.app_config set value = '"x"'::jsonb where key = 'secretaria_list';
  get diagnostics v_count = row_count;
  v_res := v_res || case when v_count = 0 then 'T16-OK; ' else 'T16-FALHOU(afetou ' || v_count || '); ' end;
  reset role; reset request.jwt.claims;

  -- T17: documento não-per_secretaria é público (qualquer aprovado vê)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_b::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.reservations where formatted_number = 'DEC-T 9901';
  v_res := v_res || case when v_count = 1 then 'T17-OK; ' else 'T17-FALHOU; ' end;

  -- T18: mesma secretaria vê reserva alheia de documento per_secretaria
  select count(*) into v_count from public.reservations where formatted_number = 'OF-T 9902';
  v_res := v_res || case when v_count = 1 then 'T18-OK; ' else 'T18-FALHOU; ' end;

  -- T19: secretaria diferente NÃO vê
  select count(*) into v_count from public.reservations where formatted_number = 'OF-T 9903';
  v_res := v_res || case when v_count = 0 then 'T19-OK; ' else 'T19-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T20: usuário sem secretaria só vê a própria reserva
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem_sec::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.reservations where formatted_number = 'OF-T 9904';
  v_res := v_res || case when v_count = 1 then 'T20a-OK; ' else 'T20a-FALHOU; ' end;
  select count(*) into v_count from public.reservations where formatted_number = 'OF-T 9902';
  v_res := v_res || case when v_count = 0 then 'T20b-OK; ' else 'T20b-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T21: admin vê tudo em reservations
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.reservations where formatted_number in ('DEC-T 9901','OF-T 9902','OF-T 9903','OF-T 9904');
  v_res := v_res || case when v_count = 4 then 'T21-OK; ' else 'T21-FALHOU(' || v_count || '); ' end;
  reset role; reset request.jwt.claims;

  -- T22: não-admin não lê logs
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.logs;
  v_res := v_res || case when v_count = 0 then 'T22-OK; ' else 'T22-FALHOU(' || v_count || '); ' end;

  -- T23: usuário insere log com a própria identidade
  insert into public.logs (type, action, details, user_id, user_name) values ('teste', 'PR5 teste', 'detalhe', v_fazenda_a, 'PR5 Fazenda A');
  v_res := v_res || 'T23-OK; ';
  reset role; reset request.jwt.claims;

  -- T24: tentativa de forjar user_id de outra pessoa não é rejeitada, mas o trigger
  -- logs_identidade_real (PR1) já corrige para a identidade real ANTES da RLS checar
  -- (BEFORE INSERT roda antes do WITH CHECK) — resultado: a linha existe, mas nunca
  -- com a identidade forjada. Reconferir como admin (não-admin não lê logs, T22).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fazenda_a::text, 'role', 'authenticated')::text, true);
  insert into public.logs (type, action, details, user_id, user_name) values ('teste', 'PR5 teste forjado', 'detalhe', v_admin_id, 'Forjado');
  reset role; reset request.jwt.claims;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  select user_id into v_row from public.logs where action = 'PR5 teste forjado';
  v_res := v_res || case when v_row.user_id = v_fazenda_a then 'T24-OK; ' else 'T24-FALHOU(user_id=' || coalesce(v_row.user_id::text, 'null') || '); ' end;

  -- T25: admin lê logs
  select count(*) into v_count from public.logs where action = 'PR5 teste';
  v_res := v_res || case when v_count = 1 then 'T25-OK; ' else 'T25-FALHOU; ' end;
  reset role; reset request.jwt.claims;

  -- T26-T28: grants
  select has_function_privilege('anon', 'public.reserve_number(uuid,uuid,text,text,text,text,text,date,jsonb)', 'EXECUTE') into v_bool;
  v_res := v_res || case when not v_bool then 'T26-OK; ' else 'T26-FALHOU; ' end;
  select has_function_privilege('authenticated', 'public.reserve_number(uuid,uuid,text,text,text,text,text,date,jsonb)', 'EXECUTE') into v_bool;
  v_res := v_res || case when v_bool then 'T27-OK; ' else 'T27-FALHOU; ' end;
  select has_function_privilege('anon', 'public.set_secretaria_counter(uuid,text,integer,integer)', 'EXECUTE') into v_bool;
  v_res := v_res || case when not v_bool then 'T28-OK; ' else 'T28-FALHOU; ' end;

  raise exception 'RESULTADO DOS TESTES PR5: %', v_res;
end $$;

rollback;
