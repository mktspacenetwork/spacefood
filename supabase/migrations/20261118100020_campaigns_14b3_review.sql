-- =============================================================================
-- Campanhas - rodada 5, peça 14b3 (COMPORTAMENTAL): análise de receita fora do prazo
--
-- Objetivo : receita atrasada pode ser aprovada/reprovada com a votação encerrada ou o resultado confirmado, até a divulgação; depois da divulgação, ou com a campanha encerrada/arquivada, toda análise continua bloqueada; receita no prazo mantém os bloqueios.
-- Impacto  : recria somente campaign_review (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.campaign_review(
  p_actor jsonb, p_campaign uuid, p_submission uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  s public.campaign_submissions;
  r public.campaign_results;
  new_status text;
  s_found boolean;
  late_exempt boolean;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign for update;
  s_found := found;
  -- Receita FORA DO PRAZO pode ser analisada mesmo com a votação encerrada ou o resultado confirmado, enquanto o
  -- resultado não for divulgado (campaign_late_window; campanha encerrada/arquivada já foi barrada acima).
  -- Ela não concorre: aprovar ou reprovar não altera votação, ranking nem resultado. Receita no prazo: bloqueios de sempre.
  late_exempt := s_found and s.is_late and public.campaign_late_window(p_campaign);
  select * into r from public.campaign_results where campaign_id = p_campaign;
  if not late_exempt then
    if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
    if public.campaign_feat(c.features, 'voting') and public.campaign_stage_state(p_campaign, 'voting') = 'closed' then
      perform public.campaign_raise('VOTING_CLOSED');
    end if;
  end if;
  if p_decision not in ('approve', 'reject') then perform public.campaign_raise('INVALID_FIELDS', 'decision'); end if;
  if not s_found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  if s.status = 'pending_media' then perform public.campaign_raise('SUBMISSION_INCOMPLETE'); end if;

  -- Receita aprovada que já recebeu votos válidos não pode ser reprovada: os votos sumiriam da
  -- contagem e quem votou não teria como votar de novo. (Para isso, invalide os votos antes.)
  if p_decision = 'reject' and s.status = 'approved' then
    perform 1 from public.campaign_votes where submission_id = p_submission and invalidated_at is null;
    if found then perform public.campaign_raise('HAS_VOTES'); end if;
  end if;

  if p_decision = 'reject' then
    if length(btrim(coalesce(p_reason, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
    new_status := 'rejected';
  else
    new_status := 'approved';
  end if;

  update public.campaign_submissions set
    status = new_status,
    rejection_reason = case when new_status = 'rejected' then btrim(p_reason) else null end,
    reviewed_by = (p_actor->>'id')::uuid, reviewed_by_name = coalesce(p_actor->>'name', ''),
    reviewed_at = now(), updated_at = now()
  where id = p_submission;

  perform public.campaign_audit(p_campaign, p_actor,
    case when new_status = 'approved' then 'APPROVE_SUBMISSION' else 'REJECT_SUBMISSION' end,
    'submission', p_submission::text,
    jsonb_build_object('status', s.status, 'rejection_reason', s.rejection_reason),
    jsonb_build_object('status', new_status, 'rejection_reason', case when new_status = 'rejected' then btrim(p_reason) else null end),
    case when new_status = 'rejected' then btrim(p_reason) else null end);
  return jsonb_build_object('status', new_status, 'user_id', s.user_id, 'dish_name', s.dish_name);
end
$$;

revoke all on function public.campaign_review(jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.campaign_review(jsonb, uuid, uuid, text, text) to service_role;
