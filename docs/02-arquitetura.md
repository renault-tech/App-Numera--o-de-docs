# 02 — Arquitetura

## 1. Arquitetura atual (as-is)

```
┌──────────────────────────────────────────────┐
│  Browser (SPA vanilla JS)                    │
│  index.html + app.js (~1.880 linhas)         │
│  + auth-service.js + autocomplete.js         │
│  + styles.css                                │
│  Estado global mutável (objeto `state`)      │
│  Renderização via innerHTML                  │
└──────────────┬───────────────────────────────┘
               │ supabase-js (anon key no código)
               ▼
┌──────────────────────────────────────────────┐
│  Supabase                                    │
│  • PostgreSQL: documents, users,             │
│    reservations, logs, app_config            │
│  • Auth (parcial — coexiste com login        │
│    legado por senha em texto puro)           │
│  • RLS habilitado mas com política           │
│    "allow all" (efetivamente aberto)         │
└──────────────────────────────────────────────┘

Deploy: Vercel (site estático, sem build step)
```

### Pontos fortes do que existe
- Simplicidade radical: sem build, sem framework, deploy trivial;
- Funcionalidades já cobrem o fluxo principal (reserva, histórico, admin, logs);
- Supabase já provisionado com schema razoável.

### Problemas identificados (ordem de gravidade)

| # | Problema | Onde | Risco |
|---|---|---|---|
| 1 | **Condição de corrida na reserva**: o cliente lê `current_number`, insere a reserva e depois faz `update` — dois usuários simultâneos recebem o mesmo número | `app.js` (`reserveNumber`) | 🔴 Quebra a RN-01, razão de ser do sistema |
| 2 | **RLS "allow all"**: qualquer pessoa com a anon key (pública por natureza) lê/escreve todas as tabelas, incluindo `users` com senhas | `schema.sql` | 🔴 Vazamento e adulteração de dados |
| 3 | **Senhas em texto puro** na tabela `users` + login legado comparando senha via query | `auth-service.js`, `schema.sql` | 🔴 |
| 4 | **Reset anual no cliente** (`checkYearlyReset` roda quando alguém abre o app) | `app.js` | 🟡 Reset pode não ocorrer/ocorrer em corrida |
| 5 | **Logs mutáveis/deletáveis** pela política aberta | banco | 🟡 Auditoria não confiável |
| 6 | **Monólito frontend**: `app.js` gigante, HTML gerado por strings, estado global, +15 arquivos de backup/patch versionados | repo | 🟡 Manutenção cara, regressões |
| 7 | Dados carregados integralmente na memória (todas reservas/logs) | `loadData` | 🟢 Vai degradar com volume |

## 2. Arquitetura alvo (to-be)

Princípio norteador: **manter o Supabase como backend** (já pago/provisionado,
resolve auth + banco + API) e **mover as regras críticas para dentro do banco**
(funções SQL + RLS), onde não podem ser burladas pelo cliente. O frontend evolui
em duas etapas para não travar o projeto.

```
┌────────────────────────────────────────────────────┐
│  Frontend (etapas abaixo)                          │
│  • Camada de serviços (api/*.js) — única porta     │
│    de acesso ao Supabase                           │
│  • Componentes de UI isolados                      │
│  • Estado centralizado com eventos                 │
└──────────────┬─────────────────────────────────────┘
               │ supabase-js + RPC
               ▼
┌────────────────────────────────────────────────────┐
│  Supabase                                          │
│  • Postgres FUNCTIONS (RPC):                       │
│      reserve_number()  ← atômica, SECURITY DEFINER │
│      cancel_reservation()                          │
│  • RLS real por papel (ver doc 04)                 │
│  • Supabase Auth como única autenticação           │
│  • pg_cron: reset anual server-side                │
│  • Views para históricos/estatísticas              │
│  • Índices para busca (ver doc 06)                 │
└────────────────────────────────────────────────────┘
```

### Etapa A — Refatoração sem troca de stack (recomendado começar aqui)
Continua vanilla JS, mas modularizado com ES Modules (suportado nativamente
pelos browsers-alvo, sem build):

```
src/
├── main.js               # bootstrap
├── config.js             # URL/key Supabase (única ocorrência)
├── api/
│   ├── client.js         # cria o client supabase
│   ├── documents.js      # CRUD tipos de documento
│   ├── reservations.js   # reserve (via RPC), cancel, search
│   ├── users.js          # gestão de usuários
│   └── logs.js           # leitura de logs
├── state/
│   └── store.js          # estado + pub/sub simples
├── ui/
│   ├── views/            # login, home, historico, admin/*
│   ├── components/       # card, modal, toast, table, pagination
│   └── router.js         # troca de views (hash routing)
└── utils/
    ├── format.js         # formatNumber, datas
    └── dom.js            # helpers seguros (sem innerHTML com dados)
```

Regras da etapa A:
- `innerHTML` com dados do usuário é proibido → usar `textContent` /
  `createElement` / templates `<template>` (previne XSS, que hoje é possível
  via campo "assunto");
- Toda chamada ao Supabase passa por `api/*` (facilita a etapa B e testes);
- `alert()`/`confirm()` substituídos por componentes próprios (toast/dialog).

### Etapa B — Framework (quando a equipe decidir escalar)
Se o app crescer (relatórios ricos, dashboards, offline), migrar as views para
**React + Vite + TypeScript**, reaproveitando integralmente a camada `api/` e as
funções SQL. O kit de componentes em `.temp_ag_kit/web/src/components/ui/`
(shadcn-style) pode servir de base visual. **Não iniciar a etapa B antes de
concluir a etapa A e os itens 🔴 do doc 07.**

## 3. Decisões de arquitetura (ADRs resumidos)

### ADR-001 — Numeração gerada por função Postgres (RPC), nunca pelo cliente
**Decisão**: criar `reserve_number(p_doc_id, p_subject, p_ementa)` como função
`SECURITY DEFINER` que incrementa e insere numa única transação, com constraint
`UNIQUE (doc_id, year, number)` como rede de segurança.
**Motivo**: é o único jeito de garantir RN-01 com múltiplos clientes.
**Consequência**: o cliente para de calcular número; apenas exibe o retorno.
SQL completo no doc 03.

### ADR-002 — Supabase Auth como autenticação única
**Decisão**: encerrar o fallback legado (username+senha em query). Migrar
usuários legados criando contas Auth (e-mail obrigatório) e apagar a coluna
`password`.
**Motivo**: senha em texto puro + RLS aberto é o maior risco do sistema.
**Plano de migração** no doc 04.

### ADR-003 — Reset anual via `pg_cron` + verificação preguiçosa
**Decisão**: job diário no banco (00:05 de 1º/jan) + a própria
`reserve_number()` verifica o ano antes de emitir (dupla garantia).
**Motivo**: não depender de alguém abrir o app na virada do ano.

### ADR-004 — Logs e reservas são insert-only
**Decisão**: políticas RLS sem UPDATE/DELETE para `logs`; `reservations` só
admite UPDATE de status (anulação) via função dedicada.
**Motivo**: RN-03 e RN-05 (auditoria confiável).

### ADR-005 — Paginação no servidor
**Decisão**: `loadData()` deixa de baixar tudo; histórico e logs usam
`range()` + filtros no Postgres.
**Motivo**: performance com crescimento dos dados (doc 06).

## 4. Fluxo da reserva (alvo)

```
Usuário clica "Reservar"
  └─▶ UI abre diálogo: assunto (obrigatório), ementa (opcional)
        └─▶ api/reservations.reserve(docId, subject, ementa)
              └─▶ supabase.rpc('reserve_number', {...})
                    └─▶ [Postgres, transação única]
                         1. SELECT ... FOR UPDATE no documento
                         2. Verifica ano / reset anual
                         3. Calcula próximo número
                         4. INSERT em reservations
                         5. UPDATE documents.current_number
                         6. INSERT em logs
                         7. RETURN reserva completa
              ◀─ reserva { number, formatted_number, ... }
        ◀─ UI mostra número final + botão copiar
```

Se a RPC falhar por `unique_violation` (impossível em teoria, é a rede de
segurança), a UI oferece "tentar novamente" — o número seguinte será emitido.

## 5. Ambientes e deploy

| Ambiente | Onde | Observações |
|---|---|---|
| Produção | Vercel + projeto Supabase atual | Deploy automático no push para `master` |
| Desenvolvimento | Local (`npx serve` ou Live Server) + **branch do Supabase** ou projeto separado | Nunca desenvolver apontando para o banco de produção |

Recomendações:
- Criar projeto/branch Supabase de desenvolvimento e trocar a URL/key via
  `config.js` (a anon key é pública por design; o que protege os dados é RLS);
- Versionar migrações em `supabase/migrations/*.sql` (o `schema.sql` atual vira
  a migração 0001) e aplicá-las com Supabase CLI ou MCP — nunca editar o banco
  "na mão" sem registrar a migração.
