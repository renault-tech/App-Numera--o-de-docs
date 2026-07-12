# 04 — Segurança

## 1. Diagnóstico atual

| # | Vulnerabilidade | Gravidade | Evidência |
|---|---|---|---|
| 1 | RLS com política `USING (true) WITH CHECK (true)` em todas as tabelas — qualquer pessoa com a anon key (que é pública, está no `app.js` servido a todos) pode ler/alterar/apagar tudo | 🔴 Crítica | `schema.sql` linhas 76–81 |
| 2 | Senhas em **texto puro** na tabela `users`, legíveis por qualquer um (via item 1) | 🔴 Crítica | `schema.sql` linha 21, `auth-service.js` linha 36 |
| 3 | Login legado compara senha em query (`.eq('password', password)`) — além de inseguro, permite enumeração | 🔴 Crítica | `auth-service.js` linha 94 |
| 4 | Controle de permissão (admin, restrito etc.) **apenas no frontend** — o banco aceita qualquer operação | 🔴 Crítica | consequência do item 1 |
| 5 | XSS possível: campos de usuário (assunto, nome, ementa) inseridos via `innerHTML` sem escape | 🟡 Alta | `app.js` (renderHistory, renderLogs etc.) |
| 6 | Logs deletáveis/alteráveis (auditoria não confiável) | 🟡 Alta | política aberta |
| 7 | Aprovação de conta verificada só no cliente (usuário não aprovado pode chamar a API direto) | 🟡 Alta | `auth-service.js` |

> **Nota**: a anon key do Supabase exposta no código **não é** o problema — ela
> é pública por design. O problema é o RLS aberto. Toda a segurança de um app
> client-side + Supabase mora nas políticas RLS e nas funções `security definer`.

## 2. Plano de correção

### Fase S1 — Migrar autenticação 100% para Supabase Auth

1. Todo usuário passa a ter e-mail (já existe coluna; tornar obrigatório);
2. Para usuários legados sem conta Auth: admin dispara convite
   (`supabase.auth.admin.inviteUserByEmail` via script administrativo) ou o
   usuário usa "primeiro acesso" que cria a conta Auth com o e-mail cadastrado;
3. Trocar tabela `users` por `profiles` (FK para `auth.users`, **sem** coluna
   `password`) — ver doc 03;
4. Remover o fallback legado do `auth-service.js` (o método `signIn` passa a
   ser apenas `signInWithPassword`);
5. Apagar a coluna `password` (migração final, após todos migrados).

### Fase S2 — Políticas RLS reais

Helpers:

```sql
create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles
   where id = auth.uid() and approved and active;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;
```

Políticas por tabela (substituem as "allow all"):

```sql
-- PROFILES: cada um vê o próprio; admin vê/edita todos;
-- o próprio usuário só edita campos não sensíveis (via função, não update direto)
drop policy if exists "Enable all access for all users" on public.profiles;
create policy profiles_select_own  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for update using (public.is_admin());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());

-- DOCUMENT_TYPES: leitura para autenticados aprovados; escrita só admin
create policy dt_select on public.document_types for select
  using (public.current_role() is not null);
create policy dt_admin_all on public.document_types for all
  using (public.is_admin()) with check (public.is_admin());

-- RESERVATIONS: leitura para autenticados aprovados;
-- INSERT/UPDATE **bloqueados** — só via reserve_number()/cancel_reservation()
create policy res_select on public.reservations for select
  using (public.current_role() is not null);
-- (nenhuma política de insert/update/delete = negado por padrão;
--  as funções security definer contornam o RLS de forma controlada)

-- AUDIT_LOGS: leitura só admin; escrita só pelas funções (nenhuma política de insert)
create policy logs_admin_select on public.audit_logs for select using (public.is_admin());
-- sem update/delete: logs imutáveis

-- APP_CONFIG: leitura autenticados; escrita admin
create policy cfg_select on public.app_config for select using (public.current_role() is not null);
create policy cfg_admin  on public.app_config for all using (public.is_admin()) with check (public.is_admin());
```

Pontos-chave:
- **Reserva e anulação nunca acontecem por INSERT/UPDATE direto** — só pelas
  funções RPC, que validam papel, aprovação e permissões no servidor;
- Usuário **não aprovado** não passa em `current_role()` → não lê nada;
- `revoke` explícito nas funções e `grant execute` apenas para `authenticated`:
  ```sql
  revoke all on function public.reserve_number from public, anon;
  grant execute on function public.reserve_number to authenticated;
  ```

### Fase S3 — Frontend

- Eliminar `innerHTML` com dados dinâmicos (usar `textContent`/templates) — fecha o XSS;
- Tratar erros da RPC exibindo a mensagem de negócio, sem vazar detalhes internos;
- Logout limpa sessão Supabase + estado; remover `currentUserId` do localStorage
  (a sessão do Supabase Auth já persiste com refresh token).

### Fase S4 — Hardening contínuo

- Rodar `get_advisors` do Supabase (security + performance) após cada migração;
- Ativar proteção de senha vazada e requisitos mínimos no painel Auth;
- Considerar confirmação de e-mail obrigatória;
- Revisar CDNs no `index.html`: fixar versões com SRI (`integrity=`) ou servir
  as libs localmente (jsPDF, XLSX, FileSaver, supabase-js);
- Backups: ativar PITR ou agendar dump diário do banco.

## 3. Modelo de ameaças (resumo)

| Ator | Ameaça | Mitigação |
|---|---|---|
| Visitante anônimo com a anon key | Ler/alterar dados via API REST do Supabase | RLS fases S2; sem política = negado |
| Usuário autenticado malicioso | Reservar sem permissão, forjar número, editar log | Funções RPC com validação server-side; logs insert-only |
| Usuário não aprovado | Usar o sistema antes da aprovação | `current_role()` exige `approved and active` |
| Ex-funcionário | Continuar acessando | Flag `active=false` corta acesso imediatamente (RLS) |
| Erro operacional | Perda de dados | Backups/PITR; anulação em vez de delete |

## 4. Checklist de verificação pós-implementação

- [ ] `select * from users` (ou `profiles`) via anon key **sem login** retorna vazio/erro;
- [ ] INSERT direto em `reservations` via API com usuário comum → negado;
- [ ] UPDATE/DELETE em `audit_logs` → negado até para admin;
- [ ] Usuário `user_readonly` chamando `reserve_number` → erro de negócio;
- [ ] Usuário restrito reservando tipo não permitido → erro de negócio;
- [ ] Nenhuma coluna `password` no banco;
- [ ] Dois `reserve_number` simultâneos (teste de corrida, doc 09) → números distintos.
