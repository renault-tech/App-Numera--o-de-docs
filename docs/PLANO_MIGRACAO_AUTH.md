# Plano: migrar a autenticação do Numera para o Supabase Auth e fechar a RLS

**Status: planejamento aprovado, todas as 9 decisões (P1–P9) já confirmadas
pelo dono da plataforma, PR0 e PR1 concluídos e aplicados em produção. PR2
(migração de contas) com o script pronto, dry-run conferido e a última
pendência de dado (e-mail de Majella Mazini,
`majella@cataguases.mg.gov.br`, informado pelo dono em 24/09/2026)
resolvida — os 41 usuários resolvem e-mail agora, falta só rodar o script
de verdade quando os 2 passos manuais do dono estiverem prontos.** Este
documento é o plano de referência para a migração de segurança descrita no
achado crítico de `CLAUDE.md` (RLS aberta em `using(true) with check(true)`
nas 6 tabelas + senha em texto puro em `public.users.password`). Escrito por
uma sessão do Claude Code (planejamento via agente Opus dedicado, com
leitura do código real e consultas somente-leitura ao banco de produção
`uxdjhdnsnditivvjktzf`). **PR1 aplicado de verdade em 24/09/2026.**

**PR0 concluído** (24/09/2026): a parte de documentação/estrutura de pastas
foi publicada primeiro; as duas mudanças que tocam `app.js`/
`auth-service.js` (upsert em vez de insert no cadastro; remoção do bloco
morto que reinseria a lista inicial de documentos) foram avaliadas quanto a
risco antes de publicar — regra do dono (ver `CLAUDE.md`): deploy que **pode
afetar o trabalho dos servidores** só depois das 17h; mudança rápida e
comprovadamente sem efeito no comportamento atual pode seguir a qualquer
hora. As duas do PR0 se enquadraram no segundo caso (confirmado lendo o
código antes de mexer: o bloco de reinserção nunca dispara hoje, porque
`documents` nunca está vazio em produção; o `upsert` se comporta
identicamente a `insert` sem o trigger do PR1 ainda existir) e foram
publicadas fora da janela das 17h.

Regra da casa deste repositório (mesma dos outros 3 da plataforma): migration
nova sempre testada transacionalmente (`begin` + cenários + `rollback`/`raise
exception` forçado) antes de aplicar de verdade.

## Decisões já tomadas (confirmadas com o dono em 2026-09-24)

1. **Login por username continua existindo**, via função no servidor (não
   RPC pública direta) — resolve `username → e-mail` sem expor a lista de
   e-mails de servidores para quem tentar adivinhar usernames.
2. **Recuperação de senha via SMTP próprio, reaproveitando a conta Brevo já
   usada pelo Compras** — não é uma conta nova: as mesmas credenciais SMTP
   (host, porta, usuário/chave de API, remetente) precisam ser coladas de
   novo em Authentication → SMTP Settings do projeto **do Numera**
   (`uxdjhdnsnditivvjktzf`), porque cada projeto Supabase configura SMTP
   individualmente — não há compartilhamento automático entre projetos,
   mesmo do mesmo dono. Passo manual de ~5 minutos, ainda não feito.
3. **Prazo do PR6** (apagar as senhas em texto puro — passo sem volta):
   **2 semanas** de estabilidade depois do PR5 aplicado, antes de executar.
4. **P3 quase resolvido**: os 2 usuários pendentes sem e-mail (Majella
   Mazini, Leandra Delgado, criados 23/09) já foram aprovados manualmente
   pelo dono no app. Confirmado por consulta direta ao banco que nenhum dos
   4 usuários "legado puro" (sem par em `auth.users`) é conta fictícia de
   teste — são 2 pessoas reais com uso sustentado (o admin é a própria
   conta do dono, 19 reservas/207 logs entre 14/07-06/08; Ludmila Fontoura,
   7 reservas/8 logs entre 22/07-27/08, `email` vazio no banco mas
   `username` = `ludmilafontoura25@gmail.com`) e 2 recém-aprovadas sem
   nenhum uso ainda. **E-mails confirmados para a migração**: Ludmila
   Fontoura → `ludmilafontoura25@gmail.com` (já estava no `username`);
   Leandra Delgado → `leandra.cataguases@gmail.com` (informado pelo dono,
   campo `email` dela no banco continua vazio até o script do PR2 gravar).
   **Majella Mazini → `majella@cataguases.mg.gov.br`** (informado pelo dono
   em 24/09/2026, mesmo dia). Com isso, a única pendência real de dado da
   seção 1 está fechada — os 41 usuários resolvem e-mail; falta só rodar o
   script de verdade quando os passos manuais (P5 e SMTP, item 2 acima)
   estiverem prontos.
5. **P8 confirmado: sem custo.** Homologação via um **segundo projeto
   Supabase no plano gratuito** (mesmo caminho já usado quando o Compras
   migrou de região Oregon → São Paulo: projeto novo do zero, schema
   replicado a partir das migrations, dados de teste próprios — não um
   Branch pago do projeto de produção). Isso desbloqueia o item "config de
   ambiente por hostname" do PR0 (seção 6) — ainda não implementado, porque
   ainda toca `app.js` (a mesma cautela de não publicar nada no app ao vivo
   sem uma janela combinada).
6. **P4 confirmado**: ações de admin (criar usuário, redefinir senha, apagar
   conta) centralizadas no Hub (`centraltech`), que já tem
   `NUMERA_SUPABASE_SERVICE_ROLE_KEY` — não cria Edge Function própria no
   Numera.
7. **P5 confirmado**: desligar "Confirm email" no Supabase Auth do projeto
   do Numera — a aprovação do admin já é a porta de entrada, confirmação de
   e-mail separada é redundante. **Passo manual do dono** (Authentication →
   Providers → Email → "Confirm email", painel do projeto
   `uxdjhdnsnditivvjktzf`) — nenhuma ferramenta disponível nesta sessão
   consegue ler/alterar essa configuração remotamente.
8. **P6 confirmado, com a regra exata já extraída do código** (não uma
   aproximação): `getVisibleReservations()` (`app.js:948-958`) —
   - admin vê tudo, sempre;
   - reserva de um documento **sem** `per_secretaria` é visível a qualquer
     usuário aprovado;
   - reserva de um documento **com** `per_secretaria`: visível só a quem
     tem `secretaria` preenchida **igual à `user_secretaria` gravada na
     própria reserva** (a secretaria de quem FEZ a reserva, não a de
     destino);
   - usuário sem `secretaria` cadastrada só vê as próprias reservas
     (`user_id = auth.uid()`).
   Isso substitui o placeholder genérico "usuario_aprovado()" que a seção 4
   tinha antes para `reservations` — ver seção 4 atualizada.
9. **P9 confirmado**: o próprio dono avisa os servidores sobre a janela de
   corte (PR3/PR5) — nenhuma ação da nossa parte além de dar o aviso com
   antecedência de quando a janela será.

## 0. O que o banco real mostra (achados ao vivo, 24/09/2026)

Consultas somente-leitura no projeto `uxdjhdnsnditivvjktzf` (contagens e
comparações de hash via `extensions.crypt()`, nunca senha em claro na saída):

| Medida | Valor |
|---|---|
| `public.users` total | **41** |
| Com par em `auth.users` (mesmo `id`) | **37** |
| Sem par em `auth.users` (legado puro) | **4**: 1 admin ativo com e-mail (19 reservas); 1 `user_restricted` aprovado **sem e-mail** (7 reservas); 2 pendentes **sem e-mail** (criados em 23/09) |
| Contas do Auth com e-mail **não confirmado** | **32 de 37** |
| Senha de `public.users` que confere com o hash do Auth | **36 de 37** |
| Senha que diverge | **1** (não confirmada, nunca entrou pelo Auth) |
| Já entraram alguma vez pelo Auth | **5** |
| Admins | 3 (1 sem conta no Auth, 1 com Auth sem confirmação, 1 com Auth confirmado) |
| Conta no Auth sem linha em `public.users` | 1 (órfã, criada 23/07, nunca usada) |
| Senha vazia / < 6 caracteres / e-mail-username duplicado / e-mail inválido | 0 |
| `app_config` | só `secretaria_list` e `secretariaPermissions` (`loginDiretoBloqueado` não existe ainda) |

**Conclusão prática: migrar senha de verdade só é necessário para ~4
pessoas.** A maioria (36) só precisa ter o e-mail confirmado no Auth — o
hash já bate porque `signUp()` já rodou para elas em algum momento; o motivo
de quase ninguém entrar pelo Auth hoje é provavelmente "Confirm email"
ligado + Numera nunca teve SMTP, então `signInWithPassword` falha e o
`authService.signIn` cai sempre no fallback legado em texto puro.

**Achados adicionais no código, além da RLS aberta já documentada:**

- `set_secretaria_counter` (RPC `SECURITY DEFINER`) **não checa permissão
  nenhuma** — qualquer `anon` pode empurrar a numeração oficial para frente
  (única trava: o valor tem que ser maior que o máximo já usado).
- `anon`/`authenticated` têm `TRUNCATE`, `TRIGGER` e `REFERENCES` nas 6
  tabelas, inclusive `logs` — `TRUNCATE` ignora RLS e o trigger append-only
  `logs_imutaveis`. Não alcançável pelo PostgREST hoje, mas grant deve sair
  por defesa em profundidade.
- `loadData()` roda antes do login (`app.js:985`); com `documents` vazio,
  tenta **inserir** a lista inicial de tipos de documento (`app.js:395-405`)
  — com RLS real isso vai falhar silenciosamente ou mascarar erro; precisa
  sair antes da virada (entra no PR0).
- Fallback legado monta `.or(\`username.eq.${x},email.eq.${x}\`)` sem
  escapar a entrada, e `getCurrentUser()` aceita qualquer `id` colocado em
  `localStorage.currentUserId` — virar admin na interface é trivial. Os
  dois morrem quando o fallback sai (PR3).
- `deleteUser()` já falha hoje para quem tem reservas/logs (FKs sem
  `ON DELETE`) — "remover conta" só funciona para quem nunca usou o app.
- **O Hub (`centraltech`) lê o Numera com a anon key**
  (`src/lib/supabase/numera-cliente.ts`, usado por `src/lib/dados/numera.ts`,
  `src/lib/dados/login-direto.ts`, `src/lib/dados/solicitacoes.ts`) — fechar
  a RLS quebra essas 3 telas do Hub se não migrar antes (PR4, obrigatório
  antes do PR5). `aprovarNumera` (`src/lib/actions/solicitacoes.ts`) já usa
  service role e continua funcionando, mas grava `password:
  crypto.randomUUID()` em `public.users` — interage com a remoção da coluna
  no PR6.
- Migrations já existem versionadas (`supabase/migrations/0002` a `0012` +
  `20260924050000`) — a frase em `CLAUDE.md` dizendo "este projeto não tem
  migrations versionadas" está desatualizada, corrigir no PR0.
- Todo arquivo na raiz do repo vai publicado (site estático, sem build,
  `vercel.json` sem `outputDirectory`) — por isso `CLAUDE.md` e este `docs/`
  entraram em `.vercelignore` nesta mesma sessão. Qualquer script de
  migração com credencial (PR2) tem que ler só de variável de ambiente, ou
  entrar no `.vercelignore` também.

## 1. Migração de contas

Todo mundo passa a ter conta confirmada no Auth com a **mesma senha que já
usa** — ninguém precisa redefinir senha para a migração em si. O fallback
legado continua funcionando como rede de segurança até o PR3.

**Execução:** script `scripts/migrar-contas-auth.mjs` (a criar no PR2), com
service role lida de variável de ambiente (`NUMERA_SERVICE_ROLE_KEY`),
rodado pelo dono na própria máquina. Tem `--dry-run` (só imprime ids e
contagens, nunca senha) e é idempotente.

**Cinco grupos:**

| Grupo | Quantos | Ação |
|---|---|---|
| A. Com Auth, senha confere, não confirmado | 31 | `auth.admin.updateUserById(id, { email_confirm: true })` |
| B. Com Auth, senha confere, confirmado | 5 | nada |
| C. Com Auth, senha diverge | 1 | `updateUserById(id, { password: <public.users.password>, email_confirm: true })` — vale a senha que a pessoa usa hoje |
| D. Sem Auth, com e-mail (o admin) | 1 | `auth.admin.createUser({ id: <public.users.id>, email, password, email_confirm: true, user_metadata })` — **mesmo `id`**, para reservas/logs continuarem apontando certo |
| E. Sem Auth, sem e-mail | 3 | **Depende de decisão em aberto (pergunta P3, seção 7)** |

Se a Admin API não aceitar `id` explícito na versão do GoTrue deste
projeto: **parar e reavaliar**, nunca inserir direto em `auth.users`/
`auth.identities` via SQL.

**Ordem, para ninguém da administração ficar trancado:**
1. O admin do grupo D, depois os outros dois admins.
2. Um usuário comum voluntário.
3. Restante de A e C.
4. Grupo E, conforme decisão pendente.

**Verificação depois de cada lote** (SQL só leitura): todo `public.users`
tem par em `auth.users` com mesmo `id`, `email_confirmed_at is not null`, e
`crypt(u.password, a.encrypted_password) = a.encrypted_password`. Critério
de pronto: **41/41** (ou 41 menos os excluídos por decisão em E). A checagem
de `crypt` roda de novo **imediatamente antes** do PR3 (front antigo ainda
deixa trocar senha em `public.users` até lá).

**Cadastro novo daqui para frente:** trigger `after insert on auth.users`
(`public.criar_perfil_usuario()`, `SECURITY DEFINER`, `search_path=''`) cria
a linha em `public.users` a partir de `raw_user_meta_data`, **força**
`role='user_restricted'`/`approved=false`, calcula `allowed_documents` a
partir de `app_config.secretariaPermissions`, gera username alternativo em
colisão, nunca falha (`on conflict (id) do nothing`, convive com o upsert do
Hub). O front deixa de fazer `insert` em `users` depois do `signUp`.

## 2. Reescrita das RPCs de negócio (duas fases)

**Helpers novos** (`SECURITY DEFINER`, `STABLE`, `search_path=''`, `revoke
execute ... from public, anon` explícito — lição já documentada neste
projeto sobre default privileges):
- `public.eh_admin()`: linha em `users` com `id = auth.uid()`, `role =
  'admin'`, `approved`.
- `public.usuario_aprovado()`: linha com `id = auth.uid()` e (`approved` ou
  admin).

**Fase A — compatível, aplicada antes do front novo (PR1).** Mesmo nome e
assinatura, lógica de identidade nova:

```sql
v_uid := auth.uid();
if v_uid is not null then
  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'Identidade não confere com a sessão';
  end if;
  v_id := v_uid;
else
  v_id := p_user_id;  -- legado; log de telemetria "chamada sem sessão"
end if;
```

Vale para `reserve_number`, `cancel_reservation`, `update_reservation`.
`set_secretaria_counter` ganha: se `auth.uid()` não nulo, exige
`eh_admin()`; se nulo, buraco continua por enquanto (com o mesmo log de
telemetria — sinal objetivo de quando parar de precisar do fallback).

**Fase B — imposição (PR5):** `auth.uid()` obrigatório, `p_user_id`
ignorado, `set_secretaria_counter` sempre exige `eh_admin()`, `revoke
execute ... from anon` nas 4 funções.

**Mudança de assinatura:** manter `p_user_id` como `default null` (não
remover ainda) — clientes antigos que mandam o parâmetro continuam
resolvendo a mesma função, modo demo continua funcionando. Ganham default
também: `p_reason` (`cancel_reservation`), `p_subject`/`p_dest_secretaria`/
`p_dest_nome` (`update_reservation`). Como os defaults mudam, `drop
function` + `create` **na mesma transação**, reaplicar GRANTs, conferir
`has_function_privilege('anon', ...)` antes/depois. Nunca criar sobrecarga
(PostgREST falha com ambiguidade). Remover `p_user_id` de vez só no PR6,
junto do ajuste do modo demo.

## 3. RPCs de admin (`SECURITY DEFINER` com `eh_admin()`)

Regra geral: primeira linha `if not public.eh_admin() then raise exception
'Apenas administradores'`; identidade só de `auth.uid()`, nunca parâmetro;
log gravado dentro da RPC; EXECUTE só para `authenticated`.

| RPC | Substitui | Proteções extra |
|---|---|---|
| `admin_aprovar_usuario(p_user_id)` | `approveUser` (`app.js:2837`) | aplica padrão da secretaria se `allowed_documents` vazio |
| `admin_atualizar_usuario(...)` | `saveUser`, ramo edição (`app.js:2813`) | sem campo de senha; valida `role`; impede rebaixar o último admin/a si mesmo |
| `admin_aplicar_padrao_secretaria(...)` | `applyDefaultsToUsers` (`app.js:2699-2702`) | upsert + update em lote numa transação só |
| `admin_desativar_usuario(p_user_id)` | `deleteUser` (`app.js:2850`) | soft delete (coluna nova `ativo boolean default true`); não desativa a si mesmo nem o último admin |

Criar usuário, definir/redefinir senha, apagar conta do Auth exigem a Admin
API — **não pode ir para o navegador**. **P4 confirmado: centralizado no
Hub** (`centraltech`, que já tem `NUMERA_SUPABASE_SERVICE_ROLE_KEY`) — sem
Edge Function própria no Numera. "Redefinir senha" vira link de recuperação
gerado na hora (`generateLink({type:'recovery'})`, mesmo padrão já usado
pelo Hub para o primeiro acesso via `aprovarSolicitacao`) — o campo de senha
em texto aberto em `openUserModal` (`app.js:2766`) some. Isso significa que
gestão de usuário do Numera deixa de existir dentro do próprio app: a tela
`openUserModal`/`saveUser`/`approveUser`/`deleteUser` em `app.js` é
substituída por telas equivalentes no Hub (extensão do que já existe em
Configurações → Usuários e acessos do `centraltech`), não reimplementada
aqui.

Ações do próprio usuário (`id = auth.uid()` fixo): `salvar_ordem_cards(...)`
substitui `app.js:1766`; `marcar_login_origem()` substitui `app.js:1087`
(mesmo nome já usado nos outros apps da plataforma).

## 4. RLS de verdade (PR5, por último)

Em todas as 6 tabelas: `drop policy` da aberta, `revoke truncate, trigger,
references from anon, authenticated`, `(select public.eh_admin())` nas
policies (calculado uma vez por consulta).

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | `id = auth.uid() or eh_admin()`; `anon`: nada | nenhum (trigger/RPC) | nenhum (RPCs) | nenhum |
| `documents` | `usuario_aprovado()` | `eh_admin()` | `eh_admin()` | `eh_admin()` |
| `reservations` | ver regra exata abaixo (P6, confirmada) | só RPC | só RPC | só RPC |
| `document_counters` | `usuario_aprovado()` | só RPC | só RPC | só RPC |
| `logs` | `eh_admin()` | `authenticated` com `user_id = auth.uid()` | nenhum (trigger mantido) | nenhum (trigger mantido) |
| `app_config` | `anon`/`authenticated`: só chaves públicas | `eh_admin()` | `eh_admin()` | `eh_admin()` |

`logs` ganha trigger `BEFORE INSERT` que sobrescreve `user_id :=
auth.uid()`/`user_name` — ninguém forja "quem fez"; convive com as RPCs
`SECURITY DEFINER` porque `auth.uid()` continua sendo quem chamou.
`app_config`: leitura pública cobre login/cadastro, escrita só admin fecha
a negação de serviço do `loginDiretoBloqueado`. Realtime (`postgres_changes`)
já respeita RLS com o JWT do usuário — sem mudança de código ali.

**SELECT de `reservations`, regra exata** (P6, confirmada com o dono —
replica `getVisibleReservations()`, `app.js:948-958`, não um recorte
aproximado):

```sql
create policy "le_reservations" on public.reservations
for select
using (
  eh_admin()
  or exists (
    select 1 from public.documents d
    where d.id = reservations.doc_id and coalesce(d.per_secretaria, false) = false
  )
  or (
    (select u.secretaria from public.users u where u.id = auth.uid()) is not null
    and reservations.user_secretaria = (select u.secretaria from public.users u where u.id = auth.uid())
  )
  or (
    (select u.secretaria from public.users u where u.id = auth.uid()) is null
    and reservations.user_id = auth.uid()
  )
);
```

Reparo importante para quem for implementar: a regra usa `user_secretaria`
(secretaria de quem **fez** a reserva), não `dest_secretaria`/
`dest_secretarias` (a quem foi endereçada) — mesmo critério do código atual,
mesmo que pareça contraintuitivo à primeira vista. Documento sem
`per_secretaria` continua público a qualquer autenticado aprovado,
independente de secretaria.

## 5. Testes e virada sem trancar ninguém

**Testes no banco** (`supabase/tests/NNN_*.sql`, padrão da casa: `begin` +
cenários + `rollback`/`raise exception`), identidade simulada com `set
local role authenticated; set local request.jwt.claims =
'{"sub":"<uuid>","role":"authenticated"}'`. Matriz mínima: `anon` barrado em
tudo (só lê chaves públicas de `app_config`); usuário restrito aprovado (vê
só a própria linha, reserva só o tipo permitido, não anula reserva alheia,
`p_user_id` de outra pessoa falha na fase A, não escreve fora do que pode,
`admin_*` falha, não se autopromove); pendente/desativado (RPC de reserva
falha); admin (`admin_*` funciona, não rebaixa/desativa o último admin,
`set_secretaria_counter` funciona); `logs` (INSERT com `user_id` alheio é
regravado, UPDATE/DELETE barrados); trigger de cadastro (força
`user_restricted`/`approved=false` mesmo se a metadata disser admin, resolve
colisão de username); grants (`has_function_privilege`,
`information_schema.role_table_grants`, `get_advisors` depois de aplicar).

**Ponta a ponta** (o sandbox de desenvolvimento não alcança este Supabase):
proposta de projeto de homologação (ou Supabase Branch) + preview da Vercel
apontando para ele — exige `SUPABASE_URL`/`SUPABASE_KEY` deixarem de ser
fixos em `app.js:8-9` (config por hostname). **Pergunta em aberto (P8)**.

**Roteiro manual do dono, em produção, logo após cada etapa:** admin entra
por e-mail; admin entra por username; aprova cadastro de teste; edita nível
de acesso; reserva/edita/anula número; ajusta contador por secretaria;
usuário comum reserva; usuário comum não vê lista de usuários nem logs;
"esqueci minha senha" chega de verdade (SMTP Brevo, decisão já tomada); aba
anônima confirma `GET /rest/v1/users?select=*` com a anon key devolve `[]`.

**Janela de virada:** horário fora do expediente, dono disponível.
1. Refazer a checagem de `crypt`.
2. Publicar o front (PR3).
3. Depois de 24–48h com zero "chamada sem sessão" nos logs, aplicar o PR5.

Avisar antes: quem estiver com aba aberta precisa entrar de novo.

**Plano de volta:** todo PR de banco traz `supabase/rollbacks/<mesmo
nome>_rollback.sql`, testado transacionalmente (PR5 recria a policy aberta
e os grants, volta as RPCs para a fase A). Front: "Instant Rollback" da
Vercel. Acesso de emergência: painel do Supabase (SQL editor + Auth) —
deixar escrito no `CLAUDE.md` o SQL para restaurar
`role='admin',approved=true,ativo=true` de um id e o caminho para gerar link
de recuperação pelo painel. **Ponto sem volta: só o PR6** (decisão já
tomada: 2 semanas de estabilidade antes).

## 6. Ordem dos PRs e critério de "pronto para aplicar"

- **PR0 — CONCLUÍDO (24/09/2026).** Corrigiu `CLAUDE.md` e o cabeçalho da
  migration `20260924050000` (a frase sobre "sem migrations versionadas"
  estava errada); criou `supabase/tests/` e `supabase/rollbacks/`;
  `authService.signUp` trocou `insert` por `upsert(...,
  {onConflict:'id'})` (para o trigger do PR1 não quebrar o front antigo);
  removeu o bloco que reinseria a lista inicial de documentos (era
  `app.js:395-405`, confirmado como código morto em produção antes de
  remover — `documents` nunca está vazio hoje); cache-busting de
  `index.html` avançado. Único item que ficou de fora: **config de
  ambiente por hostname**, ainda não feita — entra junto do PR8 (projeto de
  homologação, P8 confirmado como projeto Supabase gratuito), quando a
  homologação for montada de verdade.
- **PR1 — CONCLUÍDO (24/09/2026).** Banco, aditivo e compatível. Coluna
  `ativo`, helpers (`eh_admin`/`usuario_aprovado`), trigger de cadastro
  (`criar_perfil_usuario`), RPCs de negócio na fase A com telemetria
  (`reserve_number`/`cancel_reservation`/`update_reservation`/
  `set_secretaria_counter`), `admin_aprovar_usuario`/
  `admin_atualizar_usuario`/`admin_aplicar_padrao_secretaria`/
  `admin_desativar_usuario`, `salvar_ordem_cards`, `marcar_login_origem`,
  trigger de identidade em `logs` (`forcar_identidade_log`, só age com
  `auth.uid()` presente). Migrations:
  `20260924060000_pr1_auth_uid_compat_e_rpcs_admin.sql` +
  `20260924060001_pr1_fix_trigger_functions_grant_publico.sql`. Testado
  transacionalmente (30 cenários, `supabase/tests/001_pr1_auth_uid_compat.sql`)
  antes de aplicar, e de novo como regressão contra o schema já aplicado —
  os dois rodam limpos. `get_advisors` confirmado: as 4 RPCs de negócio
  continuam `anon`-executáveis por design (fallback legado sem sessão,
  intencional na fase A); `admin_*`/`eh_admin`/`usuario_aprovado`/
  `salvar_ordem_cards`/`marcar_login_origem` só `authenticated`; nenhuma
  categoria nova de exposição. Rollback pronto e testado em
  `supabase/rollbacks/20260924060000_pr1_auth_uid_compat_e_rpcs_admin_rollback.sql`.
  Nada disso é chamado pelo `app.js`/`auth-service.js` publicados ainda
  (fica para PR3/PR4) — zero efeito visível hoje, por isso aplicado fora
  da janela das 17h (regra do dono: só muda o que pode afetar o trabalho
  dos servidores, e este PR não afeta nada em uso agora).
  - **Achado real durante o teste**: a base de produção tem **3 contas
    admin** (não só uma), o que só apareceu ao testar a proteção do
    "último admin ativo" em `admin_atualizar_usuario`/
    `admin_desativar_usuario` — a 1ª tentativa de teste isolou só o admin
    real + 1 admin de teste e a demoção passou de verdade (havia ainda 2
    admins reais ativos sobrando). Corrigido isolando **todos** os admins
    reais dentro da própria transação de teste (revertido no fim, nunca
    commitado). Lição: nunca assumir a cardinalidade de uma condição de
    produção (aqui, "quantos admins existem") — conferir com uma query
    antes de desenhar o cenário de teste.
  - **Achado de segurança real, corrigido no mesmo dia**: as duas funções
    de trigger novas (`criar_perfil_usuario`, `forcar_identidade_log`)
    nasceram com EXECUTE concedido a `anon`/`authenticated` via o grant
    padrão do Postgres para função recém-criada (mesma pegadinha já
    documentada à exaustão nos outros 3 repos desta plataforma) — a
    migration original só tinha `revoke`/`grant` explícito nas RPCs de
    negócio/admin, não nessas duas. Sem risco real de exploração (Postgres
    recusa chamar uma função `RETURNS TRIGGER` fora de contexto de
    trigger), mas fechado por defesa em profundidade assim que o
    `get_advisors` pós-aplicação acusou — confirmado transacionalmente que
    revogar TUDO de `public` não quebra o disparo do trigger (Postgres não
    checa EXECUTE para isso).
- **PR2 — migração de contas** (script operacional, não é migration).
  **Script pronto** em `scripts/migrar-contas-auth.mjs` (idempotente,
  `--dry-run`, roda na máquina do dono via `NUMERA_SERVICE_ROLE_KEY`, nunca
  em produção/CI/Vercel — fora do build do site, ver `.vercelignore`).
  Desenho simplificado em relação à tabela de grupos A/B/C da seção 1: como
  o script só tem acesso via Admin API (não lê
  `auth.users.encrypted_password`, que não é exposto via REST/SDK), ele não
  tenta redescobrir "a senha confere" — toda conta que já tem Auth recebe o
  mesmo tratamento idempotente (`updateUserById` com a senha atual de
  `public.users` + `email_confirm: true`), o que dá o mesmo resultado final
  para A/B/C sem precisar da introspecção. Grupo D (o admin, sem Auth ainda)
  entra primeiro via `createUser` com o mesmo `id`; se a Admin API recusar
  `id` explícito, o script para e avisa — nunca insere direto via SQL.
  **Dry-run já conferido nesta sessão via SQL direto no banco** (mesma
  classificação que o script produzirá): 37 já têm Auth, os 4 "sem Auth"
  resolvem e-mail sozinhos (admin; Leandra e **Majella Mazini
  (`majella@cataguases.mg.gov.br`, informado pelo dono em 24/09/2026) via
  decisão já tomada**; Ludmila Fontoura porque o próprio `username` dela É
  o e-mail) — bate exatamente com a tabela A=31/B=5/C=1/D=1/E=3 da seção 1
  (nada mudou desde o planejamento), e a pendência de dado que faltava
  está fechada: **41/41 resolvem e-mail agora.** *Pronto para rodar de
  verdade quando:* os dois passos manuais do dono (P5: desligar "Confirm
  email"; a senha SMTP recolada no projeto do Numera) estiverem feitos —
  nenhum dos dois bloqueia o dry-run, só a execução real ficando 100%
  completa.
- **PR3 — virada do front.** Login só pelo Auth (username resolvido
  conforme decisão já tomada); sai o fallback legado e
  `localStorage.currentUserId`; sessão sem linha aprovada/ativa em `users`
  → `signOut` + mensagem; `loadData` só com sessão; `signUp` sem `insert`;
  admin usa `admin_*` + Edge Function/Hub (P4 ainda em aberto); ordem dos
  cards e origem do Hub via RPC; erro "Sessão expirada" traduzido. *Pronto
  quando:* testado em homologação (ou com o roteiro manual do dono nos
  primeiros minutos da janela, se P8 = não), checagem de `crypt` refeita
  logo antes.
- **PR4 — Hub** (`centraltech`, obrigatório antes do PR5).
  `src/lib/dados/numera.ts`, `login-direto.ts`, `solicitacoes.ts` trocam o
  cliente anon por um cliente admin; `aprovarNumera` para de gravar
  `password`; textos "RLS de lá já libera geral" atualizados. *Pronto
  quando:* "Importar do Numera", "Login direto por aplicativo" e aprovação
  com Numera funcionam em produção.
- **PR5 — imposição.** RPCs fase B, revoke EXECUTE de `anon`, RLS da seção
  4 (inclusive a policy de `reservations` com a regra exata de secretaria,
  P6 já confirmada — não é mais opcional/PR7), revoke dos grants
  excedentes. Rollback pronto. *Pronto quando:* zero "chamada sem sessão"
  por 24–48h após PR3, PR4 em produção, matriz completa passa em
  transação, rollback testado, dono disponível na janela.
- **PR6 — limpeza irreversível**, 2 semanas depois do PR5 (decisão já
  tomada). `update users set password = null` → `drop column password`;
  remove `p_user_id` das RPCs e ajusta o demo; atualiza `CLAUDE.md`.
  *Pronto quando:* confirmação explícita do dono, PR4 sem escrita em
  `password`.
- **PR7 — opcional.** Confirmação de que o SMTP está configurado de
  verdade em produção (decisão já tomada, falta só o passo manual no
  painel); fixar a versão de `@supabase/supabase-js@2` no `index.html`.

## 7. Perguntas ainda em aberto (antes de implementar)

Todas as perguntas originais (P1–P9) já foram respondidas — ver "Decisões
já tomadas" no topo. **P3 fechada de vez em 24/09/2026**: Leandra Delgado
(`leandra.cataguases@gmail.com`) e Majella Mazini
(`majella@cataguases.mg.gov.br`) — as duas informadas pelo dono. Nenhum
dado pendente resta para a migração de contas em si; só os passos manuais
já registrados na seção 6 (P5, SMTP) faltam para rodar o PR2 de verdade.

- **P7 (parte 2) — conta órfã do Auth**: existe 1 conta no `auth.users` sem
  linha correspondente em `public.users` (criada 23/07, nunca usada) —
  apaga? **Lembrete pedido pelo dono: só decidir isso mais perto da
  execução do PR2, não agora.**

### Arquivos críticos para a implementação

- `/home/user/app-numera--o-de-docs/auth-service.js`
- `/home/user/app-numera--o-de-docs/app.js`
- `/home/user/app-numera--o-de-docs/supabase/migrations/20260924050000_endurecer_reservas_e_logs_sem_quebrar_fluxo.sql`
- `/home/user/app-numera--o-de-docs/CLAUDE.md`
- `/home/user/centraltech/src/lib/actions/solicitacoes.ts`
- `/home/user/centraltech/src/lib/supabase/numera-cliente.ts` (e quem o usa:
  `src/lib/dados/numera.ts`, `src/lib/dados/login-direto.ts`,
  `src/lib/dados/solicitacoes.ts`)
