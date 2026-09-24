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
perguntas do plano (P1-P9) já foram respondidas pelo dono (24/09/2026); só
falta o e-mail de 1 usuária (Majella Mazini) para fechar a migração de
contas por completo.

**Regra do dono, válida a partir de 24/09/2026: qualquer mudança que possa
afetar o uso dos usuários (qualquer deploy que toque `app.js`/
`auth-service.js`/`index.html`, já que este repo publica na Vercel a cada
push) só pode acontecer depois das 17h, horário de Cataguases/MG
(`America/Sao_Paulo`, sem horário de verão desde 2019).** Mudança só de
documentação/planejamento (como este arquivo, `docs/`) não entra nessa
restrição. Antes de publicar qualquer commit que toque o app em produção,
conferir o horário local (`TZ=America/Sao_Paulo date`) e não prosseguir
antes das 17h sem confirmação explícita do dono.

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
