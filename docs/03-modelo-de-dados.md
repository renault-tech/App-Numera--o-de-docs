# 03 — Modelo de Dados

## 1. Schema atual (as-is)

Tabelas existentes (ver `schema.sql`): `documents`, `users`, `reservations`,
`logs`, `app_config`. Resumo dos problemas:

| Tabela | Problema |
|---|---|
| `documents` | Sem controle de formato/padding; `current_number` é **legado desde a 0003** (a fonte real do próximo número é `document_counters`, ver §1.1); sem trilha de quem criou/alterou |
| `users` | Coluna `password` em texto puro; sem flag de "ativo/desativado" (só `approved`) |
| `reservations` | Status/anulação e `bucket_year` já existem (0004/0010); ✅ **unicidade numérica garantida** por `uq_reservations_doc_bucket_year_number (doc_id, bucket_secretaria, bucket_year, number)`, ver §1.3 |
| `logs` | Mutável/deletável (política aberta) |
| `app_config` | OK para chave-valor (secretarias etc.) |

### 1.1 Numeração por secretaria (migração 0003, já em produção)

Até a migração 0002, cada `documents` tinha **um único contador global**
(`current_number`) — todas as secretarias compartilhavam a mesma sequência.
A migração `supabase/migrations/0003_per_secretaria_counters.sql` tornou isso
configurável por tipo de documento, sem exigir a reescrita completa do schema
alvo da seção 2:

- `documents.per_secretaria boolean` — flag por tipo. Tipos únicos no
  município (Lei, Decreto) continuam `false` (contador único).
- Nova tabela `document_counters (doc_id, secretaria, year, current_number)`,
  chave única `(doc_id, secretaria, year)` — vira a fonte autoritativa da
  numeração; `documents.current_number` passa a ser só semente/legado.
- **Regra de bucket** (idêntica em SQL e em `app.js`):
  `bucket_secretaria = per_secretaria ? secretaria_do_usuário : ''` e
  `bucket_year = yearly_reset ? ano_atual : 0`. Sem secretaria definida e
  `per_secretaria = true` → a reserva é **bloqueada** (RN explícita: não existe
  bucket "Geral" compartilhado).
- `reservations.bucket_secretaria` guarda o bucket usado, e o índice único
  passa a ser `(doc_id, bucket_secretaria, formatted_number)` — permite duas
  secretarias emitirem legitimamente o mesmo número formatado sem colidir.
- RPC `set_secretaria_counter(doc_id, secretaria, next_number)` permite ao
  admin definir o número inicial de uma secretaria específica (go-live),
  validando que o valor é maior que o maior número já reservado naquele
  bucket — nunca deixa "voltar" o contador para um valor já usado.
- Painel de estatísticas globais (tela Admin → "Numeração por Secretaria")
  lista, por tipo `per_secretaria`, o próximo número e o total já reservado
  de cada secretaria — a visão cruzada que só o admin enxerga.

O schema alvo da seção 2 (`document_types`/`profiles`) ainda deve incorporar
esse mesmo modelo de bucket quando for implementado — não faz sentido migrar
para lá e perder a numeração por secretaria.

**Correção de UI (07/08/2026, sem migração nova):** editar "Número inicial" em
Configurações → Tipos, para um documento existente, só gravava
`documents.start_number` — que, como dito acima, é legado após a criação do
bucket. Documentos com `per_secretaria = false` (ex.: Decreto) não tinham
**nenhuma** tela para ajustar o contador depois do primeiro uso (o painel
"Numeração própria" da tela Secretarias é filtrado só para tipos
`per_secretaria = true`). `saveDoc()` agora chama `set_secretaria_counter`
(bucket `''`) quando o campo muda num documento sem numeração por secretaria,
com o rótulo do campo virando "Próximo número" nesse caso; documentos por
secretaria continuam sem esse atalho de propósito, já que cada secretaria tem
contador próprio e o ajuste correto é o painel existente.

**Retrabalho no mesmo dia:** a primeira versão dessa correção comparava o
valor novo com `doc.startNumber` (o próprio `documents.start_number`) para
decidir se o contador precisava mudar. Como esse campo é exatamente o legado
que o bug original já deixava desatualizado em relação ao contador real,
reenviar o mesmo número (ex.: usuário tentando de novo depois que a primeira
tentativa, ainda com o bug, só gravou o campo legado) fazia o código concluir
"nada mudou" e pular a correção — reproduzindo o bug original por outro
caminho. Corrigido comparando com `nextNumberFor(doc)` (o valor real do
contador) em vez do campo legado; o modal também passou a **mostrar** esse
valor real no campo ao abrir para editar, em vez do valor legado, que podia
estar divergente.

### 1.2 Destinatário + anulação/edição (migração 0004, 17/07/2026)

`supabase/migrations/0004_destinatario_anulacao.sql` acrescentou a
`reservations`:

- **Destinatário**: `dest_secretaria text` (secretaria de destino ou
  "Externo / Outro órgão") e `dest_nome text` — obrigatórios na UI junto com
  a ementa (`subject`);
- **Ciclo de vida**: `status text default 'ativa'` (check `ativa|anulada`),
  `cancel_reason`, `canceled_at`, `canceled_by`, `canceled_by_name`,
  `edited_at`;
- **`reserve_number`** ganhou `p_dest_secretaria`/`p_dest_nome` (a assinatura
  antiga de 3 parâmetros foi dropada para evitar ambiguidade no PostgREST;
  chamadas antigas seguem válidas pelos defaults);
- **`cancel_reservation(id, user, motivo)`**: dono OU admin, motivo
  obrigatório, reserva permanece no histórico como anulada e o contador
  **não** regride — número anulado jamais é reemitido (RN-01);
- **`update_reservation(id, user, ementa, dest_sec, dest_nome)`**: **exclusivo
  do autor** (migração 0005 — nem o admin edita reserva de terceiro), apenas em
  reservas ativas; número/tipo jamais mudam. A anulação segue autor OU admin.

**Visibilidade do histórico** (regra de UI desde 17/07/2026, refinada na 0006):
admin vê tudo; reservas de documento **geral** (não `per_secretaria` — Lei,
Decreto etc.) têm **histórico público** (todos veem); reservas de documento
`per_secretaria` são visíveis só a quem é da mesma secretaria (usuário sem
secretaria vê só as próprias). É filtro client-side — a garantia real por RLS
continua sendo o item 1.5 da Fase 1 (doc 04).

**Migração 0006**: (a) `reserve_number` formata o número com largura mínima
de 3 dígitos **sem truncar** (`lpad(..., greatest(3, length(...)), '0')`) —
001…999 e depois 1000+ automaticamente; corrige o `lpad(...,3,...)` anterior
que cortava números de 4+ dígitos. (b) `update_reservation` grava no log de
`edicao` o **antes→depois** de cada campo alterado (ementa, secretaria de
destino, destinatário), exibido na tela de Logs.

**Migração 0008** — `dest_setor` (opcional, texto livre) e `observacoes`
(opcional) na reserva: ao reservar, o usuário pode informar um setor
específico da secretaria de destino e uma observação sobre o documento.
Ambos aparecem no detalhe da reserva no Histórico (clique na linha) e são
editáveis (mesmas regras da 0005/0006 — exclusivo do autor, log antes→depois).
Incluídos também na exportação (Excel/PDF/JSON).

**Permissões padrão por secretaria**: `app_config.secretariaPermissions`
(`{ "Administração": [doc_ids...] }`) é configurada na tela Secretarias;
usuários herdam o padrão da sua secretaria ao serem criados/aprovados
(sem sobrescrever personalizações individuais).

### 1.3 Data de envio + unicidade numérica (migração 0010, 30/07/2026)

`supabase/migrations/0010_data_envio_e_unicidade_numerica.sql` fez duas coisas
independentes:

- **`reservations.sent_at date`** (opcional, 30/07/2026, ajustado 30/07/2026):
  quando o documento foi efetivamente enviado. Puramente informativo — sem
  aviso de urgência no formulário e sem sinalização de pendência em nenhuma
  tela; é só um dado que o usuário pode registrar se quiser, no momento da
  reserva ou depois, editando-a (mesma regra de autoria da 0005).
- **`reservations.bucket_year integer`** (backfill a partir do sufixo
  `/AAAA` de `formatted_number`, ou `0` para numeração contínua) +
  **`uq_reservations_doc_bucket_year_number (doc_id, bucket_secretaria,
  bucket_year, number)`**: a rede de segurança da RN-01 deixa de depender de
  uma *string* (`formatted_number` — vulnerável se o prefixo/formato mudar) e
  passa a ser sobre o número em si, como o schema alvo da seção 2 já previa.
  O índice antigo (`uq_reservations_doc_bucket_formatted`) permanece; os dois
  se complementam. `set_secretaria_counter` também passou a comparar
  `bucket_year` em vez de casar a string do sufixo.

Importante: a atomicidade da reserva **já existia antes desta migração** —
ver a nota no início da seção 3.

### 1.4 Múltiplas secretarias de destino (migração 0011, 30/07/2026)

`supabase/migrations/0011_multiplas_secretarias_destino.sql` troca a
secretaria de destino única por uma **lista**:

- **`reservations.dest_secretarias jsonb not null default '[]'`** é a fonte
  da verdade (backfill a partir do campo antigo);
- **`reservations.dest_secretaria text`** continua existindo, agora com o
  rótulo já montado (`"Educação, Saúde"`). Quem escreve as duas colunas é
  sempre a função — nunca o cliente. Isso mantém relatórios, busca e
  qualquer frontend ainda em cache funcionando sem enxergar a coluna nova;
- `reserve_number` e `update_reservation` ganharam `p_dest_secretarias jsonb`
  (com default null): quando vem uma lista, ela vale; senão cai no
  `p_dest_secretaria` único — retrocompatível durante a janela de deploy;
- **`Todas as secretarias`** é um **valor sentinela** dentro da lista, no
  mesmo padrão do já existente `Externo / Outro órgão`. Não é expandido para
  os nomes das secretarias do momento: assim o histórico registra a intenção
  ("foi para todas") em vez de uma fotografia da lista daquele dia — se
  amanhã nascer uma secretaria nova, a reserva antiga continua dizendo a
  verdade sobre o que foi decidido na época.

Na UI a escolha virou uma lista de caixinhas (`.checks-grid`); marcar
"Todas as secretarias" desmarca e desabilita as demais.

## 2. Schema alvo (to-be)

```sql
-- ============================================================
-- TIPOS DE DOCUMENTO
-- ============================================================
create table public.document_types (          -- renomeação conceitual de "documents"
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,        -- "Ofício"
  prefix         text not null default '',    -- "Of."
  description    text,
  start_number   integer not null default 1 check (start_number >= 0),
  current_number integer not null default 1,  -- próximo a emitir (gerido só pelo servidor)
  yearly_reset   boolean not null default true,
  current_year   integer not null default extract(year from now()),
  number_padding smallint not null default 3, -- "015" em vez de "15"
  format_template text not null default '{prefix} {number}/{year}',
    -- placeholders: {prefix} {number} {year} — p/ tipos contínuos usar '{prefix} {number}'
  enabled        boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- PERFIS DE USUÁRIO (ligados ao Supabase Auth; SEM senha!)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  name          text not null,
  email         text not null,
  cargo         text,
  setor         text,
  secretaria    text,
  role          text not null default 'user_restricted'
                check (role in ('admin','user_full','user_restricted','user_readonly')),
  allowed_document_types uuid[] not null default '{}',
  approved      boolean not null default false,
  active        boolean not null default true,   -- desativar em vez de deletar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- RESERVAS — o coração do sistema
-- ============================================================
create table public.reservations (
  id               uuid primary key default gen_random_uuid(),
  doc_type_id      uuid not null references public.document_types(id),
  doc_type_name    text not null,        -- desnormalizado (snapshot histórico)
  number           integer not null,
  year             integer not null,     -- ano de emissão (p/ unicidade anual)
  formatted_number text not null,        -- "Of. 015/2026"
  subject          text not null,        -- tema/assunto (busca)
  ementa           text,
  status           text not null default 'ativa'
                   check (status in ('ativa','cancelada')),
  cancel_reason    text,
  canceled_by      uuid references auth.users(id),
  canceled_at      timestamptz,
  user_id          uuid not null references auth.users(id),
  user_name        text not null,        -- snapshots do momento da reserva
  user_cargo       text,
  user_setor       text,
  user_secretaria  text,
  created_at       timestamptz not null default now(),

  -- REDE DE SEGURANÇA da RN-01 (unicidade absoluta):
  constraint uq_reservation_number unique (doc_type_id, year, number)
);

-- ============================================================
-- LOGS DE AUDITORIA (insert-only, ver doc 04)
-- ============================================================
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,     -- 'reserva','anulacao','login','doc_tipo','usuario','config'
  action     text not null,
  details    jsonb,             -- estruturado > texto livre (filtrável)
  user_id    uuid references auth.users(id),
  user_name  text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONFIGURAÇÕES (mantida)
-- ============================================================
create table public.app_config (
  key   text primary key,
  value jsonb not null
);
```

### Índices (detalhe no doc 06)

```sql
create index idx_res_doc_year_num on public.reservations (doc_type_id, year, number desc);
create index idx_res_created      on public.reservations (created_at desc);
create index idx_res_user         on public.reservations (user_id, created_at desc);
create extension if not exists pg_trgm;
create index idx_res_subject_trgm on public.reservations using gin (subject gin_trgm_ops);
create index idx_logs_created     on public.audit_logs (created_at desc);
create index idx_logs_type        on public.audit_logs (type, created_at desc);
```

## 3. Reserva atômica — a função mais importante do sistema

> **Status real (atualizado 30/07/2026): já implementado em produção, com um
> desenho diferente deste rascunho.** O `reserve_number()` que está no ar
> (última versão em `supabase/migrations/0010_data_envio_e_unicidade_numerica.sql`)
> já roda numa única transação com `insert ... on conflict do nothing` para
> criar o bucket + `select ... for update` travando a linha de
> `document_counters` — dois cliques simultâneos já recebem números distintos
> hoje, sem precisar do schema `document_types`/`profiles` abaixo. As
> diferenças do que foi implementado para este rascunho: o lock é na linha do
> **bucket** (`document_counters`), não no tipo de documento inteiro — não
> serializa reservas de secretarias diferentes umas atrás das outras;
> identidade vem de `p_user_id` (o app ainda não usa Supabase Auth, ver item
> 1.4 do roadmap), não de `auth.uid()`; o reset anual é estrutural (bucket por
> ano), não um `current_year` com verificação preguiçosa. O que este
> rascunho previa como "rede de segurança" (constraint numérica) chegou na
> migração 0010, ver §1.3. O texto abaixo continua valendo como referência de
> desenho para uma eventual migração para Supabase Auth (roadmap 1.4/1.5).

Tudo acontece numa transação com lock de linha:

```sql
create or replace function public.reserve_number(
  p_doc_type_id uuid,
  p_subject     text,
  p_ementa      text default null
) returns public.reservations
language plpgsql
security definer                -- roda com privilégios do dono; RLS não bloqueia
set search_path = public
as $$
declare
  v_doc     public.document_types%rowtype;
  v_profile public.profiles%rowtype;
  v_year    integer := extract(year from now());
  v_number  integer;
  v_result  public.reservations;
begin
  -- 1. Validar usuário
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or not v_profile.approved or not v_profile.active then
    raise exception 'Usuário não autorizado';
  end if;
  if v_profile.role = 'user_readonly' then
    raise exception 'Usuário somente leitura não pode reservar números';
  end if;

  -- 2. Lock pessimista no tipo de documento (serializa reservas concorrentes)
  select * into v_doc
    from public.document_types
   where id = p_doc_type_id and enabled
     for update;
  if v_doc is null then
    raise exception 'Tipo de documento inexistente ou desativado';
  end if;

  -- 3. Permissão por tipo
  if v_profile.role = 'user_restricted'
     and not (p_doc_type_id = any (v_profile.allowed_document_types)) then
    raise exception 'Sem permissão para este tipo de documento';
  end if;

  -- 4. Reset anual preguiçoso (dupla garantia junto com o pg_cron)
  if v_doc.yearly_reset and v_doc.current_year <> v_year then
    v_doc.current_number := v_doc.start_number;
    v_doc.current_year   := v_year;
  end if;

  v_number := v_doc.current_number;

  -- 5. Inserir a reserva (constraint UNIQUE é a rede de segurança final)
  insert into public.reservations
    (doc_type_id, doc_type_name, number, year, formatted_number,
     subject, ementa, user_id, user_name, user_cargo, user_setor, user_secretaria)
  values
    (v_doc.id, v_doc.name, v_number,
     case when v_doc.yearly_reset then v_year else 0 end,  -- contínuos usam year=0
     public.format_doc_number(v_doc, v_number, v_year),
     p_subject, p_ementa,
     v_profile.id, v_profile.name, v_profile.cargo, v_profile.setor, v_profile.secretaria)
  returning * into v_result;

  -- 6. Avançar o contador
  update public.document_types
     set current_number = v_number + 1,
         current_year   = v_doc.current_year,
         updated_at     = now()
   where id = v_doc.id;

  -- 7. Log
  insert into public.audit_logs (type, action, details, user_id, user_name)
  values ('reserva', 'Reservou ' || v_doc.name,
          jsonb_build_object('numero', v_result.formatted_number,
                             'assunto', p_subject),
          v_profile.id, v_profile.name);

  return v_result;
end;
$$;
```

Função auxiliar de formatação (única fonte da verdade do formato):

```sql
create or replace function public.format_doc_number(
  p_doc public.document_types, p_number integer, p_year integer
) returns text language sql immutable as $$
  select trim(replace(replace(replace(p_doc.format_template,
    '{prefix}', coalesce(p_doc.prefix,'')),
    '{number}', lpad(p_number::text, p_doc.number_padding, '0')),
    '{year}',   p_year::text));
$$;
```

Chamada no frontend (substitui todo o corpo de `reserveNumber` em `app.js`):

```js
const { data, error } = await supabase.rpc('reserve_number', {
  p_doc_type_id: docId,
  p_subject: subject,
  p_ementa: ementa || null,
});
```

## 4. Anulação (RN-03)

```sql
create or replace function public.cancel_reservation(
  p_reservation_id uuid, p_reason text
) returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_res     public.reservations;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  select * into v_res from public.reservations
   where id = p_reservation_id for update;

  if v_res is null then raise exception 'Reserva não encontrada'; end if;
  if v_res.status = 'cancelada' then raise exception 'Reserva já anulada'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Motivo é obrigatório'; end if;

  -- Dono pode anular no mesmo dia; admin pode sempre
  if not (v_profile.role = 'admin'
          or (v_res.user_id = v_profile.id
              and v_res.created_at::date = current_date)) then
    raise exception 'Sem permissão para anular esta reserva';
  end if;

  update public.reservations
     set status = 'cancelada', cancel_reason = p_reason,
         canceled_by = v_profile.id, canceled_at = now()
   where id = p_reservation_id
   returning * into v_res;

  insert into public.audit_logs (type, action, details, user_id, user_name)
  values ('anulacao', 'Anulou ' || v_res.formatted_number,
          jsonb_build_object('motivo', p_reason), v_profile.id, v_profile.name);

  return v_res;
end;
$$;
```

## 5. Reset anual server-side (ADR-003)

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'yearly-number-reset',
  '5 0 1 1 *',   -- 00:05 de 1º de janeiro
  $$
    update public.document_types
       set current_number = start_number,
           current_year   = extract(year from now()),
           updated_at     = now()
     where yearly_reset
       and current_year <> extract(year from now());
  $$
);
```

A verificação preguiçosa dentro de `reserve_number()` cobre o caso do cron
falhar. **As duas juntas** garantem a RN-02.

## 6. Migração do schema atual para o alvo

Ordem sugerida (cada passo é uma migração versionada em `supabase/migrations/`):

1. **0002_add_reservation_integrity.sql** — adicionar `year`, `status`,
   `subject not null (default '')`, colunas de anulação e a constraint
   `UNIQUE (doc_id, year, number)` na tabela atual. Antes, rodar query de
   diagnóstico de duplicatas e resolvê-las manualmente:
   ```sql
   select doc_id, number, count(*) from reservations
    group by doc_id, number having count(*) > 1;
   ```
   Backfill: `update reservations set year = extract(year from "timestamp");`
2. **0003_reserve_function.sql** — criar `format_doc_number`, `reserve_number`,
   `cancel_reservation`; deploy do frontend que usa a RPC. *(A partir daqui a
   corrida está eliminada.)*
3. **0004_auth_migration.sql** — criar `profiles`, migrar dados de `users`,
   plano do doc 04; remover coluna `password`.
4. **0005_rls_policies.sql** — políticas reais (doc 04) substituindo "allow all".
5. **0006_rename_and_cleanup.sql** — renomear `documents → document_types`,
   `logs → audit_logs` (ou manter nomes antigos como views de compatibilidade
   enquanto o frontend migra), criar índices e pg_cron.

Cada migração deve poder rodar no banco de produção **com o app antigo ainda no
ar** (mudanças aditivas primeiro, remoções por último).
