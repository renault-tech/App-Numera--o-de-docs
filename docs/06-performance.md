# 06 — Performance e Otimização

Meta: app abre e fica utilizável em **< 2s** em conexão comum; qualquer
navegação entre telas em **< 200ms**; busca respondendo em **< 500ms** mesmo com
dezenas de milhares de reservas.

## 1. Diagnóstico atual

| Problema | Impacto |
|---|---|
| `loadData()` baixa **todas** as reservas, logs, usuários e documentos ao abrir | Tempo de abertura cresce linearmente com o histórico; com anos de uso, MBs de JSON a cada load |
| Renderização por `innerHTML` de listas inteiras a cada mudança | Repaint completo; input de busca re-renderiza a cada tecla |
| 5 bibliotecas via CDN carregadas sempre (jsPDF, autotable, XLSX ~900KB, FileSaver, supabase-js) | XLSX + jsPDF só são usados na exportação, mas bloqueiam/pesam o load inicial |
| 2 logos PNG de ~0,5MB cada | ~1MB de imagem para um logo de header |
| Busca do histórico filtra em memória no cliente | Só funciona porque tudo foi baixado (ver item 1) |
| Sem índices além das PKs | Buscas por texto/data farão sequential scan |

## 2. Banco de dados

### 2.1 Índices (aplicar junto das migrações do doc 03)

```sql
-- Histórico ordenado por data (tela principal de busca)
create index idx_res_created on public.reservations (created_at desc);

-- Busca por número dentro de um tipo/ano (já coberto pela UNIQUE, manter)
-- unique (doc_type_id, year, number)

-- "Meus números"
create index idx_res_user on public.reservations (user_id, created_at desc);

-- Busca textual por assunto (tolerante a busca parcial/typo)
create extension if not exists pg_trgm;
create index idx_res_subject_trgm on public.reservations using gin (subject gin_trgm_ops);
create index idx_res_formatted_trgm on public.reservations using gin (formatted_number gin_trgm_ops);

-- Logs
create index idx_logs_created on public.audit_logs (created_at desc);
create index idx_logs_type on public.audit_logs (type, created_at desc);
```

### 2.2 Consultas paginadas e filtradas no servidor

Substituir o filtro em memória por consultas Supabase com `range()`:

```js
// api/reservations.js
export async function search({ text, docTypeId, from, to, userId, status,
                               page = 0, pageSize = 50 }) {
  let q = supabase.from('reservations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (text)      q = q.or(`subject.ilike.%${text}%,formatted_number.ilike.%${text}%`);
  if (docTypeId) q = q.eq('doc_type_id', docTypeId);
  if (from)      q = q.gte('created_at', from);
  if (to)        q = q.lte('created_at', to);
  if (userId)    q = q.eq('user_id', userId);
  if (status)    q = q.eq('status', status);

  return q; // { data, count, error }
}
```

### 2.3 Estatísticas por view/RPC, não por download

O painel admin hoje conta itens em memória. Criar view materializável ou RPC:

```sql
create or replace view public.stats_summary as
select
  (select count(*) from reservations where created_at::date = current_date)          as hoje,
  (select count(*) from reservations where date_trunc('month', created_at)
                                         = date_trunc('month', now()))               as mes,
  (select count(*) from reservations)                                                as total,
  (select count(*) from profiles where not approved and active)                      as pendentes;
```

## 3. Carregamento inicial (frontend)

1. **Carregar sob demanda por tela**: ao abrir, buscar apenas perfil do usuário
   + tipos de documento (dezenas de linhas). Histórico, logs e usuários só
   quando a tela correspondente abre — com paginação.
2. **Lazy-load das libs de exportação**: importar jsPDF/XLSX dinamicamente só
   no clique de "Exportar":
   ```js
   async function exportExcel(rows) {
     const XLSX = await import('https://cdn.../xlsx.mjs'); // ou cópia local
     ...
   }
   ```
   Isso remove ~1MB do caminho crítico.
3. **Servir libs localmente com versão fixada** (ou SRI) — CDN de terceiros é
   ponto de falha e de segurança (doc 04).
4. **Otimizar logos**: converter para WebP/AVIF ou SVG; alvo < 30KB; usar
   `width/height` explícitos (evita layout shift).
5. **Fonte Inter**: `font-display: swap` (o Google Fonts já aplica) e
   pré-conexão `<link rel="preconnect">`; considerar self-host com subset latino.
6. **Cache busting coerente**: manter o padrão `?v=` já usado, mas gerado de um
   único lugar (hoje há versões diferentes por arquivo, fácil de esquecer).
7. **Skeletons** em vez de tela branca durante fetches (componente do doc 05).

## 4. Velocidade de navegação (entre telas)

- Views trocadas via router client-side (hash) sem recarregar página — já é
  SPA, manter;
- **Cache em memória por sessão**: tipos de documento e perfil raramente mudam —
  buscar uma vez e invalidar após ações de admin;
- **Renderização incremental**: atualizar apenas a linha/card afetado após uma
  ação (ex.: nova reserva → prepend de um item) em vez de re-renderizar a lista;
- **Debounce** de 300ms no campo de busca antes de consultar o servidor;
- Cancelar requisições obsoletas (`AbortController`) quando o usuário digita
  nova busca antes da anterior responder;
- Realtime (fase futura): assinar `reservations` via Supabase Realtime para o
  contador "próximo número" se manter atualizado sem polling.

## 5. Percepção de velocidade (UX de performance)

- A reserva via RPC é 1 round-trip (contra 3 do fluxo atual: select implícito +
  insert + update) — além de correta, é mais rápida;
- Feedback otimista **apenas para leituras/navegação**; para a reserva em si,
  sempre esperar a confirmação do servidor (o número é a verdade);
- Toast de progresso se a RPC passar de 1s ("confirmando reserva…").

## 6. Monitoramento

- Ativar **Vercel Analytics / Speed Insights** (gratuito no plano atual) para
  Web Vitals reais;
- Usar `get_advisors` (performance) do Supabase após criar índices;
- Logar no console apenas em modo debug (`?debug=1`) — remover os `console.log`
  de produção;
- Meta de orçamento (performance budget): JS inicial ≤ 150KB, imagem total ≤
  100KB, LCP ≤ 2s em 4G.

## 7. Ordem de implementação sugerida

1. Índices + paginação servidor (maior ganho estrutural);
2. Lazy-load de jsPDF/XLSX + otimização das logos (maior ganho imediato de load);
3. Cache de sessão + renderização incremental;
4. Skeletons e debounce;
5. Analytics para validar as metas.
