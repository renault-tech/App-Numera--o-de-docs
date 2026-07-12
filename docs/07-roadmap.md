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
| 1.1 | Constraint `UNIQUE (doc_id, year, number)` + colunas `year`, `status`, anulação | doc 03 | 🔴 |
| 1.2 | Função `reserve_number()` atômica + frontend chamando via RPC | doc 03 §3 | 🔴 |
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
| 3.1 | **Anulação de reservas** | UC-03: dono no mesmo dia, admin sempre; motivo obrigatório; badge no histórico | 🟡 |
| 3.2 | **Assunto obrigatório na reserva** | Diálogo de reserva com assunto + ementa antes de confirmar (habilita a busca por tema de verdade) | 🟡 |
| 3.3 | **Busca avançada** | Filtros combinados: texto, tipo, período com presets, usuário, status; busca global ⌘K | 🟡 |
| 3.4 | **Botão copiar número** | Clipboard API + toast; formato exato para colar no documento | 🟡 |
| 3.5 | **"Meus números"** | Tela com as reservas do próprio usuário | 🟢 |
| 3.6 | **Relatórios** | Por período/tipo/secretaria; exportação PDF/Excel respeitando filtros; gráficos simples no painel | 🟢 |
| 3.7 | **Ajuste manual de contador com trilha** | Para migrar a numeração das folhas de papel: admin define próximo número com motivo + log | 🟢 |
| 3.8 | **Autocomplete de assunto** | Sugerir assuntos já usados (evoluir o `autocomplete.js` existente) | 🟢 |

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

- `state.currentLogFilter` duplicado no objeto `state` (`app.js` linhas 23–24);
- Chave duplicada de cache-busting divergente entre arquivos no `index.html`;
- `admin-views.js` referenciado como removido no HTML mas ainda no repo;
- README raiz descreve armazenamento em localStorage — desatualizado (já é Supabase); reescrever após Fase 2.

## Como usar este roadmap

1. Trabalhe de cima para baixo; itens 🔴 bloqueiam os demais;
2. Cada item vira uma branch/PR pequena com referência ao número (ex.: `feat/1.2-reserve-rpc`);
3. Ao concluir, marque aqui com ✅ e data;
4. Novas ideias entram na fase 4 ou no backlog — não furam a fila das fases 0–1.
