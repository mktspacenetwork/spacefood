-- =============================================================================
-- Campanhas - aviso "nova campanha" (peça 15b): avisa dentro do app quando uma campanha passa a estar no ar
--
-- Objetivo : o colaborador recebe UMA notificação dentro do app (mesma caixa dos avisos de resultado) quando uma campanha
--            fica liberada para ele: publicada, não suspensa, módulo ligado, já visível (visible_from) e com a
--            participação aberta ("Cadastre sua receita...") ou ainda por abrir ("já está em Campanhas, veja as datas").
--            Participação encerrada ou pausada não gera aviso.
-- Como     : campaign_run_open_notices() é chamada por um job do pg_cron a cada minuto. Cada pessoa elegível recebe uma vez
--            (campaign_notification_log, event_key 'campaign_opened', chave única). Republicar/retomar não repete.
--            Quem não é do público da campanha (campaign_user_eligible) não recebe. Sem push nesta versão.
-- Impacto  : função nova + job novo 'campaign-run-open-notices'. Nenhuma função existente é alterada.
-- Rollback : select cron.unschedule(jobid) from cron.job where jobname = 'campaign-run-open-notices';
--            drop function public.campaign_run_open_notices();   (os avisos já enviados ficam)
-- Idempotente: pode ser reaplicada.
-- =============================================================================
create or replace function public.campaign_run_open_notices()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  u record;
  has_kv boolean;
  v_reg text;
  v_title text;
  v_msg text;
  v_claim integer;
  n_sent integer := 0;
  n_err integer := 0;
begin
  if not public.campaign_module_enabled() then
    return jsonb_build_object('sent', 0, 'errors', 0);
  end if;
  has_kv := to_regprocedure('public.kv_append_to_array(text,jsonb)') is not null;

  for c in
    select ca.id, ca.name from public.campaigns ca
     where public.campaign_is_released(ca.id)
       and public.campaign_feat(ca.features, 'submission')
  loop
    v_reg := public.campaign_stage_state(c.id, 'registration');
    continue when v_reg not in ('open', 'upcoming');
    v_title := 'Nova campanha: ' || c.name;
    v_msg := case when v_reg = 'open'
                  then 'Cadastre sua receita em Campanhas e participe.'
                  else 'A campanha já está em Campanhas. Veja as datas para participar.' end;

    for u in
      select au.id as user_id from auth.users au
       where not exists (select 1 from public.campaign_notification_log l
                          where l.campaign_id = c.id and l.user_id = au.id and l.event_key = 'campaign_opened' and l.entity_id = '')
         and public.campaign_user_eligible(c.id, au.id)
    loop
      insert into public.campaign_notification_log (campaign_id, user_id, event_key, entity_id)
      values (c.id, u.user_id, 'campaign_opened', '')
      on conflict (campaign_id, user_id, event_key, entity_id) do nothing;
      get diagnostics v_claim = row_count;
      if v_claim = 1 then
        begin
          if not has_kv then raise exception 'kv_append_to_array indisponível'; end if;
          perform public.kv_append_to_array('notifications:user:' || u.user_id::text, jsonb_build_object(
            'id', gen_random_uuid()::text, 'title', v_title, 'message', v_msg, 'type', 'info',
            'sentAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'sentByName', 'Campanhas', 'targetUserId', u.user_id::text));
          update public.campaign_notification_log set inbox_ok = true, push_ok = false
           where campaign_id = c.id and user_id = u.user_id and event_key = 'campaign_opened' and entity_id = '';
          n_sent := n_sent + 1;
        exception when others then
          n_err := n_err + 1;
          update public.campaign_notification_log set inbox_ok = false, push_ok = false, error = left(sqlerrm, 300)
           where campaign_id = c.id and user_id = u.user_id and event_key = 'campaign_opened' and entity_id = '';
        end;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('sent', n_sent, 'errors', n_err);
end
$$;

revoke all on function public.campaign_run_open_notices() from public, anon, authenticated;
grant execute on function public.campaign_run_open_notices() to service_role;

-- Agendador (pg_cron), só se a extensão existir (mesmo padrão do job das divulgações).
do $$
begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    begin
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'campaign-run-open-notices'$q$;
      execute $q$select cron.schedule('campaign-run-open-notices', '* * * * *', 'select public.campaign_run_open_notices()')$q$;
    exception when others then
      raise notice 'campanhas: não foi possível agendar o aviso de abertura (%).', sqlerrm;
    end;
  end if;
end
$$;

notify pgrst, 'reload schema';
