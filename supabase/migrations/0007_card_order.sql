-- ============================================================
-- 0007 — Ordem personalizada dos cards (por usuário, no banco)
--
-- Guarda a ordem em que cada usuário organizou os cards da tela
-- "Gerar Número". Fica no próprio registro do usuário, então a
-- preferência acompanha a conta em qualquer dispositivo/navegador.
-- É um array de IDs de documento (jsonb); vazio = ordem padrão (alfabética).
--
-- Como aplicar: cole no SQL Editor do Supabase e execute. Idempotente e
-- retrocompatível (enquanto não aplicado, o app usa o localStorage).
-- ============================================================

alter table public.users
  add column if not exists card_order jsonb not null default '[]'::jsonb;
