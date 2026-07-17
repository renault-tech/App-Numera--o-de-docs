# 03 — Modelo de Dados

## 1. Schema atual (as-is)

Tabelas existentes (ver `schema.sql`): `documents`, `users`, `reservations`,
`logs`, `app_config`. Resumo dos problemas:

| Tabela | Problema |
|---|---|
| `documents` | Sem controle de formato/padding; `current_number` atualizado pelo cliente (corrida); sem trilha de quem criou/alterou |
| `users` | Coluna `password` em texto puro; sem flag de "ativo/desativado" (só `approved`) |
| `reservations` | **Sem constraint de unicidade** `(doc_id, ano, number)`; sem coluna de status (não há anulação); sem coluna `year` |
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

**Visibilidade do histórico** (regra de UI desde 17/07/2026): admin vê tudo;
usuário com secretaria vê as reservas da própria secretaria; usuário sem
secretaria vê só as próprias. É filtro client-side — a garantia real por RLS
continua sendo o item 1.5 da Fase 1 (doc 04).

**Permissões padrão por secretaria**: `app_config.secretariaPermissions`
(`{ "Administração": [doc_ids...] }`) é configurada na tela Secretarias;
usuários herdam o padrão da sua secretaria ao serem criados/aprovados
(sem sobrescrever personalizações individuais).

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

Elimina a condição de corrida atual (leitura no cliente → insert → update).
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
