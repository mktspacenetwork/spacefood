-- =============================================================================
-- Campanhas - privilégios da tabela campaign_history_hidden (peça 21c)
--
-- Regra do módulo: o service_role só LÊ as tabelas campaign_*; toda escrita passa pelas funções SECURITY DEFINER. A peça 21a criou a tabela e
-- o Supabase concedeu, por padrão, escrita ao service_role; aqui ela é retirada (a função campaign_history_hide continua gravando, pois
-- executa como dona da tabela). Fica só o SELECT que a API usa para esconder as campanhas removidas do Histórico.
-- Rollback : grant insert, update, delete on table public.campaign_history_hidden to service_role;
-- Idempotente.
-- =============================================================================
revoke insert, update, delete, truncate, references, trigger on table public.campaign_history_hidden from service_role;
grant select on table public.campaign_history_hidden to service_role;
