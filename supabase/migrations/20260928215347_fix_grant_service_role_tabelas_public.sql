-- service_role nunca tinha recebido GRANT de SELECT/INSERT/UPDATE/DELETE
-- em nenhuma tabela do schema public (só REFERENCES/TRIGGER/TRUNCATE,
-- provavelmente heranca de as tabelas terem sido criadas por SQL direto
-- sem o provisionamento padrao do Supabase). Isso bloqueava qualquer
-- acesso admin via service_role (Admin API/scripts), incluindo o
-- script de migracao de contas do PR2. service_role bypassa RLS por
-- desenho da plataforma, entao restaurar o acesso total nao amplia
-- superficie de ataque nenhuma -- so corrige o que ja deveria valer.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
