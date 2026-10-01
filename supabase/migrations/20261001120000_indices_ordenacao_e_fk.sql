-- Auditoria 01/10/2026: a tela inicial ordena reservas e logs por "timestamp"
-- (sem índice) e as FKs user_id não tinham índice de cobertura.
create index if not exists idx_reservations_timestamp on public.reservations("timestamp" desc);
create index if not exists idx_logs_timestamp on public.logs("timestamp" desc);
create index if not exists idx_reservations_user_id on public.reservations(user_id);
create index if not exists idx_logs_user_id on public.logs(user_id);
