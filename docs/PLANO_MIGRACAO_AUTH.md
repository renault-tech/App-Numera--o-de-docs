# Plano: migrar a autenticação do Numera para o Supabase Auth e fechar a RLS

**Status: planejamento aprovado, implementação ainda não iniciada.** Este
documento é o plano de referência para a migração de segurança descrita no
achado crítico de `CLAUDE.md` (RLS aberta em `using(true) with check(true)`
nas 6 tabelas + senha em texto puro em `public.users.password`). Escrito por
uma sessão do Claude Code (planejamento via agente Opus dedicado, com leitura
do código real e consultas somente-leitura ao banco de produção
`uxdjhdnsnditivvjktzf`), revisado e com 3 decisões já confirmadas pelo dono da
plataforma. **Nenhuma mudança de código/banco foi aplicada ainda** — este
documento só vira ação quando alguém (humano ou sessão futura) começar pelo
PR0 abaixo, com as perguntas em aberto (seção 7) resolvidas primeiro.

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
API — **não pode ir para o navegador**. Duas opções em aberto (pergunta P4):
Edge Function própria `admin-usuarios` no projeto do Numera, ou delegar ao
Hub (já tem `NUMERA_SUPABASE_SERVICE_ROLE_KEY`). Nas duas, "redefinir senha"
vira link de recuperação gerado na hora (`generateLink({type:'recovery'})`,
mesmo padrão do Hub) — o campo de senha em texto aberto em `openUserModal`
(`app.js:2766`) some.

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
| `reservations` | `usuario_aprovado()` (ver P6) | só RPC | só RPC | só RPC |
| `document_counters` | `usuario_aprovado()` | só RPC | só RPC | só RPC |
| `logs` | `eh_admin()` | `authenticated` com `user_id = auth.uid()` | nenhum (trigger mantido) | nenhum (trigger mantido) |
| `app_config` | `anon`/`authenticated`: só chaves públicas | `eh_admin()` | `eh_admin()` | `eh_admin()` |

`logs` ganha trigger `BEFORE INSERT` que sobrescreve `user_id :=
auth.uid()`/`user_name` — ninguém forja "quem fez"; convive com as RPCs
`SECURITY DEFINER` porque `auth.uid()` continua sendo quem chamou.
`app_config`: leitura pública cobre login/cadastro, escrita só admin fecha
a negação de serviço do `loginDiretoBloqueado`. Realtime (`postgres_changes`)
já respeita RLS com o JWT do usuário — sem mudança de código ali.

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

- **PR0 — preparação, sem mudança de comportamento.** Corrige `CLAUDE.md` e
  o cabeçalho da migration `20260924050000` (a frase sobre "sem migrations
  versionadas" está errada); cria `supabase/tests/` e
  `supabase/rollbacks/`; config de ambiente por hostname (se P8 = sim);
  `authService.signUp` troca `insert` por `upsert(...,
  {onConflict:'id'})` (para o trigger do PR1 não quebrar o front antigo);
  remove o bloco que reinsere a lista inicial de documentos
  (`app.js:395-405`). *Pronto quando:* publicado, cadastro de teste
  funciona, sem regressão no roteiro manual.
- **PR1 — banco, aditivo e compatível.** Coluna `ativo`, helpers, trigger de
  cadastro, RPCs de negócio na fase A com telemetria, `admin_*`,
  `salvar_ordem_cards`, `marcar_login_origem`, trigger de identidade em
  `logs` (só age com `auth.uid()` presente). *Pronto quando:* matriz de
  testes passa em transação, `get_advisors` limpo, `anon` sem EXECUTE nas
  funções novas, app atual continua funcionando depois de aplicado.
- **PR2 — migração de contas** (script operacional, não é migration).
  Grupos A–E na ordem da seção 1. *Pronto quando:* dry-run revisado pelo
  dono, decisão P3 tomada; depois de rodar, 41/41 e os 3 admins entram pelo
  Auth.
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
  4, revoke dos grants excedentes. Rollback pronto. *Pronto quando:* zero
  "chamada sem sessão" por 24–48h após PR3, PR4 em produção, matriz
  completa passa em transação, rollback testado, dono disponível na janela.
- **PR6 — limpeza irreversível**, 2 semanas depois do PR5 (decisão já
  tomada). `update users set password = null` → `drop column password`;
  remove `p_user_id` das RPCs e ajusta o demo; atualiza `CLAUDE.md`.
  *Pronto quando:* confirmação explícita do dono, PR4 sem escrita em
  `password`.
- **PR7 — opcional.** RLS de `reservations` espelhando
  `getVisibleReservations()` (depende de P6); confirmação de SMTP
  configurado (decisão já tomada, falta o passo manual); fixar a versão de
  `@supabase/supabase-js@2` no `index.html`.

## 7. Perguntas ainda em aberto (antes de implementar)

As perguntas 1, 2 e 10 (parcialmente) da lista original já foram
respondidas — ver "Decisões já tomadas" no topo. Faltam:

- **P3 — Os 3 usuários sem e-mail**: o ativo (7 reservas) recebe e-mail
  real ou sintético (`<username>@usuarios.numera.invalid`, sem recuperação
  de senha possível)? Os 2 pendentes de 23/09: migrar (pedindo e-mail),
  ou excluir?
- **P4 — Gestão de usuários pelo admin**: Edge Function própria no Numera,
  ou centralizar no Hub (que já tem a service role do Numera)?
- **P5 — Confirmação de e-mail no cadastro**: desligar "Confirm email"
  (aprovação do admin já é a porta de entrada) ou manter e confirmar via
  Admin API na aprovação? Agora que o SMTP vai ser configurado (decisão já
  tomada), isso fica menos crítico, mas ainda precisa de uma escolha.
- **P6 — Sigilo das reservas**: hoje todo mundo lê todas as reservas; "cada
  secretaria só vê a própria" existe só na tela, não no banco. Vira regra
  de RLS de verdade (PR7) ou continua sendo só organização visual?
- **P7 — Remover usuário**: confirma que vira desativação (reservas/logs
  impedem apagar de fato)? A conta órfã do Auth (sem linha em
  `public.users`) é apagada?
- **P8 — Homologação**: aceita um projeto Supabase de homologação (ou
  Branch, que tem custo) + config de URL por hostname, para testar de
  ponta a ponta antes de produção?
- **P9 — Janela e aviso**: que dia/horário para PR3 e PR5, e quem avisa os
  servidores de que vão precisar entrar de novo?

### Arquivos críticos para a implementação

- `/home/user/app-numera--o-de-docs/auth-service.js`
- `/home/user/app-numera--o-de-docs/app.js`
- `/home/user/app-numera--o-de-docs/supabase/migrations/20260924050000_endurecer_reservas_e_logs_sem_quebrar_fluxo.sql`
- `/home/user/app-numera--o-de-docs/CLAUDE.md`
- `/home/user/centraltech/src/lib/actions/solicitacoes.ts`
- `/home/user/centraltech/src/lib/supabase/numera-cliente.ts` (e quem o usa:
  `src/lib/dados/numera.ts`, `src/lib/dados/login-direto.ts`,
  `src/lib/dados/solicitacoes.ts`)
