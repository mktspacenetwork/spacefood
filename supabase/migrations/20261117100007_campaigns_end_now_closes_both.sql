-- =============================================================================
-- Gerenciador de Campanhas — 7: "Encerrar votação agora" encerra também as inscrições
--
-- Objetivo : com o período único, participação e votação acabam juntas. Encerrar a
--            votação antes da data (botão "Encerrar votação agora") deve encerrar
--            também as inscrições da mesma campanha; antes só a votação fechava.
-- Impacto  : somente campaign_close_voting (assinatura e retorno inalterados).
-- Rollback : reaplicar a definição de campaign_close_voting da migração 3.
-- =============================================================================
create or replace function public.campaign_close_voting(p_actor jsonb, p_campaign uuid, p_end_now boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  vs text;
  r public.campaign_results;
  vot public.campaign_stages;
  reg public.campaign_stages;
  v_tally jsonb;
  top bigint;
  cands uuid[];
  new_status text;
  voters integer;
  total integer;
begin
  perform public.campaign_sync_lock(p_campaign);
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if not public.campaign_feat(c.features, 'voting') then perform public.campaign_raise('INVALID_STATE', 'no_voting'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;

  vs := public.campaign_stage_state(p_campaign, 'voting');
  if vs in ('unset', 'upcoming') then perform public.campaign_raise('VOTING_NOT_STARTED'); end if;
  if vs in ('open', 'paused') then
    if not coalesce(p_end_now, false) then perform public.campaign_raise('VOTING_STILL_OPEN'); end if;
    select * into vot from public.campaign_stages where campaign_id = p_campaign and stage_key = 'voting' for update;
    select * into reg from public.campaign_stages where campaign_id = p_campaign and stage_key = 'registration' for update;
    update public.campaign_stages set ends_at = now(), paused = false, paused_at = null, paused_by = null,
           updated_by = (p_actor->>'id')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key = 'voting';
    -- período único: as inscrições acabam junto com a votação
    if reg.starts_at is not null and reg.starts_at < now() and (reg.ends_at is null or reg.ends_at > now()) then
      update public.campaign_stages set ends_at = now(), paused = false, paused_at = null, paused_by = null,
             updated_by = (p_actor->>'id')::uuid, updated_at = now()
       where campaign_id = p_campaign and stage_key = 'registration';
    end if;
    perform public.campaign_audit(p_campaign, p_actor, 'END_VOTING_NOW', 'stage', 'voting',
      jsonb_build_object('ends_at', vot.ends_at, 'registration_ends_at', reg.ends_at),
      jsonb_build_object('ends_at', now(), 'registration_ends_at', case when reg.starts_at is not null and reg.starts_at < now() and (reg.ends_at is null or reg.ends_at > now()) then now() else reg.ends_at end), null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('submission_id', t.submission_id, 'dish_name', t.dish_name,
                                               'author', t.user_name, 'votes', t.votes) order by t.votes desc, t.dish_name), '[]'::jsonb),
         coalesce(max(t.votes), 0)
    into v_tally, top from public.campaign_tally(p_campaign) t;
  select coalesce(array_agg(t.submission_id), '{}') into cands from public.campaign_tally(p_campaign) t where t.votes = top;
  select count(distinct voter_id) into voters from public.campaign_votes where campaign_id = p_campaign and invalidated_at is null;
  select coalesce(sum(t.votes), 0)::integer into total from public.campaign_tally(p_campaign) t;

  if top > 0 and cardinality(cands) > 1 then new_status := 'tie_pending'; else new_status := 'preliminary'; end if;

  update public.campaign_results set
    status = new_status, computed_at = now(), tally = v_tally, total_valid_votes = total,
    eligible_count = public.campaign_eligible_count(p_campaign), voters_count = voters,
    tie_candidates = case when new_status = 'tie_pending' then cands else '{}' end,
    tie_decision_submission_id = null, tie_justification = null, tie_decided_by = null, tie_decided_at = null,
    winner_submission_id = case when new_status = 'preliminary' and top > 0 then cands[1] else null end,
    winner_votes = case when new_status = 'preliminary' and top > 0 then top::integer else null end
  where campaign_id = p_campaign;

  perform public.campaign_audit(p_campaign, p_actor, 'CLOSE_VOTING', 'results', p_campaign::text, null,
    jsonb_build_object('status', new_status, 'total_valid_votes', total, 'top_votes', top, 'tie', new_status = 'tie_pending'), null);
  return jsonb_build_object('status', new_status, 'total_valid_votes', total, 'tie_candidates', to_jsonb(cands), 'tally', v_tally);
end
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'campaign\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;

notify pgrst, 'reload schema';
