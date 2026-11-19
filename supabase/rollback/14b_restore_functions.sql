-- =============================================================================
-- SNAPSHOT B (imediatamente ANTES da 14b, 14a já aplicada): definições das 7 funções da 14b. GERADO por
-- supabase/rollback/14b_snapshot_query.sql (somente leitura). NÃO contém campaign_publish_check nem função aditiva da 14a.
-- Cada seção ("-- >>> SECTION nome" ... "-- <<< END nome") é uma peça independente, aplicada UMA POR CHAMADA
-- (apply_migration, nome campaigns_14b_rollback_<função>), e conferida pelo hash do corpo (14_expected_hashes.json, "before").
--
-- ROLLBACK PADRÃO DA 14b (cirúrgico): restaurar SÓ as 5 PORTEIRAS, nesta ordem:
--   campaign_collab_state -> campaign_submit -> campaign_finalize_submission -> campaign_update_submission -> campaign_review
-- MANTER campaign_cast_vote e campaign_tally (travas da 14b: só excluem is_late = true; protegem as receitas atrasadas já criadas).
-- Permanecem: campaign_publish_check (14a), funções/gatilhos/coluna da 14a e todos os dados.
-- =============================================================================

-- >>> SECTION campaign_collab_state (porteira)
CREATE OR REPLACE FUNCTION public.campaign_collab_state(p_campaign uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  select count(*)::integer, count(*) filter (where status <> 'approved')::integer
    into n_sub, n_editable
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

  can_submit := coalesce(released and public.campaign_feat(c.features, 'submission') and n_sub < max_sub
                and reg = 'open' and c.status = 'authorized', false);
  can_edit := coalesce(released and n_editable > 0
                and reg = 'open' and c.status = 'authorized', false);
  can_vote := coalesce(released and public.campaign_feat(c.features, 'voting') and vot = 'open'
              and v.id is null and c.status = 'authorized', false);

  return jsonb_build_object(
    'visible', true, 'released', released, 'eligible', true, 'stage', stage,
    'registration', reg, 'voting', vot, 'locked', locked,
    'can_submit', can_submit, 'can_edit', can_edit, 'can_vote', can_vote,
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
$function$
;

revoke all on function public.campaign_collab_state(p_campaign uuid, p_user uuid) from public, anon, authenticated;
grant execute on function public.campaign_collab_state(p_campaign uuid, p_user uuid) to service_role;
-- <<< END campaign_collab_state

-- >>> SECTION campaign_submit (porteira)
CREATE OR REPLACE FUNCTION public.campaign_submit(p_campaign uuid, p_user uuid, p_user_name text, p_fields jsonb, p_media jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c public.campaigns;
  st text;
  sid uuid;
  meta jsonb;
  existing uuid;
  pending uuid;
  v_count integer;
  v_slot smallint;
  n_main integer := 0;
  m jsonb;
  uploads jsonb;
  actor jsonb := jsonb_build_object('id', p_user, 'name', p_user_name, 'role', 'user');
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if c.type <> 'recipe_contest' or not public.campaign_feat(c.features, 'submission') then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_user_eligible(p_campaign, p_user) then perform public.campaign_raise('NOT_ELIGIBLE'); end if;
  st := public.campaign_stage_state(p_campaign, 'registration');
  if st = 'paused' then perform public.campaign_raise('REGISTRATION_PAUSED'); end if;
  if st <> 'open' then perform public.campaign_raise('REGISTRATION_CLOSED'); end if;
  perform public.campaign_validate_recipe(p_fields, false);

  -- foto principal: só é exigida quando a campanha aceita fotos E está configurada para exigir
  if public.campaign_feat(c.features, 'photos') and coalesce((c.media_limits->>'require_main_photo')::boolean, false) then
    for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
      if m->>'kind' = 'main_photo' then n_main := n_main + 1; end if;
    end loop;
    if n_main = 0 then perform public.campaign_raise('MAIN_PHOTO_REQUIRED'); end if;
  end if;

  -- serializa os envios da MESMA pessoa na MESMA campanha (cliques repetidos / abas / retentativas)
  perform pg_advisory_xact_lock(hashtextextended('campaign_submit:' || p_campaign::text || ':' || p_user::text, 0));

  select count(*)::integer into v_count
    from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user;
  -- envio de mídia ainda em andamento: retoma esse (nos dois modos)
  select id into pending from public.campaign_submissions
   where campaign_id = p_campaign and user_id = p_user and status = 'pending_media' order by slot limit 1;
  if pending is not null then perform public.campaign_raise('ALREADY_SUBMITTED', pending::text); end if;
  if v_count >= 1 and not public.campaign_feat(c.features, 'multiple_submissions') then
    select id into existing from public.campaign_submissions
     where campaign_id = p_campaign and user_id = p_user order by slot limit 1;
    perform public.campaign_raise('ALREADY_SUBMITTED', existing::text);
  end if;
  if v_count >= 10 then perform public.campaign_raise('SUBMISSION_LIMIT'); end if;
  select min(g)::smallint into v_slot from generate_series(1, 10) g
   where not exists (select 1 from public.campaign_submissions x
                      where x.campaign_id = p_campaign and x.user_id = p_user and x.slot = g);
  if v_slot is null then perform public.campaign_raise('SUBMISSION_LIMIT'); end if;

  select raw_user_meta_data into meta from auth.users where id = p_user;
  begin
    insert into public.campaign_submissions
      (campaign_id, user_id, slot, user_name, user_unit, user_department, dish_name, description, ingredients, preparation, status,
       submitted_at, finalized_at)
    values
      (p_campaign, p_user, v_slot, coalesce(nullif(btrim(p_user_name), ''), 'Colaborador'),
       coalesce(meta->>'lunch_location', ''), coalesce(meta->>'department', ''),
       btrim(p_fields->>'dish_name'),
       coalesce(btrim(p_fields->>'description'), ''),
       coalesce(btrim(p_fields->>'ingredients'), ''),
       coalesce(btrim(p_fields->>'preparation'), ''),
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then 'submitted' else 'pending_media' end,
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then now() else null end,
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then now() else null end)
    returning id into sid;
  exception when unique_violation then
    select id into existing from public.campaign_submissions
     where campaign_id = p_campaign and user_id = p_user order by slot limit 1;
    perform public.campaign_raise('ALREADY_SUBMITTED', existing::text);
  end;

  uploads := public.campaign_add_media_intents(p_campaign, sid, p_media);
  perform public.campaign_audit(p_campaign, actor, 'SUBMIT_RECIPE', 'submission', sid::text, null,
    jsonb_build_object('dish_name', btrim(p_fields->>'dish_name'), 'media', jsonb_array_length(uploads), 'slot', v_slot), null);
  return jsonb_build_object('submission_id', sid,
    'status', case when jsonb_array_length(uploads) = 0 then 'submitted' else 'pending_media' end,
    'uploads', uploads, 'slot', v_slot);
end
$function$
;

revoke all on function public.campaign_submit(p_campaign uuid, p_user uuid, p_user_name text, p_fields jsonb, p_media jsonb) from public, anon, authenticated;
grant execute on function public.campaign_submit(p_campaign uuid, p_user uuid, p_user_name text, p_fields jsonb, p_media jsonb) to service_role;
-- <<< END campaign_submit

-- >>> SECTION campaign_finalize_submission (porteira)
CREATE OR REPLACE FUNCTION public.campaign_finalize_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_verified jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c public.campaigns;
  s public.campaign_submissions;
  r record;
  ver jsonb;
  v_max bigint;
  first_time boolean;
  actor jsonb;
  reg text;
begin
  select * into s from public.campaign_submissions
   where id = p_submission and campaign_id = p_campaign and user_id = p_user for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if s.status = 'approved' then perform public.campaign_raise('EDIT_LOCKED'); end if;
  reg := public.campaign_stage_state(p_campaign, 'registration');
  if reg = 'paused' then perform public.campaign_raise('REGISTRATION_PAUSED'); end if;
  if reg <> 'open' then perform public.campaign_raise('REGISTRATION_CLOSED'); end if;
  actor := jsonb_build_object('id', p_user, 'name', s.user_name, 'role', 'user');

  for r in select * from public.campaign_media where submission_id = p_submission and status = 'pending' loop
    ver := null;
    select e.value into ver from jsonb_array_elements(coalesce(p_verified, '[]'::jsonb)) as e where e.value->>'id' = r.id::text limit 1;
    if ver is null then perform public.campaign_raise('MEDIA_NOT_VERIFIED', r.id::text); end if;
    if r.kind = 'video' then v_max := ((c.media_limits->>'max_video_mb')::bigint) * 1024 * 1024;
    else v_max := ((c.media_limits->>'max_photo_mb')::bigint) * 1024 * 1024; end if;
    if coalesce((ver->>'size')::bigint, 0) <= 0 or (ver->>'size')::bigint > v_max then
      perform public.campaign_raise('MEDIA_TOO_LARGE', r.id::text);
    end if;
    update public.campaign_media
       set status = 'ready', size_bytes = (ver->>'size')::bigint, mime = lower(coalesce(ver->>'mime', r.mime)), finalized_at = now()
     where id = r.id;
  end loop;

  if coalesce((c.media_limits->>'require_main_photo')::boolean, false) then
    perform 1 from public.campaign_media where submission_id = p_submission and kind = 'main_photo' and status = 'ready';
    if not found then perform public.campaign_raise('MAIN_PHOTO_REQUIRED'); end if;
  end if;

  first_time := s.finalized_at is null;
  update public.campaign_submissions
     set status = case when first_time then 'submitted' else 'in_review' end,
         submitted_at = coalesce(submitted_at, now()), finalized_at = coalesce(finalized_at, now()), updated_at = now()
   where id = p_submission;

  perform public.campaign_audit(p_campaign, actor, 'FINALIZE_SUBMISSION', 'submission', p_submission::text,
    jsonb_build_object('status', s.status), jsonb_build_object('status', case when first_time then 'submitted' else 'in_review' end), null);
  return jsonb_build_object('status', case when first_time then 'submitted' else 'in_review' end,
                            'first_time', first_time, 'dish_name', s.dish_name);
end
$function$
;

revoke all on function public.campaign_finalize_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_verified jsonb) from public, anon, authenticated;
grant execute on function public.campaign_finalize_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_verified jsonb) to service_role;
-- <<< END campaign_finalize_submission

-- >>> SECTION campaign_update_submission (porteira)
CREATE OR REPLACE FUNCTION public.campaign_update_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_fields jsonb, p_media_ops jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c public.campaigns;
  s public.campaign_submissions;
  before jsonb;
  after_row public.campaign_submissions;
  changed boolean := false;
  media_changed boolean := false;
  rid text;
  uploads jsonb := '[]'::jsonb;
  actor jsonb;
  new_status text;
  reg text;
begin
  select * into s from public.campaign_submissions
   where id = p_submission and campaign_id = p_campaign and user_id = p_user for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if s.status = 'approved' then perform public.campaign_raise('EDIT_LOCKED'); end if;
  reg := public.campaign_stage_state(p_campaign, 'registration');
  if reg = 'paused' then perform public.campaign_raise('REGISTRATION_PAUSED'); end if;
  if reg <> 'open' then perform public.campaign_raise('REGISTRATION_CLOSED'); end if;
  actor := jsonb_build_object('id', p_user, 'name', s.user_name, 'role', 'user');

  perform public.campaign_validate_recipe(coalesce(p_fields, '{}'::jsonb), true);
  before := jsonb_build_object('dish_name', s.dish_name, 'description', s.description,
                               'ingredients', s.ingredients, 'preparation', s.preparation, 'status', s.status);

  if coalesce(p_fields, '{}'::jsonb) <> '{}'::jsonb then
    if (p_fields ? 'dish_name' and btrim(p_fields->>'dish_name') is distinct from s.dish_name)
       or (p_fields ? 'description' and coalesce(btrim(p_fields->>'description'), '') is distinct from s.description)
       or (p_fields ? 'ingredients' and coalesce(btrim(p_fields->>'ingredients'), '') is distinct from s.ingredients)
       or (p_fields ? 'preparation' and coalesce(btrim(p_fields->>'preparation'), '') is distinct from s.preparation) then
      changed := true;
    end if;
  end if;

  for rid in select jsonb_array_elements_text(coalesce(p_media_ops->'remove', '[]'::jsonb)) loop
    update public.campaign_media set status = 'removed', removed_at = now()
     where id = rid::uuid and submission_id = p_submission and status <> 'removed';
    if found then media_changed := true; end if;
  end loop;
  if jsonb_array_length(coalesce(p_media_ops->'add', '[]'::jsonb)) > 0 then
    uploads := public.campaign_add_media_intents(p_campaign, p_submission, p_media_ops->'add');
    media_changed := true;
  end if;

  if not changed and not media_changed then
    return jsonb_build_object('changed', false, 'status', s.status, 'uploads', '[]'::jsonb);
  end if;

  new_status := case when s.status = 'pending_media' then 'pending_media' else 'in_review' end;
  update public.campaign_submissions set
    dish_name = case when p_fields ? 'dish_name' then btrim(p_fields->>'dish_name') else dish_name end,
    description = case when p_fields ? 'description' then coalesce(btrim(p_fields->>'description'), '') else description end,
    ingredients = case when p_fields ? 'ingredients' then coalesce(btrim(p_fields->>'ingredients'), '') else ingredients end,
    preparation = case when p_fields ? 'preparation' then coalesce(btrim(p_fields->>'preparation'), '') else preparation end,
    status = new_status,
    rejection_reason = case when new_status = 'in_review' then null else rejection_reason end,
    reviewed_by = case when new_status = 'in_review' then null else reviewed_by end,
    reviewed_by_name = case when new_status = 'in_review' then null else reviewed_by_name end,
    reviewed_at = case when new_status = 'in_review' then null else reviewed_at end,
    content_version = content_version + 1, updated_at = now()
  where id = p_submission;

  select * into after_row from public.campaign_submissions where id = p_submission;
  perform public.campaign_audit(p_campaign, actor, 'UPDATE_SUBMISSION', 'submission', p_submission::text, before,
    jsonb_build_object('dish_name', after_row.dish_name, 'description', after_row.description,
                       'ingredients', after_row.ingredients, 'preparation', after_row.preparation, 'status', after_row.status,
                       'media_changed', media_changed), null);
  return jsonb_build_object('changed', true, 'status', after_row.status, 'uploads', uploads);
end
$function$
;

revoke all on function public.campaign_update_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_fields jsonb, p_media_ops jsonb) from public, anon, authenticated;
grant execute on function public.campaign_update_submission(p_campaign uuid, p_user uuid, p_submission uuid, p_fields jsonb, p_media_ops jsonb) to service_role;
-- <<< END campaign_update_submission

-- >>> SECTION campaign_review (porteira)
CREATE OR REPLACE FUNCTION public.campaign_review(p_actor jsonb, p_campaign uuid, p_submission uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c public.campaigns;
  s public.campaign_submissions;
  r public.campaign_results;
  new_status text;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  if public.campaign_feat(c.features, 'voting') and public.campaign_stage_state(p_campaign, 'voting') = 'closed' then
    perform public.campaign_raise('VOTING_CLOSED');
  end if;
  if p_decision not in ('approve', 'reject') then perform public.campaign_raise('INVALID_FIELDS', 'decision'); end if;
  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  if s.status = 'pending_media' then perform public.campaign_raise('SUBMISSION_INCOMPLETE'); end if;

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
$function$
;

revoke all on function public.campaign_review(p_actor jsonb, p_campaign uuid, p_submission uuid, p_decision text, p_reason text) from public, anon, authenticated;
grant execute on function public.campaign_review(p_actor jsonb, p_campaign uuid, p_submission uuid, p_decision text, p_reason text) to service_role;
-- <<< END campaign_review

-- >>> SECTION campaign_cast_vote (trava)
CREATE OR REPLACE FUNCTION public.campaign_cast_vote(p_campaign uuid, p_voter uuid, p_voter_name text, p_submission uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;

revoke all on function public.campaign_cast_vote(p_campaign uuid, p_voter uuid, p_voter_name text, p_submission uuid) from public, anon, authenticated;
grant execute on function public.campaign_cast_vote(p_campaign uuid, p_voter uuid, p_voter_name text, p_submission uuid) to service_role;
-- <<< END campaign_cast_vote

-- >>> SECTION campaign_tally (trava)
CREATE OR REPLACE FUNCTION public.campaign_tally(p_campaign uuid)
 RETURNS TABLE(submission_id uuid, dish_name text, user_name text, votes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select s.id, s.dish_name, s.user_name,
         count(v.id) filter (where v.invalidated_at is null) as votes
    from public.campaign_submissions s
    left join public.campaign_votes v on v.submission_id = s.id and v.campaign_id = s.campaign_id
   where s.campaign_id = p_campaign and s.status = 'approved'
   group by s.id, s.dish_name, s.user_name
   order by votes desc, s.dish_name
$function$
;

revoke all on function public.campaign_tally(p_campaign uuid) from public, anon, authenticated;
grant execute on function public.campaign_tally(p_campaign uuid) to service_role;
-- <<< END campaign_tally
