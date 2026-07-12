# 09 — Testes e Qualidade

## 1. Estratégia

O sistema tem uma invariante que paga por todo o esforço de teste: **nunca
emitir número duplicado (RN-01)**. A estratégia prioriza:

1. **Testes de banco** (funções SQL e RLS) — onde mora a regra crítica;
2. **Teste de concorrência** — a corrida que motivou a refatoração;
3. **Testes E2E dos fluxos principais** — reserva, busca, anulação, admin;
4. Testes unitários de utilitários (formatação de número/data).

## 2. Teste de concorrência (obrigatório na Fase 1)

Script Node (em `tests/concurrency.test.mjs`) contra o banco de **dev**:

```js
import { createClient } from '@supabase/supabase-js';

const N = 20; // reservas simultâneas
const clients = await Promise.all(
  Array.from({ length: N }, () => loginTestUser()) // usuários de teste aprovados
);

const results = await Promise.allSettled(
  clients.map(c => c.rpc('reserve_number', {
    p_doc_type_id: DOC_ID, p_subject: 'teste corrida',
  }))
);

const numbers = results
  .filter(r => r.status === 'fulfilled' && !r.value.error)
  .map(r => r.value.data.number);

const unique = new Set(numbers);
if (unique.size !== numbers.length) throw new Error('NÚMERO DUPLICADO!');
console.log(`OK: ${numbers.length} reservas, todas únicas`, [...unique].sort((a,b)=>a-b));
```

Critério: com N=20 disparos simultâneos, 20 números distintos e sequenciais.
Rodar também a verificação global:

```sql
select doc_type_id, year, number, count(*)
  from reservations group by 1,2,3 having count(*) > 1;  -- deve retornar 0 linhas
```

## 3. Testes de RLS e permissões (Fase 1)

Matriz a validar via script com usuários de cada papel (anon, readonly,
restrito, completo, admin, não-aprovado):

| Operação | anon | não aprovado | readonly | restrito | completo | admin |
|---|---|---|---|---|---|---|
| SELECT document_types | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| rpc reserve_number (tipo permitido) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| rpc reserve_number (tipo NÃO permitido) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| INSERT direto reservations | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| rpc cancel (própria, mesmo dia) | — | — | ❌ | ✅ | ✅ | ✅ |
| rpc cancel (de terceiro) | — | — | ❌ | ❌ | ❌ | ✅ |
| SELECT audit_logs | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| UPDATE/DELETE audit_logs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CRUD document_types / profiles | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 4. Cenários E2E críticos (Playwright — Chromium já disponível)

| ID | Cenário | Resultado esperado |
|---|---|---|
| E01 | Login com credenciais válidas | Home com tipos permitidos |
| E02 | Login de conta não aprovada | Mensagem "aguarda aprovação", sem acesso |
| E03 | Reservar número com assunto | Número exibido = registrado no histórico; contador avançou |
| E04 | Reservar sem assunto | Bloqueado com erro inline |
| E05 | Buscar por assunto parcial / número / período | Resultados corretos e paginados |
| E06 | Anular reserva própria no mesmo dia | Status "cancelada" com motivo; número não some do histórico |
| E07 | Anular reserva de ontem (não-admin) | Negado |
| E08 | Admin cria tipo com reset anual e reserva | Formato `Prefixo NNN/ANO` correto |
| E09 | Admin aprova usuário pendente | Usuário passa a logar |
| E10 | Usuário restrito não vê tipos não permitidos | Cards ausentes E RPC nega (defesa dupla) |
| E11 | Exportar PDF/Excel com filtros ativos | Arquivo contém apenas o filtrado |
| E12 | Virada de ano (simulada em dev alterando current_year) | Próxima reserva sai com nº inicial e ano novo |

## 5. Testes unitários

- `format_doc_number` (SQL): padding, template com/sem ano, prefixo vazio —
  testável com `select` direto em migração de teste;
- `utils/format.js` (JS): datas pt-BR, número formatado igual ao do servidor
  (idealmente o cliente **não** formata — só exibe o `formatted_number` vindo
  do banco; garantir isso por teste).

## 6. Qualidade contínua

- **Checklist de release** (antes de cada push a `master`):
  - [ ] Migrações aplicadas em dev e testadas;
  - [ ] Teste de concorrência verde;
  - [ ] E2E E01–E06 verdes (mínimo);
  - [ ] `get_advisors` (security + performance) sem itens críticos;
  - [ ] Smoke test manual em produção após deploy;
- **Acessibilidade** (por tela alterada): navegação por teclado completa,
  axe DevTools sem violações sérias, contraste validado;
- **Performance**: Lighthouse ≥ 90 em Performance/Best Practices/A11y na home;
- Quando houver `package.json`: CI no GitHub Actions rodando lint + unit +
  E2E headless a cada PR.

## 7. Dados de teste

Manter script `tests/seed.sql` para o banco de dev com:
- 1 admin, 1 usuário completo, 1 restrito (2 tipos), 1 readonly, 1 pendente;
- 5 tipos de documento (mistos anual/contínuo, paddings diferentes);
- ~200 reservas distribuídas em 2 anos (testa paginação, busca e virada de ano);
- Algumas reservas anuladas.
