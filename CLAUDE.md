# Numera — Sistema de Numeração de Documentos

Plataforma web para reserva única e auditável de números de documentos oficiais
(ofícios, memorandos, portarias etc.), substituindo o controle manual em papel.
Nome do produto: **Numera**.

## Leia antes de implementar qualquer coisa

A documentação completa de planejamento está em **`docs/`** — comece por
`docs/README.md` (índice). Em especial:

- **Regras de negócio invioláveis**: `docs/01-visao-geral.md` §3 — a RN-01
  (nunca repetir número) é a razão de ser do sistema;
- **Prioridades**: `docs/07-roadmap.md` — trabalhe as fases em ordem; os itens
  🔴 (corrida na reserva, RLS aberto, senhas em texto puro) bloqueiam o resto;
- **Banco**: `docs/03-modelo-de-dados.md` — a reserva DEVE ser feita pela
  função SQL `reserve_number()` (RPC), nunca por insert/update do cliente;
- **Convenções e limpeza do repo**: `docs/08-guia-desenvolvimento.md`.

## Stack atual

- Frontend: JavaScript vanilla (`app.js`), HTML/CSS, sem build; deploy no Vercel;
- Backend: Supabase (PostgreSQL + Auth), acessado direto do browser;
- Idioma da UI: português (pt-BR).

## Cuidados

- Muitos arquivos na raiz são backups/patches obsoletos (lista no doc 08 §1) —
  não os use como referência; o código vivo é `index.html`, `app.js`,
  `auth-service.js`, `autocomplete.js`, `styles.css`;
- Não desenvolver apontando para o banco Supabase de produção;
- Nunca commitar a chave `service_role` do Supabase (a anon key é pública, ok);
- Toda mudança de banco vira migração versionada em `supabase/migrations/`.
