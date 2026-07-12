# 05 — UI/UX e Design System

Objetivo: elevar o visual e a usabilidade a um padrão profissional de produto
institucional, mantendo o app **rápido e simples** — o usuário típico quer um
número em segundos, várias vezes ao dia.

## 1. Princípios de design

1. **A reserva é a estrela.** O caminho login → tipo de documento → número
   copiado deve ter o mínimo de cliques e zero distração. Tudo o mais
   (admin, logs, relatórios) fica fora desse caminho.
2. **Confiança visível.** O usuário abandona a folha de papel se confiar no
   sistema: feedback claro de sucesso/erro, número em destaque, histórico
   sempre acessível.
3. **Institucional, não corporativo genérico.** Identidade sóbria de órgão
   público (logo da prefeitura já existe no repo), sem excesso de gradientes e
   emojis na UI final (hoje há emojis como ícones — substituir por ícones SVG
   consistentes, ex.: [Lucide](https://lucide.dev), embutidos localmente).
4. **Acessível por padrão.** Servidores públicos de todas as idades; teclado,
   contraste e leitores de tela funcionam.

## 2. Design tokens (base do design system)

Definir em `styles/tokens.css` como custom properties — hoje há cores soltas
espalhadas (`#1e293b`, `#3b82f6` etc. hardcoded no `index.html` e `styles.css`):

```css
:root {
  /* Cor primária institucional — ajustar ao brasão/identidade da prefeitura */
  --color-primary-600: #1d4ed8;
  --color-primary-700: #1e40af;
  --color-primary-050: #eff6ff;

  /* Neutros (slate) */
  --color-text:        #0f172a;
  --color-text-muted:  #64748b;
  --color-border:      #e2e8f0;
  --color-surface:     #ffffff;
  --color-surface-alt: #f8fafc;

  /* Semânticas */
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger:  #b91c1c;

  /* Tipografia — Inter já em uso; manter */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', monospace; /* números de documento */
  --text-xs: .75rem; --text-sm: .875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.5rem; --text-2xl: 2rem;

  /* Espaçamento (escala de 4px) */
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem;
  --space-4: 1rem; --space-6: 1.5rem; --space-8: 2rem;

  /* Raios e sombras */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgb(15 23 42 / .06);
  --shadow-md: 0 4px 12px rgb(15 23 42 / .08);

  /* Movimento */
  --ease: cubic-bezier(.2,.8,.2,1);
  --dur-fast: 120ms; --dur-base: 200ms;
}
```

Regras:
- **Nenhuma cor/tamanho hardcoded** fora de `tokens.css`;
- Números de documento sempre em `--font-mono` com `font-variant-numeric:
  tabular-nums` (alinhamento em tabelas);
- Respeitar `prefers-reduced-motion` (desligar animações);
- Tema escuro: opcional (fase futura), viabilizado pelos tokens.

## 3. Arquitetura de informação e navegação

```
┌────────────────────────────────────────────────────────┐
│ Header fixo: logo | nome do sistema | busca global (⌘K)│
│               usuário ▾ (perfil, sair)                 │
├──────────┬─────────────────────────────────────────────┤
│ Sidebar  │  Conteúdo                                   │
│ (desktop)│                                             │
│ ● Reservar (home)                                      │
│ ● Histórico / Busca                                    │
│ ● Meus números                                         │
│ ─────────── (só admin)                                 │
│ ● Painel (estatísticas)                                │
│ ● Tipos de documento                                   │
│ ● Usuários  (badge com pendentes de aprovação)         │
│ ● Logs                                                 │
│ ● Configurações (secretarias etc.)                     │
└──────────┴─────────────────────────────────────────────┘
```

- **Roteamento por hash** (`#/historico`, `#/admin/usuarios`) para que
  voltar/avançar do navegador e favoritos funcionem — hoje a troca de views
  não altera a URL;
- No mobile, a sidebar vira **bottom navigation** (3–4 itens) ou menu hambúrguer;
- **Busca global** no header (atalho `/` ou `Ctrl+K`): busca reservas por
  número, assunto ou tipo de qualquer tela.

## 4. Telas principais (especificação)

### 4.1 Login / Cadastro
- Cartão centralizado com logo institucional, campos e-mail e senha;
- Mensagens de erro específicas ("conta aguardando aprovação" ≠ "senha incorreta");
- Link "primeiro acesso / esqueci a senha" (fluxo Supabase Auth);
- Cadastro em passo único com máscara clara dos campos institucionais
  (secretaria como select alimentado pelo `app_config`).

### 4.2 Reservar (home do usuário)
- Grade de cartões dos tipos permitidos ao usuário; cada cartão mostra:
  nome, prefixo e **próximo número** (informativo, com aviso sutil de que o
  número final é confirmado na reserva);
- Clique abre **diálogo de reserva**: assunto (obrigatório, com autocomplete
  de assuntos já usados), ementa (opcional), botão "Reservar";
- Sucesso → tela de confirmação com o número **grande, em fonte mono**, botão
  **"Copiar número"** (usa Clipboard API + toast "copiado!") e "fazer outra reserva";
- Substituir os `alert()`/`confirm()` nativos por diálogos próprios
  (`<dialog>` nativo estilizado) e **toasts** para feedback não bloqueante.

### 4.3 Histórico / Busca
- Barra de filtros: texto (assunto/número), tipo (select), período (date range
  com presets "hoje / esta semana / este mês / este ano"), usuário (admin),
  status (ativa/anulada);
- Tabela com colunas: número (mono), tipo, assunto, usuário, setor, data/hora,
  status (badge), ações (ver detalhes, anular quando permitido);
- **Paginação no servidor** (50 por página) + contagem total;
- Reservas anuladas em cinza com tachado no número + tooltip com motivo;
- Botões "Exportar PDF / Excel" respeitando os filtros ativos;
- Estado vazio ilustrado ("nenhum resultado — ajuste os filtros").

### 4.4 Painel admin (estatísticas)
- Cards: reservas hoje / no mês / total, usuários pendentes de aprovação;
- Gráfico simples de reservas por tipo no mês e por secretaria (fase 3 do
  roadmap; usar SVG leve ou lib pequena — evitar chart.js pesado se possível);
- Lista "últimas reservas" em tempo real (Supabase Realtime, fase futura).

### 4.5 Gestão de tipos de documento
- Tabela: nome, prefixo, próximo nº, modo (badge "Anual"/"Contínua"), status;
- Form em diálogo com **pré-visualização ao vivo** do número formatado
  conforme se edita prefixo/padding/template (ex.: "Of. 015/2026");
- Alterar "próximo número" manualmente: campo separado com aviso destacado e
  motivo obrigatório (gera log) — caso de uso: migrar numeração da folha de papel;
- Desativar (não excluir) tipos em uso.

### 4.6 Gestão de usuários
- Abas ou filtro: **Pendentes** (destaque, ação rápida aprovar/recusar) | Ativos | Desativados;
- Form com seções: dados pessoais, dados institucionais, permissões;
- Ao escolher "Restrito", lista de checkboxes de tipos com "marcar todos";
- Desativar em vez de excluir usuários com reservas.

### 4.7 Logs (admin)
- Filtros por tipo de evento, usuário e período; paginação no servidor;
- Detalhes em `jsonb` renderizados de forma legível (chave: valor);
- Exportação CSV.

## 5. Componentes do design system

Construir uma vez, reutilizar em todo o app (em `src/ui/components/`):

| Componente | Notas |
|---|---|
| `Button` | Variantes primary/secondary/danger/ghost; estados loading e disabled |
| `Dialog` | Sobre `<dialog>` nativo; fecha com Esc; focus trap |
| `Toast` | Fila no canto; sucesso/erro/info; auto-dismiss 4s; substitui `alert()` |
| `Table` | Cabeçalho fixo, linhas zebradas, responsiva (vira cards no mobile) |
| `Pagination` | Anterior/próxima + "página X de Y" |
| `Badge` | Status (ativa/anulada/pendente), modo de numeração |
| `Input/Select/DateRange` | Labels sempre visíveis; erros inline abaixo do campo |
| `EmptyState` | Ícone + mensagem + ação sugerida |
| `Skeleton` | Placeholder de carregamento (ver doc 06) |
| `NumberDisplay` | Número formatado em mono + botão copiar |

## 6. Acessibilidade (WCAG 2.1 AA)

- Contraste mínimo 4.5:1 para texto (validar os tokens);
- Navegação completa por teclado (ordem lógica de foco; `:focus-visible` visível);
- Diálogos com `role="dialog"`, `aria-modal`, foco preso e retorno do foco ao gatilho;
- Toasts com `aria-live="polite"`; erros de formulário com `aria-describedby`;
- Ícones sempre acompanhados de texto ou `aria-label`;
- Zoom nativo do navegador deve funcionar — revisar a feature atual de "zoom
  global" custom (`applyGlobalZoom`) que manipula font-size: manter como
  preferência de acessibilidade salva por usuário, mas sem quebrar layout;
- Testar com axe DevTools e navegação só por teclado (checklist no doc 09).

## 7. Responsividade

| Breakpoint | Layout |
|---|---|
| ≥ 1024px | Sidebar fixa + conteúdo; tabelas completas |
| 640–1023px | Sidebar colapsável; tabelas com colunas prioritárias |
| < 640px | Bottom nav; cards no lugar de tabelas; diálogos em tela cheia |

O uso primário previsto é desktop (estação de trabalho), mas consulta rápida de
número pelo celular é caso real — o fluxo de reserva e a busca devem ser 100%
funcionais no mobile.

## 8. Microinterações e feedback

- Botão de reserva mostra spinner e desabilita durante a RPC (evita duplo clique);
- Sucesso da reserva: transição suave para o número + auto-seleção para cópia;
- Erros de rede: toast com "tentar novamente" quando seguro (leituras) e
  orientação de verificar histórico (escritas — nunca repetir cegamente uma reserva);
- `document.title` reflete a tela atual ("Histórico — Numeração de Documentos").
