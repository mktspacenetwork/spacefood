-- =============================================================================
-- Campanhas - aviso "nova campanha" (peça 15c): REVERTE a 15b
--
-- Motivo : a publicação já tem o interruptor "Avisar os colaboradores agora" (POST /publish com notify), que o administrador
--          liga ou desliga. O job automático da 15b duplicaria esse aviso e ignoraria a escolha de NÃO avisar. A decisão
--          final é: um único mecanismo (o interruptor), agora LIGADO por padrão na tela de publicar.
-- Efeito : remove o job `campaign-run-open-notices` e a função `campaign_run_open_notices()`. O log da 15a (linhas
--          'campaign_opened' marcadas "anterior ao aviso de abertura") fica, é inofensivo. Nenhum aviso havia sido enviado.
-- Idempotente: pode ser reaplicada.
-- =============================================================================
do $$
begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    begin
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'campaign-run-open-notices'$q$;
    exception when others then
      raise notice 'campanhas: não foi possível remover o job do aviso de abertura (%).', sqlerrm;
    end;
  end if;
end
$$;

drop function if exists public.campaign_run_open_notices();

notify pgrst, 'reload schema';
