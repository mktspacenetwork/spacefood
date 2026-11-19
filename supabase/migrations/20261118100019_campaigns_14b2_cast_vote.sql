-- =============================================================================
-- Campanhas - rodada 5, peça 14b2 (COMPORTAMENTAL): voto recusado em receita fora do prazo
--
-- Objetivo : campaign_cast_vote recusa (LATE_SUBMISSION) voto em receita enviada fora do prazo.
-- Impacto  : recria somente campaign_cast_vote (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.campaign_cast_vote(
  p_campaign uuid, p_voter uuid, p_voter_name text, p_submission uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  s public.campaign_submissions;
  vs text;
  v_id uuid;
  v_at timestamptz;
  actor jsonb := jsonb_build_object('id', p_voter, 'name', p_voter_name, 'role', 'user');
begin
  perform public.campaign_sync_lock(p_campaign);
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_feat(c.features, 'voting') then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_user_eligible(p_campaign, p_voter) then perform public.campaign_raise('NOT_ELIGIBLE'); end if;

  vs := public.campaign_stage_state(p_campaign, 'voting');
  if vs = 'paused' then perform public.campaign_raise('VOTING_PAUSED'); end if;
  if vs = 'upcoming' then perform public.campaign_raise('VOTING_NOT_STARTED'); end if;
  if vs <> 'open' then perform public.campaign_raise('VOTING_CLOSED'); end if;

  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign;
  if not found then perform public.campaign_raise('NOT_APPROVED'); end if;
  -- receita enviada FORA DO PRAZO não concorre (o gatilho campaign_votes_late_guard repete esta regra no banco)
  if s.is_late then perform public.campaign_raise('LATE_SUBMISSION'); end if;
  if s.user_id = p_voter then perform public.campaign_raise('SELF_VOTE'); end if;
  if s.status <> 'approved' then perform public.campaign_raise('NOT_APPROVED'); end if;

  begin
    insert into public.campaign_votes (campaign_id, submission_id, voter_id, voter_name)
    values (p_campaign, p_submission, p_voter, coalesce(p_voter_name, ''))
    returning id, created_at into v_id, v_at;
  exception when unique_violation then
    perform public.campaign_raise('ALREADY_VOTED');
  end;

  perform public.campaign_audit(p_campaign, actor, 'CAST_VOTE', 'vote', v_id::text, null,
    jsonb_build_object('submission_id', p_submission), null);
  return jsonb_build_object('vote_id', v_id, 'created_at', v_at, 'dish_name', s.dish_name);
end
$$;

revoke all on function public.campaign_cast_vote(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.campaign_cast_vote(uuid, uuid, text, uuid) to service_role;
