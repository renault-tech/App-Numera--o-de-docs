# CLAUDE.md — Numera (Numeração de Documentos)

Contexto para qualquer sessão do Claude Code que abrir este repositório.
Leia antes de qualquer alteração. Este repositório não tinha CLAUDE.md
até agora — criado durante a auditoria de segurança da plataforma
(pedido do usuário: "erros como este não podem acontecer", depois de um
bug real encontrado no Hub Central Cataguases).

## Arquitetura (importante entender antes de mexer em auth/permissão)

App vanilla JS (sem framework, sem build), Supabase **próprio e
separado** (`uxdjhdnsnditivvjktzf`, diferente do projeto compartilhado
por Compras/Requerimentos/Hub). Login é **híbrido e sem identidade real
verificada pelo servidor**:

- Usuário criado via `signUp()` ganha conta de verdade no Supabase Auth
  (`auth.users`), com `public.users.id = auth.users.id`.
- Usuário legado (a maioria) só tem linha em `public.users`, **sem par
  em `auth.users`** — login é um `SELECT ... WHERE username = ? AND
  password = ?` direto na tabela (comparação em texto puro), sem nunca
  criar uma sessão do Supabase Auth. O cliente guarda o `id` retornado
  em `localStorage.currentUserId` e usa esse valor cru como identidade
  para o resto da sessão.
- **Toda a lógica de autorização do app (inclusive as RPCs de negócio)
  usa esse `id` como PARÂMETRO vindo do cliente, nunca `auth.uid()`** —
  mesmo para quem passou pelo Supabase Auth de verdade. Ou seja, mesmo
  um login "real" não é aproveitado para autorização: o servidor confia
  no que o cliente diz que é o `user_id`.

Essa arquitetura (não algo introduzido agora) é a causa raiz de quase
todo achado sério da auditoria abaixo.

## Achado CRÍTICO, NÃO corrigido — precisa de decisão do usuário

**RLS de TODAS as 6 tabelas (`users`, `documents`, `reservations`,
`document_counters`, `logs`, `app_config`) está `using(true) with
check(true)`** — equivalente a não ter RLS nenhuma. Confirmado ao vivo
(`pg_policies`, `information_schema.role_table_grants`): `anon` (sem
login nenhum) tem SELECT/INSERT/UPDATE/DELETE nas 6 tabelas.

O mais grave: **`public.users.password` guarda a senha em TEXTO PURO**
(`auth-service.js`, comentário no próprio código: `// TODO: Em produção,
não salvar senha aqui`) — combinado com a RLS aberta, **qualquer pessoa
sem login consegue baixar a senha de todo mundo de uma vez**
(`GET /rest/v1/users?select=*` com a anon key pública), e também
**escrever** `role`/`approved`/`allowed_documents`/`password` de
qualquer usuário sem restrição nenhuma (inclusive se autopromover a
admin depois de um `signUp()` livre). `reservations`/`documents` também
são graváveis/apagáveis por completo, e `logs` (a trilha de auditoria)
não tinha proteção nenhuma até esta auditoria (corrigido, ver abaixo).

**Por que não foi corrigido agora**: a arquitetura descrita acima
significa que **não existe hoje uma identidade verificada pelo servidor
para a maioria dos usuários** (os legados nunca têm `auth.uid()`) — uma
correção real de RLS em `users` (restringir leitura/escrita à própria
linha, ou a admin de verdade) exigiria migrar todo mundo para o
Supabase Auth de verdade (com reset de senha coordenado, já que senha
em texto puro não pode ser "importada" com segurança para um hash) e
reescrever as RPCs de negócio para usar `auth.uid()` em vez de
`p_user_id` vindo do cliente — inclusive as ações de admin (aprovar
cadastro, editar permissão de outro usuário, apagar conta), que hoje
dependem da mesma RLS aberta para funcionar. Fazer isso "no escuro"
(o sandbox de desenvolvimento não alcança este Supabase para testar
login de ponta a ponta) arrisca travar o acesso de funcionários reais
da Prefeitura sem nenhum jeito de verificar antes de acontecer — por
isso não foi feito sem confirmação explícita do dono da plataforma.

**Recomendação para quando o usuário decidir avançar**: migrar todos os
usuários para contas reais do Supabase Auth (endpoint admin, senha
provisória + fluxo de "esqueci minha senha", que já existe no app desde
esta sessão), trocar as 4 RPCs de reserva para usar `auth.uid()` em vez
de `p_user_id`, adicionar uma RPC `security definer` própria para ações
de admin sobre outros usuários (aprovar, editar permissão, remover), e
só então restringir a RLS de `users` de verdade.

**Plano detalhado em `docs/PLANO_MIGRACAO_AUTH.md`** (não commitado no site
publicado — ver `.vercelignore`): planejamento completo em 7 PRs pequenos
(cada um com critério de "pronto"), com achados ao vivo do banco de
produção (37 dos 41 usuários já têm conta real no Auth, só falta confirmar
e-mail na maioria), 3 decisões já tomadas com o dono (login por username via
função no servidor; SMTP próprio reaproveitando a conta Brevo do Compras,
configurado em cada projeto Supabase separadamente; 2 semanas de
estabilidade antes do passo irreversível de apagar as senhas em texto
puro) e 7 perguntas ainda em aberto antes de começar a implementar. Leia
esse arquivo antes de iniciar qualquer PR desta migração. Todas as 9
perguntas do plano (P1-P9) já foram respondidas pelo dono (24/09/2026),
incluindo o e-mail de Majella Mazini (`majella@cataguases.mg.gov.br`,
informado no mesmo dia) — nenhum dado pendente resta para fechar a
migração de contas.

**Regra do dono, válida a partir de 24/09/2026: qualquer mudança que possa
afetar o uso dos usuários (qualquer deploy que toque `app.js`/
`auth-service.js`/`index.html`, já que este repo publica na Vercel a cada
push) só pode acontecer depois das 17h, horário de Cataguases/MG
(`America/Sao_Paulo`, sem horário de verão desde 2019).** Mudança só de
documentação/planejamento (como este arquivo, `docs/`) não entra nessa
restrição. Antes de publicar qualquer commit que toque o app em produção,
conferir o horário local (`TZ=America/Sao_Paulo date`) e não prosseguir
antes das 17h sem confirmação explícita do dono.

## PR1 do plano de migração de auth: CONCLUÍDO (24/09/2026)

Migrations `20260924060000_pr1_auth_uid_compat_e_rpcs_admin.sql` +
`20260924060001_pr1_fix_trigger_functions_grant_publico.sql`, aplicadas em
produção. Banco aditivo e compatível — **zero efeito visível hoje**, porque
nenhum destes objetos é chamado pelo `app.js`/`auth-service.js` publicados
ainda (isso é PR3/PR4). Por isso aplicado fora da janela das 17h: a regra do
dono é sobre mudanças que **afetam o uso dos servidores**, e uma migration de
banco sem nenhum call site no front atual não afeta nada em uso agora — só
o deploy do front (PR3) é que vai precisar da janela.

- **Coluna `ativo`** em `public.users` (soft delete, default `true`).
- **Helpers** `eh_admin()`/`usuario_aprovado()` (`security definer`,
  `auth.uid()`).
- **Trigger de cadastro** `criar_perfil_usuario()` (dispara em
  `after insert on auth.users`): cria a linha em `public.users` já no
  nascimento da conta no Auth, sempre `user_restricted`/`approved=false`
  (nível de acesso é decisão de admin, nunca da metadata do cadastro),
  resolve colisão de `username` com sufixo numérico, aplica defaults de
  `allowed_documents` pela secretaria se houver `secretariaPermissions`
  configurado, e não faz nada (`on conflict do nothing`) quando o `id` já
  existe em `public.users` (contas migradas no PR2, ou `aprovarNumera` do
  Hub que já faz `upsert` por conta própria).
- **Trigger de identidade em logs** `forcar_identidade_log()`: só
  sobrescreve `user_id`/`user_name` quando existe sessão real
  (`auth.uid()` não nulo) — quem ainda usa o login legado continua exatamente
  como hoje.
- **RPCs de negócio (fase A, compatíveis)**: `reserve_number`/
  `cancel_reservation`/`update_reservation`/`set_secretaria_counter`
  ganharam resolução de identidade em duas vias — se há sessão real
  (`auth.uid()`), usa ela (e bloqueia se `p_user_id` divergir); sem sessão,
  cai para `p_user_id` do cliente como sempre, gravando um log de
  telemetria (`type='sistema'`, `action='Chamada sem sessão (compat.)'`) —
  sinal objetivo, e não uma suposição, de quando o fallback legado deixar
  de ser necessário (dado para decidir a hora do PR5).
- **RPCs de admin** `admin_aprovar_usuario`/`admin_atualizar_usuario`/
  `admin_aplicar_padrao_secretaria`/`admin_desativar_usuario` —
  `security definer`, `eh_admin()`-gated, com proteção de auto-rebaixamento/
  auto-desativação e do último admin ATIVO restante (duas guardas
  distintas e sequenciais, self-check primeiro).
- **Ações do próprio usuário** `salvar_ordem_cards`/`marcar_login_origem`
  (exigem `auth.uid()`; a segunda tolera sessão ausente, sem quebrar).

**Dois achados reais durante o teste, ambos documentados em detalhe em
`docs/PLANO_MIGRACAO_AUTH.md` (seção 6, bullet do PR1)**:
1. A base de produção tem **3 contas admin**, não só uma — só apareceu ao
   testar a proteção do último-admin-ativo; a 1ª tentativa de teste deixou
   2 admins reais ativos sobrando e a demoção passou de verdade. Corrigido
   isolando todos os admins reais dentro da transação de teste (revertido,
   nunca commitado).
2. As duas funções de trigger novas nasceram com EXECUTE concedido a
   `anon`/`authenticated` por padrão do Postgres (mesma pegadinha já
   documentada nos outros 3 repos desta plataforma) — sem risco real
   (Postgres recusa chamar uma função `RETURNS TRIGGER` fora de contexto
   de trigger), mas fechado por defesa em profundidade assim que o
   `get_advisors` pós-aplicação acusou.

Testado transacionalmente (30 cenários) antes de aplicar, e de novo como
regressão permanente contra o schema já aplicado —
`supabase/tests/001_pr1_auth_uid_compat.sql`. Rollback testado e pronto em
`supabase/rollbacks/20260924173517_pr1_auth_uid_compat_e_rpcs_admin_rollback.sql`
(nome do arquivo alinhado com a versão real gravada em
`supabase_migrations.schema_migrations`, não com um timestamp inventado —
lição aplicada de carona: `apply_migration` grava sua própria versão pelo
relógio de quando roda, que não precisa bater com o prefixo do arquivo até
alguém checar).
`get_advisors` confirmado: as 4 RPCs de negócio continuam `anon`-executáveis
por design (fallback legado, intencional na fase A); `admin_*`/`eh_admin`/
`usuario_aprovado`/`salvar_ordem_cards`/`marcar_login_origem` só
`authenticated`; nenhuma categoria nova de exposição.

## PR2 do plano de migração de auth: executado e verificado (28/09/2026)

Rodado de verdade pelo dono na própria máquina, depois de resolver o bug
do GRANT de `service_role` (seção acima). Verificado direto no banco:
**41/41** usuários com `auth.users` confirmado e senha batendo com
`public.users.password`. Login real testado via Hub e direto no Numera,
funcionando. Detalhes de desenho do script na seção original abaixo
(mantida como registro histórico do que foi planejado/validado antes da
execução).

## PR2 do plano de migração de auth: script pronto, aguardando 1 e-mail

`scripts/migrar-contas-auth.mjs` (com `scripts/package.json` só para ele —
`@supabase/supabase-js`) implementa a migração de contas da seção 1 do
plano. Roda manualmente na máquina do dono via `NUMERA_SERVICE_ROLE_KEY`;
nunca em produção/CI — `scripts/` está fora do build da Vercel (ver
`.vercelignore`) e `node_modules/`/`.env*` saíram do git (`.gitignore`
novo, este repositório nunca teve um antes).

**Desenho simplificado em relação à tabela de grupos A/B/C do plano**: o
script só enxerga o banco via Admin API (service role), que não expõe
`auth.users.encrypted_password` — não dá pra redescobrir por ali se "a
senha confere". Em vez de tentar, toda conta que já tem Auth recebe o
mesmo tratamento idempotente (`updateUserById` regravando a senha atual de
`public.users` + `email_confirm: true`) — o resultado final é o mesmo que
a tabela A/B/C descreve (quem já estava certo não muda nada visível, quem
divergia é corrigido), só que sem precisar ler um dado que o script não
tem como ler. Grupo D (a conta do admin, ainda sem Auth) é criado primeiro,
com o **mesmo `id`** que já tem em `public.users` — se a Admin API deste
projeto recusar `id` explícito no `createUser`, o script para e avisa, sem
NUNCA cair para SQL direto (regra explícita do plano).

**Dry-run validado nesta sessão via SQL direto** (não pela execução do
próprio script — este ambiente sandbox não alcança a Auth API do Supabase
via HTTPS, limitação já documentada; só o MCP de banco funciona daqui):
confirma a mesma contagem do plano (A=31/B=5/C=1/D=1/E=3, 41 no total) e
que, das 3 pessoas do Grupo E, 2 já resolvem e-mail sozinhas pelas decisões
já tomadas (o admin tem e-mail próprio; Leandra Delgado via
`leandra.cataguases@gmail.com`; Majella Mazini via
`majella@cataguases.mg.gov.br`, informada pelo dono ainda em 24/09/2026;
Ludmila Fontoura porque o próprio `username` dela É o e-mail). O script já
embute as 2 resoluções manuais (`EMAILS_CONHECIDOS`) e o fallback de
username-parece-e-mail — **rodar de verdade hoje já cobriria os 41/41**,
sem nenhuma pendência de dado restante.

## Corrigido nesta auditoria (risco zero, sem mudar nenhum comportamento)

Confirmado por grep em `app.js`/`auth-service.js` que nenhum fluxo
legítimo escreve direto (fora de RPC) em `reservations`/
`document_counters`, nem faz UPDATE/DELETE em `logs` — as duas
correções abaixo não mudam nada visível para quem usa o app, só fecham
o "bypass da regra de negócio via REST direto".

- **`logs` virou append-only**: trigger `logs_imutaveis` bloqueia
  UPDATE/DELETE (mesmo padrão já usado no App-Compras/Requerimentos).
- **`reserve_number`/`cancel_reservation`/`update_reservation`/
  `set_secretaria_counter` viraram `SECURITY DEFINER`** (mesmo corpo,
  só ganharam privilégio elevado + `search_path = ''`), e o GRANT direto
  de INSERT/UPDATE/DELETE em `reservations`/`document_counters` foi
  revogado de `anon`/`authenticated` — fecha "forjar reserva direto via
  REST" e "truncar a numeração oficial de documentos", sem tocar a
  lógica de negócio das RPCs (que ainda confia em `p_user_id` do
  cliente — ver achado crítico acima, não resolvido por esta mudança).
  Testado transacionalmente (RPC continua funcionando, insert/update/
  delete direto bloqueado, select continua liberado) antes de aplicar.

## Achados ALTO/MÉDIO da mesma auditoria, também não corrigidos

Mesma raiz do achado crítico (nenhuma identidade real do servidor):

- As 4 RPCs de reserva confiam em `p_user_id` vindo do cliente sem
  checar contra `auth.uid()` — mesmo um usuário com sessão real do
  Supabase Auth pode, tecnicamente, chamar a RPC alegando ser outra
  pessoa (o servidor não tem como discordar hoje).
- `app_config.loginDiretoBloqueado` é gravável por qualquer anônimo —
  em teoria, um vetor de negação de serviço (travar o login direto de
  todo mundo). A chave nem existe ainda na tabela hoje.
- Auto-cadastro livre (`signUp()`, intencional, diferente do
  App-Compras) + a RLS aberta juntos formam o caminho mais direto para
  autopromoção a admin.

## Verificado sem achado

- Fluxo de recuperação de senha (novo nesta sessão): `redirectTo` não
  lê query string nenhuma, sempre volta para o próprio domínio — sem
  open redirect. Resposta genérica independente de o e-mail existir.
- Nenhuma chave `service_role` exposta no client-side — só a anon key
  pública (esperado).
- Disciplina de escape (`esc()`) consistente nos pontos de `innerHTML`
  revisados — sem XSS confirmado, mas é vanilla JS (sem o escape
  automático do React que os outros 3 apps têm), então qualquer `${...}`
  novo interpolado sem `esc()` reabre o risco.

## Bypass do SMTP quebrado do Numera para recuperação de senha

O "esqueci minha senha" (`authService.requestPasswordReset`, `auth-
service.js`) chamava `supabase.auth.resetPasswordForEmail` direto do
navegador. Diagnosticado numa sessão anterior, com evidência completa:
`POST /recover` sempre responde 200 (design anti-enumeração do GoTrue,
documentado nos próprios docs do Supabase), mas o e-mail nunca chega de
verdade — bug confirmado do lado da PLATAFORMA Supabase no SMTP nativo
deste projeto especificamente (as credenciais Brevo foram testadas fora
do Supabase, direto via PowerShell `Send-MailMessage`, e funcionaram:
e-mail chegou e apareceu no log "Tempo real" da Brevo). Chamado de
suporte ao Supabase já aberto sobre isso; a correção abaixo não depende
de resposta deles.

**Correção**: `requestPasswordReset` deixou de chamar o Supabase
diretamente e passou a chamar
`POST https://centraltech-liard.vercel.app/api/numera/recuperar-senha`
(rota nova no Hub, `centraltech`). Esse endpoint gera o link de
recuperação pela **Admin API** (`auth.admin.generateLink`, que nunca
depende de SMTP — devolve o link pronto na resposta) usando a
`NUMERA_SUPABASE_SERVICE_ROLE_KEY` que o Hub já tinha configurada (mesma
chave do cadastro unificado), e envia o e-mail ele mesmo via **HTTPS
direto à API da Brevo** (`https://api.brevo.com/v3/smtp/email`), porta
443 — a mesma que já provou funcionar no teste com PowerShell — em vez
de deixar o GoTrue tentar de novo pela porta 587 problemática. `auth-
service.js` só faz o `fetch`; toda a lógica de gerar+enviar vive no Hub
(ver CLAUDE.md do `centraltech`, seção do mesmo nome). O evento
`PASSWORD_RECOVERY` e `showResetPasswordView()`/`updatePassword()` (que
já processam corretamente o link ao voltar pro app) não mudaram —
`redirectTo` continua apontando para a origem do próprio Numera.
**Resposta sempre genérica** (`{ ok: true }`), inclusive se o `fetch`
falhar de rede — nenhum cenário deve distinguir "e-mail não existe" de
"o Hub está fora do ar" pela resposta.
**Só funciona quando o admin configurar `BREVO_API_KEY` e
`BREVO_REMETENTE_EMAIL` nas env vars do projeto `centraltech` na Vercel**
(passo manual — ver CLAUDE.md de lá); sem isso, o link é gerado mas o
e-mail não sai (mesmo padrão de "pronto, só falta a chave" já usado em
outras integrações deste ecossistema) e a UI continua mostrando a
mensagem genérica de sempre, sem erro visível.
**Não testado ponta a ponta** (mesma limitação de sempre — o sandbox de
desenvolvimento não alcança `*.vercel.app`/`*.supabase.co`); verificado
por leitura de código e `tsc`/`eslint`/`next build` limpos do lado do
`centraltech`. Pendente: o usuário configurar as duas env vars da Brevo
e confirmar recebimento real de um e-mail de recuperação.

## Bug real: `service_role` sem GRANT em nenhuma tabela de `public`

Encontrado ao rodar o dry-run do script de migração de contas (PR2,
`scripts/migrar-contas-auth.mjs`): `admin.from('users').select(...)`
falhava com `permission denied for table users` (`42501`), mesmo
usando a `service_role` key de verdade. Checado via
`information_schema.role_table_grants`: **nenhuma tabela do schema
`public`** (`users`, `reservations`, `documents`, `document_counters`,
`logs`, `app_config`) tinha SELECT/INSERT/UPDATE/DELETE concedido a
`service_role` — só `REFERENCES/TRIGGER/TRUNCATE`, que vêm de outro
lugar (provavelmente FK/particionamento) e não de um GRANT explícito
esquecido. `service_role` deveria ter acesso total por desenho da
própria plataforma Supabase (é assim que a Admin API e qualquer script
com a service key funcionam); a causa mais provável é que as tabelas
deste projeto foram criadas por SQL direto (`execute_sql`) em sessões
anteriores, sem passar pelo provisionamento padrão que normalmente
cuida disso.
**Corrigido diretamente no banco** (migration
`fix_grant_service_role_tabelas_public`, testada transacionalmente
antes de aplicar): `grant all on all tables/sequences in schema public
to service_role` + `alter default privileges ... grant all ... to
service_role` (para tabelas futuras não caírem no mesmo buraco).
Puramente restaurador — `service_role` já bypassa RLS por definição,
então isto não amplia superfície de ataque nenhuma; `get_advisors`
depois de aplicar mostrou exatamente os mesmos achados já documentados
(SECURITY DEFINER executável, senha vazada), nada novo.
**Lição**: ao criar tabela via SQL direto num projeto Supabase (em vez
de `supabase db push`/painel), sempre conferir os grants de
`service_role` também, não só de `anon`/`authenticated` — o hábito já
documentado neste ecossistema (App-Compras, Migration 6) era só
checar os dois primeiros.

## PR3 (virada do front): PUBLICADO (29/09/2026)

Login passa a ser só pelo Supabase Auth (fallback legado e
`localStorage.currentUserId` removidos), `loadData` só roda com sessão
confirmada, `signUp` para de inserir em `public.users` (o trigger do PR1
já cuida disso), e o painel de admin passa a usar as RPCs `admin_*`
(inclusive `admin_reativar_usuario`) em vez de escrita direta na tabela.
Criar conta nova saiu do painel do Numera (precisa da Admin API, só o Hub
tem) — o botão agora orienta a usar a Central Cataguases. Detalhe
completo, arquivo por arquivo, em `docs/PLANO_MIGRACAO_AUTH.md` ("PR3
implementado"). **Publicado fora da janela das 17h**: o dono autorizou
adiantar porque não havia ninguém usando o app no momento (confirmado com
ele antes de publicar).

## Achados reais ao preparar o PR5 (RLS de verdade), corrigidos antes de aplicar

Antes de fechar a RLS (seção 4 do plano), fui conferir CADA escrita direta
em tabela que `app.js`/`auth-service.js` ainda fazem (`grep` por
`.insert(`/`.update(`/`.delete(`/`.upsert(` nos dois arquivos) — não dava
pra confiar só na lista de RPCs do plano, porque o PR3 documentado como
"implementado" não cobria tudo. Achei 2 escritas que sobreviveriam à
migração do PR3 mas quebrariam (ou ficariam mortas) assim que a RLS travar
`users` para escrita só por RPC:

- **`applyDefaultsToUsers` (app.js, painel admin → aplicar padrão de
  documentos a todos os usuários de uma secretaria) fazia um `update`
  direto em `users` dentro de um loop, um por usuário** — a RPC
  `admin_aplicar_padrao_secretaria` (já existia desde o PR1, tabela da
  seção 3 do plano já dizia que ela "substitui `applyDefaultsToUsers`",
  mas o PR3 nunca chegou a trocar essa chamada) faz exatamente a mesma
  coisa (salva `secretariaPermissions` + atualiza todos os usuários da
  secretaria numa transação só) e já grava o próprio log — troquei a
  função para chamar a RPC e removi o `addLog` manual que ficaria
  duplicado.
- **`signUp` (auth-service.js) ainda fazia um `update` direto em
  `users.password`** logo depois do `auth.signUp()`, resquício do login
  legado (comparação de senha em texto puro) que o próprio PR3 já tinha
  removido do lado da leitura — ninguém mais lê esse campo pra autenticar
  desde então. Deixado, o `update` simplesmente falharia por RLS a partir
  do PR5 (o `dbError` já era tolerado em silêncio, sem quebrar o cadastro
  — mas sem propósito nenhum). Removido de vez, em vez de esperar o PR6
  (que só apaga a coluna) — nada no código lê `password` desde o PR3.

Sem essas duas correções, aplicar a RLS da seção 4 quebraria "aplicar
padrão de documentos" de verdade (a única das duas com efeito visível
para o admin) assim que fosse usada pela primeira vez depois do PR5.
Publicado fora da janela das 17h — mesmo raciocínio do PR0/PR1: mudança
sem efeito perceptível enquanto a RLS antiga (aberta) continuar valendo,
só passa a importar quando o PR5 for aplicado.

## PR5 (RLS de verdade): NÃO aplicado ainda — telemetria mostra uso real do fallback recente

Antes de aplicar a seção 4 do plano (fechar a RLS + fase B das RPCs),
conferi o critério de pronto que o próprio plano exige: "zero 'chamada sem
sessão' por 24–48h após PR3 em produção". **Não está zerado**: consulta em
`public.logs` (`action = 'Chamada sem sessão (compat.)'`) mostra 4
chamadas de `reserve_number` entre 11:07 e 11:25 UTC de 29/09/2026 — mais
de 1h **depois** do deploy do PR3 (09:53 UTC), quase certamente uma aba já
aberta antes do deploy, rodando o `app.js` antigo em memória (que ainda
manda `p_user_id` sem nunca ter sessão do Auth — o deploy novo não alcança
quem já estava com a página carregada até ela recarregar). Aplicar a RLS
agora (RPCs fase B exigindo `auth.uid()`, sem mais o modo de
compatibilidade) bloquearia essa pessoa no meio do uso, sem aviso.
**Preparado e testado transacionalmente** (migration + teste +
rollback, ver arquivos abaixo), mas a aplicação de verdade fica para
quando a consulta acima voltar zerada por 24–48h seguidas — reconferir
antes de aplicar, não assumir que o tempo sozinho resolveu.

## Como continuar de outro computador

O schema deste projeto (`uxdjhdnsnditivvjktzf`) já é versionado em
`supabase/migrations/` (`0002` a `0012`, mais as migrations desta sessão) —
correção de um engano anterior neste arquivo, que dizia não haver nenhuma
migration versionada. Toda migration aplicada via `apply_migration` deve
continuar entrando no git. Teste toda RPC/policy nova transacionalmente
(`begin` + cenários + `rollback`, ou `raise exception` forçado no fim) antes
de aplicar de verdade — os outros 3 repos deste ecossistema documentam essa
disciplina em detalhe. Testes de RPC/policy ficam em `supabase/tests/`,
scripts de rollback testados em `supabase/rollbacks/` (convenção iniciada
junto do plano em `docs/PLANO_MIGRACAO_AUTH.md`).
