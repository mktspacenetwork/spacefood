-- =============================================================================
-- Gerenciador de Campanhas — 6: período simples, votação concorrente e receita enxuta
--
-- Objetivo : (a) o período da campanha vira só início + encerramento; com votação,
--            inscrições e votação ficam abertas NA MESMA janela (concorrente);
--            (b) a receita passa a exigir só o nome do prato (descrição, ingredientes
--            e modo de preparo viram opcionais); (c) a trava de edição deixa de ser da
--            campanha inteira (começo da votação) e passa a ser POR RECEITA: receita
--            aprovada fica congelada; pendente/reprovada continua editável enquanto as
--            inscrições estiverem abertas.
-- Impacto  : somente objetos campaign_* (tabela de receitas + funções + gatilhos).
--            Compatível com a interface já publicada (mesmas assinaturas; chamadas com os
--            4 campos continuam válidas). Idempotente.
-- Rollback : reaplicar as definições das migrações 2 e 3 (funções/gatilhos) e as
--            restrições originais de campaign_submissions (ver migração 1).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Receita: descrição, ingredientes e preparo opcionais (só limites máximos)
-- ---------------------------------------------------------------------------
alter table public.campaign_submissions drop constraint if exists campaign_submissions_description_check;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_ingredients_check;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_preparation_check;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_description_len;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_ingredients_len;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_preparation_len;

alter table public.campaign_submissions
  add constraint campaign_submissions_description_len check (length(btrim(description)) <= 600),
  add constraint campaign_submissions_ingredients_len check (length(btrim(ingredients)) <= 3000),
  add constraint campaign_submissions_preparation_len check (length(btrim(preparation)) <= 6000);

alter table public.campaign_submissions alter column description set default '';
alter table public.campaign_submissions alter column ingredients set default '';
alter table public.campaign_submissions alter column preparation set default '';

create or replace function public.campaign_validate_recipe(p_fields jsonb, p_partial boolean)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  bad text[] := '{}';
  v text;
begin
  if not p_partial or p_fields ? 'dish_name' then
    v := btrim(coalesce(p_fields->>'dish_name', ''));
    if length(v) < 3 or length(v) > 120 then bad := array_append(bad, 'dish_name'); end if;
  end if;
  -- descrição, ingredientes e preparo: opcionais (vazio vale); só o limite máximo
  if not p_partial or p_fields ? 'description' then
    if length(btrim(coalesce(p_fields->>'description', ''))) > 600 then bad := array_append(bad, 'description'); end if;
  end if;
  if not p_partial or p_fields ? 'ingredients' then
    if length(btrim(coalesce(p_fields->>'ingredients', ''))) > 3000 then bad := array_append(bad, 'ingredients'); end if;
  end if;
  if not p_partial or p_fields ? 'preparation' then
    if length(btrim(coalesce(p_fields->>'preparation', ''))) > 6000 then bad := array_append(bad, 'preparation'); end if;
  end if;
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_FIELDS', array_to_string(bad, ','));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Sem trava no nível da campanha. A trava passa a ser por receita aprovada.
--    (nomes e colunas mantidos para não quebrar nada que ainda os chame)
-- ---------------------------------------------------------------------------
create or replace function public.campaign_is_locked(p_campaign uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$ select false $$;

create or replace function public.campaign_sync_lock(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- sem efeito: a campanha não trava mais quando a votação começa
  return;
end
$$;

-- Conteúdo da receita: congelado enquanto estiver APROVADA (salvo correção
-- administrativa auditada, que liga campaign.bypass_lock na própria transação).
create or replace function public.campaign_submissions_lock_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('campaign.bypass_lock', true), '') = 'on' then
    return new;
  end if;
  if (new.dish_name, new.description, new.ingredients, new.preparation)
       is distinct from (old.dish_name, old.description, old.ingredients, old.preparation) then
    if old.status = 'approved' then
      raise exception using errcode = 'P0001', message = 'EDIT_LOCKED';
    end if;
  end if;
  return new;
end
$$;

-- Mídia da receita: também congelada quando a receita está aprovada.
create or replace function public.campaign_media_lock_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare st text;
begin
  if coalesce(current_setting('campaign.bypass_lock', true), '') = 'on' then
    return new;
  end if;
  select status into st from public.campaign_submissions where id = new.submission_id;
  if st = 'approved' then
    raise exception using errcode = 'P0001', message = 'EDIT_LOCKED';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Ordem das etapas: inscrições e votação podem se sobrepor
-- ---------------------------------------------------------------------------
create or replace function public.campaign_check_stage_order(p_campaign uuid)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  vot public.campaign_stages;
  res public.campaign_stages;
begin
  select * into vot from public.campaign_stages where campaign_id = p_campaign and stage_key = 'voting';
  select * into res from public.campaign_stages where campaign_id = p_campaign and stage_key = 'results';
  if vot.ends_at is not null and res.starts_at is not null and vot.ends_at > res.starts_at then
    perform public.campaign_raise('INVALID_DATES', 'voting_after_results');
  end if;
end
$$;

create or replace function public.campaign_set_stage(
  p_actor jsonb, p_campaign uuid, p_stage text, p_starts timestamptz, p_ends timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  s public.campaign_stages;
  b jsonb;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  if p_stage not in ('registration', 'voting', 'results', 'announcement') then
    perform public.campaign_raise('INVALID_FIELDS', 'stage');
  end if;
  if p_starts is not null and p_ends is not null and p_ends <= p_starts then
    perform public.campaign_raise('INVALID_DATES', 'ends_before_starts');
  end if;

  select * into s from public.campaign_stages where campaign_id = p_campaign and stage_key = p_stage for update;
  b := to_jsonb(s);
  if p_stage = 'voting' then
    perform 1 from public.campaign_results where campaign_id = p_campaign and status in ('confirmed', 'announced');
    if found then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  end if;

  update public.campaign_stages
     set starts_at = p_starts, ends_at = p_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key = p_stage;
  perform public.campaign_check_stage_order(p_campaign);
  if p_stage = 'voting' then perform public.campaign_reset_preliminary(p_campaign); end if;

  perform public.campaign_audit(p_campaign, p_actor, 'SET_STAGE', 'stage', p_stage, b,
    jsonb_build_object('starts_at', p_starts, 'ends_at', p_ends), p_reason);
end
$$;

create or replace function public.campaign_extend_stage(
  p_actor jsonb, p_campaign uuid, p_stage text, p_new_ends timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  s public.campaign_stages;
  b jsonb;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into s from public.campaign_stages where campaign_id = p_campaign and stage_key = p_stage for update;
  if not found then perform public.campaign_raise('INVALID_FIELDS', 'stage'); end if;
  if s.ends_at is null or p_new_ends is null or p_new_ends <= s.ends_at then
    perform public.campaign_raise('INVALID_DATES', 'extend_must_be_later');
  end if;
  if p_stage = 'voting' then
    perform 1 from public.campaign_results where campaign_id = p_campaign and status in ('confirmed', 'announced');
    if found then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  end if;
  b := to_jsonb(s);
  update public.campaign_stages set ends_at = p_new_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key = p_stage;
  perform public.campaign_check_stage_order(p_campaign);
  if p_stage = 'voting' then perform public.campaign_reset_preliminary(p_campaign); end if;
  perform public.campaign_audit(p_campaign, p_actor, 'EXTEND_STAGE', 'stage', p_stage,
    jsonb_build_object('ends_at', s.ends_at), jsonb_build_object('ends_at', p_new_ends), p_reason);
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Período único: início + encerramento (uma ação, uma linha de auditoria)
--    Inscrições = [início, encerramento]; com votação, a votação usa a MESMA janela.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_set_period(
  p_actor jsonb, p_campaign uuid, p_starts timestamptz, p_ends timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  v boolean;
  b jsonb;
  a jsonb;
begin
  if p_starts is null or p_ends is null then
    perform public.campaign_raise('INVALID_DATES', 'missing');
  end if;
  if p_ends <= p_starts then
    perform public.campaign_raise('INVALID_DATES', 'ends_before_starts');
  end if;
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;

  v := public.campaign_feat(c.features, 'voting');
  select coalesce(jsonb_object_agg(stage_key, jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at)), '{}'::jsonb)
    into b from public.campaign_stages where campaign_id = p_campaign;

  update public.campaign_stages
     set starts_at = p_starts, ends_at = p_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key = 'registration';
  if v then
    update public.campaign_stages
       set starts_at = p_starts, ends_at = p_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key = 'voting';
  else
    update public.campaign_stages
       set starts_at = null, ends_at = null, paused = false, paused_at = null, paused_by = null,
           updated_by = (p_actor->>'id')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key = 'voting';
  end if;
  update public.campaign_stages
     set starts_at = null, ends_at = null, updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key in ('results', 'announcement');

  if v then perform public.campaign_reset_preliminary(p_campaign); end if;
  perform public.campaign_check_stage_order(p_campaign);

  select coalesce(jsonb_object_agg(stage_key, jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at)), '{}'::jsonb)
    into a from public.campaign_stages where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SET_PERIOD', 'stage', 'period', b, a, null);
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Checklist de publicação: datas coerentes; votação NÃO precisa vir depois das inscrições
-- ---------------------------------------------------------------------------
create or replace function public.campaign_publish_check(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  items jsonb := '[]'::jsonb;
  reg public.campaign_stages;
  vot public.campaign_stages;
  cnt integer;
  ok boolean := true;
  step boolean;
  msg text;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  select * into reg from public.campaign_stages where campaign_id = p_campaign and stage_key = 'registration';
  select * into vot from public.campaign_stages where campaign_id = p_campaign and stage_key = 'voting';

  step := length(btrim(c.name)) >= 3 and length(btrim(c.description)) >= 10;
  items := items || jsonb_build_array(jsonb_build_object('key', 'basics', 'ok', step,
    'message', case when step then 'Nome e descrição preenchidos' else 'Preencha o nome e uma descrição com pelo menos 10 caracteres' end));
  ok := ok and step;

  step := public.campaign_feat(c.features, 'submission');
  items := items || jsonb_build_array(jsonb_build_object('key', 'features', 'ok', step,
    'message', case when step then 'Formulário de participação habilitado' else 'Habilite o formulário de participação' end));
  ok := ok and step;

  begin
    perform public.campaign_validate_features(c.features);
    step := true; msg := 'Funcionalidades compatíveis entre si';
  exception when others then
    step := false; msg := 'Há funcionalidades que dependem de outras (ex.: votação exige aprovação)';
  end;
  items := items || jsonb_build_array(jsonb_build_object('key', 'dependencies', 'ok', step, 'message', msg));
  ok := ok and step;

  if public.campaign_feat(c.features, 'submission') then
    step := reg.starts_at is not null and reg.ends_at is not null and reg.ends_at > reg.starts_at;
    items := items || jsonb_build_array(jsonb_build_object('key', 'registration_dates', 'ok', step,
      'message', case when step then 'Período de participação definido'
                      else 'Defina a data de início e a de encerramento (o encerramento deve ser depois do início)' end));
    ok := ok and step;
  end if;

  if public.campaign_feat(c.features, 'voting') then
    step := vot.starts_at is not null and vot.ends_at is not null and vot.ends_at > vot.starts_at;
    items := items || jsonb_build_array(jsonb_build_object('key', 'voting_dates', 'ok', step,
      'message', case when step then 'Período da votação definido'
                      else 'Defina a data de início e a de encerramento da votação' end));
    ok := ok and step;
  end if;

  cnt := public.campaign_eligible_count(p_campaign);
  step := cnt >= 1;
  items := items || jsonb_build_array(jsonb_build_object('key', 'audience', 'ok', step,
    'message', case when step then cnt || ' colaboradores elegíveis' else 'Nenhum colaborador elegível para o público escolhido' end));
  ok := ok and step;

  return jsonb_build_object('ok', ok, 'items', items, 'eligible_count', cnt);
end
$$;

-- ---------------------------------------------------------------------------
-- 6) Receitas: envio, finalização, edição (sem trava de campanha; receita aprovada congela)
-- ---------------------------------------------------------------------------
create or replace function public.campaign_submit(
  p_campaign uuid, p_user uuid, p_user_name text, p_fields jsonb, p_media jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  st text;
  sid uuid;
  meta jsonb;
  existing uuid;
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

  if coalesce((c.media_limits->>'require_main_photo')::boolean, false) then
    for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
      if m->>'kind' = 'main_photo' then n_main := n_main + 1; end if;
    end loop;
    if n_main = 0 then perform public.campaign_raise('MAIN_PHOTO_REQUIRED'); end if;
  end if;

  select raw_user_meta_data into meta from auth.users where id = p_user;
  begin
    insert into public.campaign_submissions
      (campaign_id, user_id, user_name, user_unit, user_department, dish_name, description, ingredients, preparation, status,
       submitted_at, finalized_at)
    values
      (p_campaign, p_user, coalesce(nullif(btrim(p_user_name), ''), 'Colaborador'),
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
    select id into existing from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user;
    perform public.campaign_raise('ALREADY_SUBMITTED', existing::text);
  end;

  uploads := public.campaign_add_media_intents(p_campaign, sid, p_media);
  perform public.campaign_audit(p_campaign, actor, 'SUBMIT_RECIPE', 'submission', sid::text, null,
    jsonb_build_object('dish_name', btrim(p_fields->>'dish_name'), 'media', jsonb_array_length(uploads)), null);
  return jsonb_build_object('submission_id', sid,
    'status', case when jsonb_array_length(uploads) = 0 then 'submitted' else 'pending_media' end,
    'uploads', uploads);
end
$$;

create or replace function public.campaign_finalize_submission(
  p_campaign uuid, p_user uuid, p_submission uuid, p_verified jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

create or replace function public.campaign_update_submission(
  p_campaign uuid, p_user uuid, p_submission uuid, p_fields jsonb, p_media_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

create or replace function public.campaign_admin_edit_submission(
  p_actor jsonb, p_campaign uuid, p_submission uuid, p_fields jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.campaign_submissions;
  before jsonb;
  after_row public.campaign_submissions;
begin
  if length(btrim(coalesce(p_reason, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  perform public.campaign_validate_recipe(coalesce(p_fields, '{}'::jsonb), true);
  before := jsonb_build_object('dish_name', s.dish_name, 'description', s.description,
                               'ingredients', s.ingredients, 'preparation', s.preparation);
  perform set_config('campaign.bypass_lock', 'on', true);
  update public.campaign_submissions set
    dish_name = case when p_fields ? 'dish_name' then btrim(p_fields->>'dish_name') else dish_name end,
    description = case when p_fields ? 'description' then coalesce(btrim(p_fields->>'description'), '') else description end,
    ingredients = case when p_fields ? 'ingredients' then coalesce(btrim(p_fields->>'ingredients'), '') else ingredients end,
    preparation = case when p_fields ? 'preparation' then coalesce(btrim(p_fields->>'preparation'), '') else preparation end,
    content_version = content_version + 1, updated_at = now()
  where id = p_submission;
  perform set_config('campaign.bypass_lock', 'off', true);
  select * into after_row from public.campaign_submissions where id = p_submission;
  perform public.campaign_audit(p_campaign, p_actor, 'ADMIN_EDIT_SUBMISSION', 'submission', p_submission::text, before,
    jsonb_build_object('dish_name', after_row.dish_name, 'description', after_row.description,
                       'ingredients', after_row.ingredients, 'preparation', after_row.preparation), p_reason);
end
$$;

-- Aprovar/reprovar: continua possível durante a votação (janela concorrente); só deixa de
-- valer depois que a votação encerra ou o resultado é confirmado (o resultado não pode mudar).
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

-- ---------------------------------------------------------------------------
-- 7) Leitura para o colaborador
-- ---------------------------------------------------------------------------
create or replace function public.campaign_gallery_visible(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; mode text;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_feat(c.features, 'gallery') then return false; end if;
  mode := coalesce(c.visibility->>'gallery_visibility', 'on_approval');
  if mode = 'on_approval' then return true;
  elsif mode = 'on_voting_start' then
    return public.campaign_stage_state(p_campaign, 'voting') in ('open', 'paused', 'closed');
  else return public.campaign_results_visible(p_campaign);
  end if;
end
$$;

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
  can_submit boolean;
  can_edit boolean;
  can_vote boolean;
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
  select * into s from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user;
  select * into v from public.campaign_votes where campaign_id = p_campaign and voter_id = p_user;
  reg := public.campaign_stage_state(p_campaign, 'registration');
  vot := public.campaign_stage_state(p_campaign, 'voting');
  -- "travada" agora é a MINHA receita aprovada (congelada); a campanha não trava mais
  locked := coalesce(s.id is not null and s.status = 'approved', false);
  res_vis := public.campaign_results_visible(p_campaign);

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

  can_submit := coalesce(released and public.campaign_feat(c.features, 'submission') and s.id is null
                and reg = 'open' and c.status = 'authorized', false);
  can_edit := coalesce(released and s.id is not null and s.status <> 'approved'
                and reg = 'open' and c.status = 'authorized', false);
  can_vote := coalesce(released and public.campaign_feat(c.features, 'voting') and vot = 'open'
              and v.id is null and c.status = 'authorized', false);

  return jsonb_build_object(
    'visible', true, 'released', released, 'eligible', true, 'stage', stage,
    'registration', reg, 'voting', vot, 'locked', locked,
    'can_submit', can_submit, 'can_edit', can_edit, 'can_vote', can_vote,
    'my_submission_id', s.id, 'my_submission_status', s.status,
    'has_voted', v.id is not null and v.invalidated_at is null,
    'voted_at', v.created_at, 'voted_submission_id', v.submission_id,
    'gallery_visible', released and public.campaign_gallery_visible(p_campaign),
    'ranking_visible', released and public.campaign_ranking_visible(p_campaign),
    'results_visible', res_vis,
    'tour', coalesce(c.features->'tour', '{"enabled":false,"version":1}'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 8) Privilégios (mesma regra da migração 5, vale também para funções novas)
-- ---------------------------------------------------------------------------
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
