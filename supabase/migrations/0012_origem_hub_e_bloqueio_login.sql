-- Suporte ao cadastro unificado pela Central Cataguases (Hub): marca de
-- onde veio o último login (para o painel de migração no Hub saber quantos
-- usuários já passaram a acessar por lá) e uma chave de configuração para
-- bloquear o login direto deste app quando o admin decidir que todo mundo
-- já migrou. Aditivo, sem alterar nenhuma coluna existente.

alter table public.users
  add column if not exists ultimo_acesso_origem text,
  add column if not exists veio_do_hub_em timestamptz;

-- Sem seed obrigatório: a leitura no app trata a ausência da chave como
-- "não bloqueado" (mesmo padrão já usado para outras chaves de app_config
-- que só ganham linha quando alguém salva algo pela primeira vez).
