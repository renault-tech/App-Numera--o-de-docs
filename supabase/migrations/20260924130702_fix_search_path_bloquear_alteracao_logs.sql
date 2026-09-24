-- Recuperado do histórico real do banco (supabase_migrations.schema_migrations,
-- version 20260924130702) — esta migration foi aplicada de verdade numa
-- parte anterior desta sessão (antes de uma compactação de contexto) mas
-- nunca chegou a virar arquivo neste repositório. Texto idêntico ao que
-- está gravado no banco (conferido via
-- select statements from supabase_migrations.schema_migrations where
-- version = '20260924130702').
--
-- Corrige um detalhe deixado de fora da migration anterior
-- (20260924050000_endurecer_reservas_e_logs_sem_quebrar_fluxo.sql,
-- version real 20260924130650): a função de trigger
-- bloquear_alteracao_logs() nasceu sem `set search_path to ''` —
-- inconsistente com o padrão de segurança já usado em toda função nova
-- deste projeto (search_path fixo evita sequestro de função por schema
-- malicioso). `create or replace` idêntico, só acrescentando a cláusula.
create or replace function public.bloquear_alteracao_logs()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'logs é append-only: UPDATE/DELETE não são permitidos';
end;
$$;
