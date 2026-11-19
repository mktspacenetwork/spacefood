-- =============================================================================
-- Campanhas - aviso "nova campanha" (peça 15a): marca como JÁ AVISADAS as campanhas que hoje estão no ar
--
-- Objetivo : antes de ligar o aviso de abertura (peça 15b), registra no log de notificações que as campanhas
--            já liberadas NÃO precisam de aviso. Assim só as publicações FUTURAS notificam os colaboradores.
-- Impacto  : só INSERT no log (campaign_notification_log, event_key = 'campaign_opened'); nada é enviado.
-- Ordem    : aplicar ANTES da 15b (a 15b agenda o job que envia os avisos).
-- Idempotente: on conflict do nothing.
-- =============================================================================
insert into public.campaign_notification_log (campaign_id, user_id, event_key, entity_id, inbox_ok, push_ok, error)
select c.id, au.id, 'campaign_opened', '', null, false, 'anterior ao aviso de abertura'
  from public.campaigns c
  join auth.users au on public.campaign_user_eligible(c.id, au.id)
 where public.campaign_is_released(c.id)
on conflict (campaign_id, user_id, event_key, entity_id) do nothing;
