-- =============================================================================
-- Campanhas - rodada 5, peça 14b7 (COMPORTAMENTAL): estado do colaborador com a janela de envio atrasado (INTERRUPTOR FINAL)
--
-- Objetivo : collab_state passa a devolver late_window e a liberar can_submit/can_edit na janela de envio atrasado; é a peça que liga o botão "Cadastrar receita" e o aviso na tela (aplicar POR ÚLTIMO, com o front novo já no ar).
-- Impacto  : recria somente campaign_collab_state (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.campaign_collab_state(p_campaign uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  s public.campaign_submissions;
  v public.campaign_votes;
  released boolean;
  visible boolean;
  elig boolean;
  reg text;
  vot text;
  locked boolean;
  stage text;
  res_vis boolean;
  rank_vis boolean;
  can_submit boolean;
  can_edit boolean;
  can_vote boolean;
  n_sub integer;
  n_editable integer;
  n_edit_late integer;
  late boolean;
  max_sub integer;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then return jsonb_build_object('visible', false); end if;
  visible := public.campaign_is_visible(p_campaign);
  released := public.campaign_is_released(p_campaign);
  elig := public.campaign_user_eligible(p_campaign, p_user);
  if not visible or not elig then
    return jsonb_build_object('visible', false, 'eligible', elig);
  end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  select * into s from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user order by slot limit 1;
  select count(*)::integer, count(*) filter (where status <> 'approved')::integer,
         count(*) filter (where status <> 'approved' and (is_late or finalized_at is null))::integer
    into n_sub, n_editable, n_edit_late
    from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user;
  select * into v from public.campaign_votes where campaign_id = p_campaign and voter_id = p_user;
  reg := public.campaign_stage_state(p_campaign, 'registration');
  vot := public.campaign_stage_state(p_campaign, 'voting');
  max_sub := case when public.campaign_feat(c.features, 'multiple_submissions') then 10 else 1 end;
  locked := n_sub > 0 and n_editable = 0;
  res_vis := public.campaign_results_visible(p_campaign);
  rank_vis := released and public.campaign_ranking_visible(p_campaign);

  stage := case
    when res_vis then 'results'
    when c.status = 'closed' then 'closed'
    when not released then 'upcoming'
    when reg = 'open' and vot = 'open' then 'open'
    when vot = 'paused' then 'voting_paused'
    when vot = 'open' then 'voting'
    when vot = 'closed' then 'voting_closed'
    when reg = 'open' then 'registration'
    when reg = 'paused' then 'registration_paused'
    when reg = 'upcoming' then 'upcoming'
    when reg = 'closed' then 'review'
    else 'upcoming' end;

  -- janela de envio atrasado (fora do prazo): campanha com votação, participação encerrada, resultado não divulgado
  late := coalesce(released and public.campaign_late_window(p_campaign), false);
  can_submit := coalesce(released and public.campaign_feat(c.features, 'submission') and n_sub < max_sub
                and (reg = 'open' or late) and c.status = 'authorized', false);
  can_edit := coalesce(released and c.status = 'authorized'
                and ((n_editable > 0 and reg = 'open') or (late and n_edit_late > 0)), false);
  can_vote := coalesce(released and public.campaign_feat(c.features, 'voting') and vot = 'open'
              and v.id is null and c.status = 'authorized', false);

  return jsonb_build_object(
    'visible', true, 'released', released, 'eligible', true, 'stage', stage,
    'registration', reg, 'voting', vot, 'locked', locked,
    'can_submit', can_submit, 'can_edit', can_edit, 'can_vote', can_vote, 'late_window', late,
    'my_submission_id', s.id, 'my_submission_status', s.status,
    'my_submissions_count', n_sub, 'max_submissions', max_sub,
    'has_voted', v.id is not null and v.invalidated_at is null,
    'voted_at', v.created_at, 'voted_submission_id', v.submission_id,
    'gallery_visible', released and public.campaign_gallery_visible(p_campaign),
    'ranking_visible', rank_vis,
    'ranking_partial', rank_vis and coalesce(r.status, 'none') <> 'announced',
    'results_visible', res_vis,
    'tour', coalesce(c.features->'tour', '{"enabled":false,"version":1}'::jsonb));
end
$$;

revoke all on function public.campaign_collab_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.campaign_collab_state(uuid, uuid) to service_role;
