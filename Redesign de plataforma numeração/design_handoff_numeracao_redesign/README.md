# Handoff: Redesign — Sistema de Numeração de Documentos (Prefeitura de Cataguases)

## Overview
Redesenho completo da interface do **Sistema de Numeração de Documentos**. O objetivo é modernizar a UX/UI em um estilo **Apple / minimalista**, com **transparências (glassmorphism)**, **bordas arredondadas**, **sidebar recolhível**, **controle de zoom de acessibilidade** e navegação otimizada. Adiciona **dashboard com estatísticas**, **histórico com filtros** e telas de **Tipos**, **Relatórios** e **Configurações**.

O app existente é vanilla JS (HTML + `app.js` + `styles.css`), com dados em `localStorage` e integração opcional com Supabase (ver `index.html`, `auth-service.js`, `autocomplete.js`). Este handoff descreve como recriar a NOVA interface dentro desse mesmo ambiente.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML** — um protótipo mostrando aparência e comportamento pretendidos, **não código de produção para copiar diretamente**. A tarefa é **recriar este design no ambiente já existente do projeto** (`index.html` + `app.js` vanilla + `styles.css`, com `localStorage`/Supabase para dados), reaproveitando a lógica de negócio já implementada (tipos de documento, reservas, usuários, logs). Mantenha os nomes de dados/campos que já existem no `app.js` (`docTypes`, `reservations`, `prefix`, `current_number`, `yearly_reset`, `user_secretaria`, etc.).

O protótipo foi construído como um Design Component (React em runtime), mas **a saída final deve ser vanilla JS** para casar com o repositório atual — ou o framework que o time preferir.

## Fidelity
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos, raios e interações são finais. Recrie a UI fielmente. Os dados exibidos (números, assuntos, secretarias) são **mock de demonstração** — substitua pelos dados reais do sistema.

---

## Design Tokens

### Cores
| Token | Valor | Uso |
|---|---|---|
| Fundo do app (gradiente) | `linear-gradient(155deg,#eef1f7 0%,#e8ecf4 45%,#f1edf4 100%)` | fundo geral |
| Blobs de cor (atrás do glass) | azul `rgba(0,113,227,0.16)`, roxo `rgba(88,86,214,0.14)`, âmbar `rgba(255,149,0,0.08)` | radial-gradients decorativos, `pointer-events:none` |
| Superfície glass (cards) | `rgba(255,255,255,0.55)` | fundo dos cards |
| Superfície glass (sidebar) | `rgba(255,255,255,0.55)` | fundo da barra lateral |
| Superfície glass (modal) | `rgba(255,255,255,0.82)` | fundo do modal |
| Borda glass | `1px solid rgba(255,255,255,0.85)` (sidebar `0.70`) | bordas dos cards |
| Texto primário | `#1d1d1f` | títulos e valores |
| Texto secundário | `#3a3a3c` | corpo |
| Texto terciário | `#86868b` | labels, legendas |
| Texto placeholder | `#a1a1a6` | inputs |
| Azul de ação (Apple) | `#0071e3`; gradiente botão `linear-gradient(180deg,#1a86ff,#0071e3)` | botões primários, destaques, números |
| Azul suave (fundo de tag/ação) | `rgba(0,113,227,0.1)` | item de menu ativo, botão "Reservar", tags |
| Roxo | `#5856d6` → `#7d7bff` | barras "por secretaria" |
| Verde sucesso | `#34c759` | deltas positivos, toggle on, toast |
| Vermelho | `#e5484d` | export PDF |
| Verde export | `#2a9d5c` | export Excel |
| Linha divisória | `rgba(120,130,150,0.10–0.14)` | separadores de lista/tabela |

### Chips por tipo de documento
Cada tipo tem uma cor derivada de um **hue** HSL fixo. Chip: `background:hsl(H 80% 94%); color:hsl(H 72% 42%)`. Barras: `linear-gradient(90deg,hsl(H 78% 62%),hsl(H 74% 50%))`.

Hues: Ofício 210, Portaria 265, Memorando 190, Decreto 145, Contrato 30, Circular 320, Resolução 250, Edital 12, Parecer 170, Ata 285, Instrução Normativa 55, Lei 220, Exposição de Motivos 300, Lei Complementar 235, Medida Provisória 340, Processo 200, Protocolo 160, Folha 40.

### Tipografia
- Família: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif`
- `-webkit-font-smoothing: antialiased`
- Escala: título de página **26px/700/-0.6px**; saudação dashboard **29px/700/-0.7px**; valores de stat **29px/700/-0.8px**; título de card **15.5px/700**; nome/label **14–14.5px/600–700**; corpo **13–13.5px**; legenda **11.5–12.5px**; label de campo **11.5px/600 #86868b**.

### Espaçamento & forma
- Raios: cards grandes **22px**; cards médios / painéis **18–20px**; chips de ícone **10–13px**; botões **11–12px**; pílulas/toggles/menu **999px**; janela do app **26px**.
- Padding de conteúdo (main): **34px 40px 46px**.
- Gaps de grid entre cards: **14–16px**.
- Sombra dos cards: `0 8px 28px rgba(30,50,90,0.06)`; modal `0 30px 80px rgba(20,40,80,0.30)`; botão primário `0 8px 22px rgba(0,113,227,0.35)`.
- Blur do glass: `backdrop-filter: blur(30px) saturate(1.4)` (cards), `blur(34px) saturate(1.5)` (sidebar), `blur(40px) saturate(1.6)` (modal). Sempre incluir prefixo `-webkit-`.

---

## Layout Global

Container raiz ocupa a viewport (`100vw × 100vh`, `overflow:hidden`, `border-radius:26px`, gradiente de fundo). Três blobs radiais absolutos ficam atrás de todo o conteúdo para dar profundidade ao vidro.

Estrutura: **sidebar fixa à esquerda** + **`<main>` rolável à direita** + **controle de zoom fixo (canto inferior direito)** + overlays (modal de reserva, toast).

### Sidebar recolhível
- Largura: **236px expandida**, **78px recolhida**. Transição `width .28s ease, padding .28s ease`. `position:absolute; top/left/bottom:0; z-index:5`.
- Fundo glass, borda direita `1px solid rgba(255,255,255,0.7)`.
- Conteúdo (topo→base): **marca** (logo 42×42 raio 12 + "Numeração" / "Prefeitura de Cataguases") → **botão Recolher** (chevron; rotaciona 180° quando recolhido) → **navegação** → **chip do usuário** (empurrado para a base com `margin-top:auto`).
- Ao recolher: some o texto (marca, labels de menu, "Recolher", dados do usuário), ícones centralizam. Cada botão vira ícone-only centralizado; use `title` para tooltip.
- Item de menu ativo: `background:rgba(0,113,227,0.1)`, `color:#0071e3`, `font-weight:600`. Inativo: `color:#3a3a3c`, `font-weight:500`. Padding expandido `10px 14px`, recolhido `11px 0` centralizado, raio 12.
- `<main>` acompanha: `left` = largura da sidebar, `transition:left .28s ease`.

### Menu (6 itens, ícones line/stroke 1.9)
`Início` (casa) · `Gerar Número` (+) · `Histórico` (relógio/seta) · `Tipos` (documento) · `Relatórios` (gráfico) · `Configurações` (engrenagem).

### Controle de zoom (acessibilidade) — discreto e fixo
- Pílula glass fixa em `right:22px; bottom:22px; z-index:15`. `background:rgba(255,255,255,0.7)`, blur, borda clara, raio 999, sombra `0 8px 24px rgba(30,50,90,0.14)`.
- Três controles: **A−** (‑10%), **rótulo central `NN%`** (clique = redefinir para 100%, cor `#0071e3`), **A+** (+10%). Botões redondos 34×34 transparentes.
- Faixa: **80%–150%, passo 10%**, default **100%**.
- Aplicação: o zoom escala **somente o conteúdo do `<main>`** (envolva as views num wrapper e aplique `zoom: valor/100`). O controle e a sidebar **não** escalam. (Substitui o antigo A-/100%/A+ que ficava no header.)

---

## Screens / Views

Uma única SPA; `<main>` troca a view conforme o item de menu. Entrada em `Início`. Transição de entrada de cada view: `@keyframes` fade + translateY 8px, `.4s ease`.

### 1. Início (Dashboard)
- **Cabeçalho**: data por extenso (12.5px/600 uppercase #86868b) + saudação "Bom dia, Administrador" (29px/700) + subtítulo; à direita botão pílula **Gerar Número** (gradiente azul) que navega para a view Gerar.
- **4 stat cards** (grid 4 colunas, gap 15): label + ícone em chip colorido (30×30, raio 10) no topo; valor 29px/700; delta embaixo (verde com ↑ para positivos, cinza para neutros). Cards: *Total em 2026 = 1.284 (↑12% vs. 2025)*, *Este mês = 187 (↑8% vs. junho)*, *Média por dia = 9,2*, *Tipos ativos = 18*.
- **Linha gráfica** (grid `1.65fr 1fr`): 
  - *Documentos por mês* — gráfico de barras verticais (Jan–Jul). Altura da barra `28% + (v/max)*72%`, raio `9px 9px 4px 4px`, valor acima em azul, rótulo do mês abaixo. Última barra (mês atual) com gradiente azul mais escuro. Valores: 142,128,156,171,149,173,187.
  - *Por tipo de documento* — barras horizontais (trilho `rgba(120,130,150,0.14)` alt.7px raio 999; preenchimento com gradiente do hue do tipo). Ofício 312, Portaria 241, Memorando 198, Decreto 156, Contrato 132, Circular 98, Edital 74.
- **Linha inferior** (grid `1fr 1.3fr`):
  - *Por secretaria* — barras horizontais roxas. Administração 268, Educação 231, Saúde 214, Obras e Serviços 176, Fazenda 142, Assistência Social 121, Meio Ambiente 89, Cultura e Turismo 43.
  - *Últimos números gerados* — lista das 5 reservas mais recentes: chip do tipo + número + assunto (truncado) + secretaria + data (DD/MM). Link "Ver histórico".

### 2. Gerar Número
- Título + subtítulo.
- **Grid de cards de tipo** (`repeat(auto-fill,minmax(196px,1fr))`, gap 14) — cards menores que o original. Cada card: chip do tipo (38×38) + tag "por secretaria" (quando aplicável); nome (14.5px/700) + prefixo (12px #a1a1a6); **número atual** (19px/700 azul); botão **Reservar** (largura total, `rgba(0,113,227,0.1)` texto azul, ícone +).
- 18 tipos (ver Dados).
- Clique em Reservar → abre **modal de reserva**.

### 3. Histórico
- Título + contador "X de Y documentos" + botão **Limpar filtros**.
- **Barra de filtros** (card glass, grid `1.4fr 1fr 1fr auto auto`, alinhado à base): 
  - *Buscar* (input com ícone lupa — casa número, assunto, usuário, tipo, secretaria);
  - *Tipo* (select, "Todos os tipos" + 18 tipos);
  - *Secretaria* (select, "Todas" + 9 secretarias);
  - *De* e *Até* (inputs `type=date`, comparação lexicográfica em ISO `YYYY-MM-DD`).
  - Todos filtram **ao vivo** (combináveis, AND).
- **Tabela** (card glass): cabeçalho grid `1.1fr 2fr 1fr 1fr 0.8fr` (Número, Assunto, Secretaria, Usuário, Data uppercase 11.5px #86868b). Linhas: número (13.5px/700 azul), assunto (truncado), secretaria, usuário, data (DD/MM alinhada à direita). Estado vazio: "Nenhum documento encontrado para os filtros aplicados."

### 4. Tipos de Documento
- Título + "18 tipos configurados · configuração de prefixo e numeração".
- Lista (card glass): cada linha = chip + nome + "Prefixo: X" + badge (`Reinicia anual` azul / `Sequencial` cinza) + número atual à direita.

### 5. Relatórios
- Título + subtítulo.
- **3 cards de exportação** (grid 3): ícone em chip colorido (48×48 raio 14) + título + descrição + botão. *Relatório PDF* (vermelho), *Planilha Excel* (verde), *Backup JSON* (azul). Ligar aos exportadores já presentes no repo (jsPDF + autotable, XLSX, FileSaver).
- **Resumo do período** (card): 4 números — 1.284 documentos / 18 tipos / 9 secretarias / 9,2 média.

### 6. Configurações
- Título + subtítulo. `max-width:760px`.
- **Card de perfil**: avatar 56 + nome + "Secretaria de Administração · Acesso total" + botão "Editar perfil".
- **Lista de preferências** com toggles iOS (trilho 46×28 raio 999; on = `#34c759` alinhado à direita, off = cinza à esquerda; knob branco 22 com sombra). Itens: *Reinício anual de numeração* (on), *Notificar novas reservas* (on), *Backup automático* (off).

---

## Interactions & Behavior

- **Navegação**: clicar item de menu troca `state.view`; view faz fade-in.
- **Recolher sidebar**: alterna `state.collapsed`; sidebar e main animam largura/left em `.28s`.
- **Zoom**: A−/A+ ajustam `state.zoom` (clamp 80–150, passo 10); rótulo redefine para 100; aplica `zoom` no wrapper de conteúdo do main.
- **Reservar número** (modal): abre com o próximo número do tipo em destaque (`rgba(0,113,227,0.08)`, azul 25px). Campos: **Assunto** (texto) e **Secretaria** (select das 9). Botões: Cancelar / **Confirmar reserva**. Ao confirmar:
  1. incrementa `current_number` do tipo;
  2. cria a reserva (número formatado, usuário atual, secretaria, assunto, data de hoje);
  3. insere no topo do histórico;
  4. navega para Histórico;
  5. mostra **toast** de sucesso (pílula escura, ícone check verde) por ~3,4s.
  - Fechar clicando no backdrop; clique dentro do modal não propaga. Modal entra com `@keyframes` scale .96→1 em `.28s`.
- **Formatação do número** (replicar a lógica do `app.js` real): `Protocolo` → `Prot. {n}`; `Folha` → `fl. {000}`; sem prefixo (Ata) → `{000}/2026`; demais → `{prefix} {000}/2026`. `{000}` = número com padStart(3,'0'). Reservas usam o número **antes** do incremento.

## State Management
Estado necessário: `view`, `collapsed`, `zoom`, `reserveDoc` (tipo selecionado no modal ou null), `assunto`, `secretaria`, `toast`, filtros (`fSearch`,`fTipo`,`fSec`,`fFrom`,`fTo`), `prefs` (3 booleans), e as coleções `docTypes` e `reservations`. No app real, `docTypes`/`reservations`/`users`/`logs` vêm de `localStorage`/Supabase (já implementado) — conectar a UI a essas fontes em vez do mock.

## Assets
- `logo.png` — **logo oficial** (emblema triângulo/coroa/engrenagem + "CATAGUASES PREFEITURA" sobre fundo azul-marinho; 1024×1536). Usado como marca na sidebar em badge 42×42 raio 12 com `object-fit:cover; object-position:50% 38%` (recorta o emblema). Origem: repositório do app (commit `b256bd6`). Incluído neste pacote.
- `logo-prefeitura.png` / `logo-prefeitura-horizontal.png` — versões alternativas (emblema quadrado e horizontal com texto branco). Não usadas no tema claro.
- Ícones: SVG line inline (stroke 1.9–2, `currentColor`). Sem biblioteca externa.

## Files
- `Numeração de Documentos.dc.html` — protótipo de referência (template + lógica). Abre direto no navegador.
- `logo.png` — logo oficial (usado no app). `logo-prefeitura.png`, `logo-prefeitura-horizontal.png` — alternativas.

Repositório alvo: `renault-tech/App-Numera--o-de-docs` (`index.html`, `app.js`, `styles.css`, `auth-service.js`, `autocomplete.js`).
