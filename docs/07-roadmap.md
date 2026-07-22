# 07 — Roadmap e Backlog

Fases sequenciais. **Não iniciar uma fase antes de fechar os itens 🔴 da
anterior.** Cada item referencia o documento com o detalhe técnico.

## Fase 0 — Fundação e higiene (pré-requisito de tudo)

| # | Item | Ref | Prioridade |
|---|---|---|---|
| 0.1 | Limpar repositório: remover arquivos de backup/patch (`app-old*.js`, `app-backup-*.js`, `apply-*.js`, `patch*.js`, `app-part*.js`, `app_head.js`, `app_restored_part2.js`, `styles-backup.css`, `teste.html`, `debug_auth.html`, `reset.js`, `add-*.js`, `activate-features.js`, `.temp_ag_kit/`) | doc 08 | 🔴 |
| 0.2 | Criar `.gitignore` e mover `schema.sql` para `supabase/migrations/0001_initial.sql` | doc 08 | 🔴 |
| 0.3 | Criar ambiente de desenvolvimento (branch/projeto Supabase separado) | doc 02 §5 | 🔴 |
| 0.4 | Rodar diagnóstico de números duplicados no banco de produção | doc 03 §6 | 🔴 |

**Critério de conclusão**: repo só com arquivos vivos; migrações versionadas;
dev não aponta para produção.

## Fase 1 — Integridade e segurança (o sistema passa a ser confiável)

| # | Item | Ref | Prioridade |
|---|---|---|---|
| 1.1 | Constraint de unicidade — ✅ parcial 13/07/2026: índice `UNIQUE (doc_id, formatted_number)` na migração 0002 (colunas `year`/`status`/anulação seguem pendentes) | doc 03 | 🔴 |
| 1.2 | ✅ 13/07/2026 — Função `reserve_number()` criada (`supabase/migrations/0002_reserve_number_rpc.sql`) e frontend chama via RPC com fallback legado. **Pendente: rodar a migração no projeto Supabase de produção** | doc 03 §3 | 🔴 |
| 1.3 | Reset anual server-side (pg_cron + verificação na função) | doc 03 §5 | 🔴 |
| 1.4 | Migração para Supabase Auth exclusivo; remover senhas em texto puro | doc 04 S1 | 🔴 |
| 1.5 | Políticas RLS reais em todas as tabelas | doc 04 S2 | 🔴 |
| 1.6 | Logs imutáveis (insert-only) | doc 04 | 🔴 |
| 1.7 | Corrigir XSS (eliminar `innerHTML` com dados) | doc 04 S3 | 🟡 |
| 1.8 | Teste de corrida automatizado (2+ reservas simultâneas) | doc 09 | 🟡 |

**Critério de conclusão**: checklist do doc 04 §4 todo verde; RN-01 garantida
por constraint + teste.

## Fase 2 — Refatoração do frontend (etapa A da arquitetura)

| # | Item | Ref | Prioridade |
|---|---|---|---|
| 2.1 | Quebrar `app.js` em módulos ES (`api/`, `ui/`, `state/`, `utils/`) | doc 02 §2 | 🟡 |
| 2.2 | Router por hash (URLs por tela, voltar/avançar funcionam) | doc 05 §3 | 🟡 |
| 2.3 | Componentes base: Dialog, Toast, Table, Pagination, Badge (fim dos `alert/confirm`) | doc 05 §5 | 🟡 |
| 2.4 | Paginação e filtros no servidor (histórico e logs) | doc 06 §2.2 | 🟡 |
| 2.5 | Lazy-load das libs de exportação; otimizar logos; skeletons | doc 06 §3 | 🟡 |
| 2.6 | Design tokens + varredura de cores/tamanhos hardcoded | doc 05 §2 | 🟢 |

## Fase 3 — Funcionalidades de produto

| # | Item | Descrição | Prioridade |
|---|---|---|---|
| 3.1 | ✅ 17/07/2026 — **Anulação de reservas** | Dono ou admin, a qualquer momento, motivo obrigatório; selo ANULADA no histórico; número nunca reemitido (`cancel_reservation`, migração 0004). **Edição** de ementa/destinatário é **exclusiva do autor** (migração 0005); o log de edição mostra o **antes→depois** de cada campo (migração 0006) | 🟡 |
| 3.2 | ✅ 13/07/2026 — **Assunto na reserva**; ✅ 17/07/2026 obrigatório + **destinatário** (secretaria de destino + nome, migração 0004) | Diálogo de reserva com ementa/destino obrigatórios; salvos em `reservations`; exibidos e buscáveis no histórico | 🟡 |
| 3.3 | **Busca avançada** | Filtros combinados: texto, tipo, período com presets, usuário, status; busca global ⌘K (busca simples já cobre tipo/número/ementa/destinatário/usuário) | 🟡 |
| 3.4 | ✅ 13/07/2026 — **Botão copiar número** | Toast de sucesso com botão "Copiar" (Clipboard API + fallback) | 🟡 |
| 3.5 | **"Meus números"** | Tela com as reservas do próprio usuário (visibilidade por secretaria já cobre parte: usuário sem secretaria só vê as próprias) | 🟢 |
| 3.6 | ✅ 22/07/2026 — **Relatórios** | Exportação Excel/PDF/JSON com **parâmetros escolhidos** (tipo de documento, secretaria, período De/Até, status) + contagem ao vivo e resumo da seleção; filtros descritos no cabeçalho do PDF. Respeita a visibilidade do usuário. Pendente: gráficos no relatório | 🟢 |
| 3.16 | ✅ 22/07/2026 — **Setor de destino + observações na reserva** | Ao reservar, campos opcionais "Setor" (da secretaria de destino) e "Observações" sobre o documento (migração 0008); visíveis no detalhe da reserva no Histórico (clique na linha), editáveis (log antes→depois) e incluídos na exportação | 🟢 |
| 3.7 | ✅ parcial 15/07/2026 — **Ajuste manual de contador com trilha** | `set_secretaria_counter()` permite ao admin definir o próximo número por secretaria (com log); falta campo de motivo livre | 🟢 |
| 3.8 | **Autocomplete de assunto** | Sugerir assuntos já usados (evoluir o `autocomplete.js` existente) | 🟢 |
| 3.9 | ✅ 15/07/2026 — **Numeração independente por secretaria** | Flag `per_secretaria` por tipo de documento; contador em `document_counters` por `(doc, secretaria, ano)`; usuário sem secretaria é bloqueado (sem bucket "Geral"); admin configura o número inicial de cada secretaria na tela Secretarias e vê estatísticas globais por secretaria (`supabase/migrations/0003_per_secretaria_counters.sql`, doc 03 §1.1) | 🟡 |
| 3.10 | ✅ 17/07/2026 — **Histórico por secretaria** | Admin vê tudo; documento geral (não per_secretaria) tem histórico público; documento por secretaria fica restrito à secretaria (0006). ⚠️ Filtro client-side — a garantia por RLS continua sendo o item 1.5 | 🟡 |
| 3.13 | ✅ 17/07/2026 — **Numeração 4+ dígitos** | O número cresce além de 3 dígitos quando necessário (1000+), mostrando 3 até lá; corrige truncamento do `lpad` no SQL (migração 0006) | 🟢 |
| 3.11 | ✅ 17/07/2026 — **Permissões padrão por secretaria** | Tela Secretarias define documentos padrão; usuários herdam ao criar/aprovar (sem sobrescrever personalização); botão "Aplicar aos usuários existentes"; secretaria do usuário via lista suspensa (corrigido: campo era texto livre no modal) | 🟡 |
| 3.12 | ✅ 17/07/2026 — **Redesign glass + telas admin** | Glassmorphism (tokens/raios/fundo), histórico compacto em 3 linhas, busca e chips nas telas de usuários/documentos, pendentes de aprovação no topo | 🟢 |
| 3.14 | ✅ 21/07/2026 — **Redesign completo (sidebar + dashboard)** | Reescrita do frontend (`app.js`/`styles.css`/`index.html`) seguindo o handoff de design (pasta "Redesign de plataforma numeração"): sidebar recolhível, 6 telas (Início/dashboard com gráficos reais, Gerar, Histórico com filtros, Tipos, Relatórios, Configurações), estilo Apple/glass, controle de zoom por conteúdo. Todas as regras de negócio preservadas (numeração por secretaria, destinatário obrigatório, anulação/edição, permissões, logs). Cores dos tipos por matiz HSL. Testado headless (24 checks) | 🟢 |
| 3.15 | ✅ 21/07/2026 — **Otimização mobile (PWA app-like)** | No celular: barra de navegação inferior (tab bar) + sheet "Mais", modais/diálogos viram bottom-sheets, histórico vira cartões (com rótulos), filtros recolhíveis, cards em 2 colunas, reordenação por toque (alça pointer/touch), áreas seguras (notch), 100dvh, sem rolagem horizontal. Instalável na tela inicial (manifest.json + meta apple/mobile, `logo.png` como ícone). Desktop inalterado. Testado headless em viewport de celular (19 checks) | 🟢 |

## Fase 4 — Evoluções (avaliar demanda real antes)

| # | Item | Notas |
|---|---|---|
| 4.1 | Notificações (aprovação de conta, resumo semanal) | E-mail via Edge Function + Resend/SMTP institucional |
| 4.2 | Realtime | "Próximo número" e histórico atualizando ao vivo (Supabase Realtime) |
| 4.3 | Anexar arquivo/link do documento final | Supabase Storage; cuidado com escopo (não virar GED — doc 01 §6) |
| 4.4 | Tema escuro | Viabilizado pelos tokens |
| 4.5 | PWA (instalável, consulta offline do histórico já carregado) | Reserva continua exigindo conexão (correção exige servidor) |
| 4.6 | API REST documentada para integração com outros sistemas | Via PostgREST já existente + doc OpenAPI |
| 4.7 | Multi-órgão/tenant | Só se outra prefeitura/órgão for usar; exige colunas `org_id` + RLS por tenant |
| 4.8 | Migração para React + Vite + TS (etapa B) | Só se a equipe crescer ou 4.x exigirem |

## Backlog de dívidas conhecidas (registrar ao encontrar)

- ~~`state.currentLogFilter` duplicado no objeto `state`~~ ✅ corrigido 13/07/2026;
- ~~Cache-busting divergente entre arquivos no `index.html`~~ ✅ unificado 13/07/2026;
- ~~Libs jsPDF/XLSX/FileSaver (~1MB) carregadas sem uso~~ ✅ removidas 13/07/2026;
- ~~XSS via `innerHTML` nos campos de usuário (nome, assunto, cargo)~~ ✅ escape aplicado 13/07/2026 (varredura completa da Fase 2 ainda recomendada);
- ~~`formatNumber` anexava ano em documentos de numeração contínua~~ ✅ corrigido 13/07/2026;
- supabase-js carregado do CDN unpkg — ponto único de falha; considerar self-host com versão fixada;
- `admin-views.js` referenciado como removido no HTML mas ainda no repo;
- README raiz descreve armazenamento em localStorage — desatualizado (já é Supabase); reescrever após Fase 2.

## Como usar este roadmap

1. Trabalhe de cima para baixo; itens 🔴 bloqueiam os demais;
2. Cada item vira uma branch/PR pequena com referência ao número (ex.: `feat/1.2-reserve-rpc`);
3. Ao concluir, marque aqui com ✅ e data;
4. Novas ideias entram na fase 4 ou no backlog — não furam a fila das fases 0–1.
