-- ============================================================
-- 0009 — Habilita Supabase Realtime nas tabelas que o app escuta
--
-- Sem isso, "supabase.channel(...).on('postgres_changes', ...)" nunca
-- recebe nada — silenciosamente. Necessário para: notificar o admin em
-- tempo real quando alguém se cadastra (pendente de aprovação) e manter a
-- tela atualizada sem precisar de F5 (usuários, reservas, documentos,
-- contadores, configurações e logs).
--
-- Idempotente: "add table" falha se a tabela já estiver na publicação,
-- por isso primeiro removemos (caso já exista) e adicionamos de novo.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['users','reservations','documents','document_counters','app_config','logs'] loop
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
