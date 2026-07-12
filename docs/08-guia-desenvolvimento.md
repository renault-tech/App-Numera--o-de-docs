# 08 — Guia de Desenvolvimento

## 1. Estado do repositório e limpeza (Fase 0)

O repositório acumulou artefatos de desenvolvimento iterativo. Inventário:

### Arquivos vivos (manter)
```
index.html            # shell do app
app.js                # lógica principal (a ser modularizada na Fase 2)
auth-service.js       # autenticação
autocomplete.js       # autocomplete de documentos
styles.css            # estilos
schema.sql            # schema do banco (mover p/ supabase/migrations/0001_initial.sql)
migration_add_email.sql # idem (0002)
vercel.json           # config de deploy
logo-prefeitura*.png  # identidade (otimizar, doc 06)
README.md             # reescrever (está desatualizado — fala em localStorage)
DEPLOY.md             # guia de deploy
INSTRUCOES.txt        # avaliar: fundir conteúdo útil no README e remover
docs/                 # esta documentação
```

### Arquivos a REMOVER (backups e patches já aplicados)
```
app-old.js  app-old-complex.js  app-original-backup.js
app-backup-20260111-183713.js  app-before-integration.js  app-before-views.js
app-part1.js  app-part2.js  app_head.js  app_restored_part2.js
apply-views.js  apply-views-v2.js  apply-views-clean.js  apply-views-fixed.js
apply-views-final.js  apply-final-clean.js  apply-polished.js
patch_app.js  patch_app.py  patch_header.js  patch-funcional.js
add-features.js  add-navigation.js  activate-features.js  reset.js
styles-backup.css  teste.html  debug_auth.html
user-modal-template.html  logs-html-snippets.html   # se o conteúdo já está no app.js
logs-system.js  logs-styles.css  user-permissions.js user-permissions-styles.css
   # ^ verificar antes: se não são referenciados pelo index.html, remover
.temp_ag_kit/          # kit de UI de outro projeto (guardar referência no doc 05 se quiser)
```

> Regra: **o Git é o backup.** Nunca versionar `*-backup.*`, `*-old.*`,
> `patch-*.js`. Qualquer versão antiga é recuperável pelo histórico.

### `.gitignore` sugerido
```gitignore
node_modules/
.DS_Store
*.log
.env
.env.*
.vercel/
.temp_*/
```

## 2. Estrutura alvo do repositório (pós Fase 2)

```
/
├── index.html
├── src/
│   ├── main.js  config.js
│   ├── api/         # client.js documents.js reservations.js users.js logs.js
│   ├── state/       # store.js
│   ├── ui/          # router.js  views/  components/
│   └── utils/       # format.js dom.js
├── styles/
│   ├── tokens.css   # design tokens (doc 05)
│   ├── base.css     # reset + elementos
│   └── components.css
├── assets/          # logos otimizados, ícones svg
├── supabase/
│   └── migrations/  # 0001_initial.sql, 0002_..., em ordem
├── docs/            # esta documentação
├── tests/           # doc 09
├── vercel.json
└── README.md
```

## 3. Convenções de código

- **Idioma**: UI e mensagens em pt-BR; nomes de código (variáveis, funções,
  tabelas) em inglês — o código atual mistura (`renderAdminSecretariats`,
  `cargo`, `setor`); colunas legadas em pt permanecem, novas em inglês;
- **JS**: ES2020+, módulos ES, `const`/`let` (nunca `var`), async/await,
  early-return; sem frameworks até a etapa B;
- **Proibido**: `innerHTML` com dados dinâmicos (doc 04), `alert/confirm/prompt`
  (usar componentes, doc 05), acesso ao Supabase fora de `src/api/`;
- **CSS**: só custom properties de `tokens.css`; classes em kebab-case com
  prefixo do componente (`.dialog__title`, `.btn--danger`);
- **SQL**: toda mudança de banco é um arquivo novo em `supabase/migrations/`
  com prefixo numérico sequencial; nunca editar migração já aplicada;
- Formatação: adotar Prettier (default) + ESLint básico quando houver `package.json`.

## 4. Fluxo de trabalho Git

- `master` = produção (Vercel faz deploy automático no push);
- Branches por item do roadmap: `feat/1.2-reserve-rpc`, `fix/3.1-cancel-badge`;
- Commits pequenos, mensagem imperativa com prefixo
  (`feat:`, `fix:`, `refactor:`, `docs:`, `sql:`);
- PR obrigatório para `master` quando houver mais de uma pessoa; enquanto for
  uma pessoa só, ainda assim testar o checklist do doc 09 antes do push;
- Nunca commitar credenciais além da **anon key** (que é pública; a
  `service_role` key JAMAIS vai para o repo).

## 5. Ambiente de desenvolvimento

1. Clonar o repo;
2. Servir estático: `npx serve .` (ou extensão Live Server) — abrir `http://localhost:3000`;
3. Apontar `config.js` (ou as constantes no topo do `app.js`, enquanto existirem)
   para o **projeto/branch Supabase de desenvolvimento** — nunca produção;
4. Aplicar migrações pendentes no banco de dev antes de testar;
5. Usuário de teste: criar via tela de cadastro + aprovar com um admin de dev.

## 6. Deploy

- Push para `master` → Vercel publica (config em `vercel.json`);
- Antes do deploy que dependa de banco: aplicar a migração em produção
  **antes** do push do frontend (mudanças aditivas primeiro — doc 03 §6);
- Após deploy: smoke test (login, reservar, buscar, logout) e `get_advisors`
  no Supabase.

## 7. Documentação viva

- Alterou regra de negócio → atualizar doc 01;
- Alterou banco → doc 03 + nova migração;
- Concluiu item do roadmap → marcar ✅ no doc 07;
- Decisão arquitetural nova → adicionar ADR no doc 02 §3;
- Reescrever o `README.md` raiz (curto: o que é, como rodar, link para `docs/`).
