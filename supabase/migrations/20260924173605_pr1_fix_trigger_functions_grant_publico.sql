-- Achado do get_advisors logo após aplicar a migration PR1: as duas
-- funções de trigger novas (criar_perfil_usuario, forcar_identidade_log)
-- nasceram com EXECUTE concedido a PUBLIC por padrão do Postgres (mesma
-- pegadinha documentada à exaustão neste projeto para funções recém-
-- criadas). Elas nunca precisam ser chamadas via RPC — só disparam via
-- trigger, e o Postgres não checa privilégio de EXECUTE para disparo de
-- trigger (confirmado transacionalmente: revoke total + trigger continua
-- funcionando normalmente). Fechado por defesa em profundidade, mesmo
-- sem risco real de exploração (RETURNS TRIGGER recusa chamada direta).
revoke all on function public.criar_perfil_usuario() from public;
revoke all on function public.forcar_identidade_log() from public;
