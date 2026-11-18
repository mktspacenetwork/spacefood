-- =============================================================================
-- Gerenciador de Campanhas — 8: várias receitas por pessoa, períodos separados,
--                              divulgação agendada do resultado e histórico de tours
--
-- Objetivo : (a) opção "permitir mais de uma receita por colaborador"
--            (features.multiple_submissions, até 10), aplicada no banco;
--            (b) com votação, o período de participação e o da votação podem ser
--            DIFERENTES (campaign_set_periods); (c) divulgação do resultado imediata
--            ou AGENDADA (data + hora), com notificações feitas no próprio banco, uma
--            única vez, e execução automática por pg_cron (+ fallback pela API);
--            (d) histórico de tours vistos guardado por usuário (servidor).
-- Impacto  : SOMENTE objetos campaign_*. Aditiva e idempotente. Nenhum dado é apagado
--            ou duplicado: as receitas atuais ficam no slot 1; a restrição "1 receita
--            por pessoa" passa a ser "1 por pessoa e por slot" e a regra de "uma só" fica
--            na função campaign_submit quando a opção está desligada (padrão).
--            Mudanças de comportamento (sempre relaxando ou endurecendo só o que é novo):
--             - descrição da receita ("História e memória afetiva") aceita até 2000 caracteres;
--             - campanha publicada com receitas: ligar/desligar "várias receitas" é permitido, e
--               campos de funcionalidades/limites de mídia só são recusados se de fato mudarem;
--             - ranking no modo padrão (hidden_until_confirmed) só aparece depois da DIVULGAÇÃO
--               (antes aparecia ao confirmar, o que revelaria o vencedor antes da hora agendada);
--             - "Encerrar votação agora" só encerra as inscrições junto se elas acabariam
--               antes ou junto com a votação; pausar a votação depois do resultado confirmado
--               passa a ser recusado (RESULTS_CONFIRMED).
-- Rollback : reaplicar as definições das migrações 3, 6 e 7 (funções), remover
--            campaign_results.announce_* e campaign_tour_seen, e (se não houver mais de uma
--            receita por pessoa) recriar a restrição unique (campaign_id, user_id).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Receitas: slot por pessoa (várias receitas) e descrição maior
-- ---------------------------------------------------------------------------
alter table public.campaign_submissions add column if not exists slot smallint not null default 1;

alter table public.campaign_submissions drop constraint if exists campaign_submissions_slot_range;
alter table public.campaign_submissions
  add constraint campaign_submissions_slot_range check (slot between 1 and 10);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_submissions_one_per_slot'
                  and conrelid = 'public.campaign_submissions'::regclass) then
    alter table public.campaign_submissions
      add constraint campaign_submissions_one_per_slot unique (campaign_id, user_id, slot);
  end if;
end
$$;
-- a restrição antiga (1 por pessoa) sai só depois da nova existir; os dados não mudam
alter table public.campaign_submissions drop constraint if exists campaign_submissions_one_per_user;

-- "História e memória afetiva": até 2000 caracteres (continua opcional)
alter table public.campaign_submissions drop constraint if exists campaign_submissions_description_len;
alter table public.campaign_submissions
  add constraint campaign_submissions_description_len check (length(btrim(description)) <= 2000);

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
  -- descrição (história), ingredientes e preparo: opcionais; só o limite máximo
  if not p_partial or p_fields ? 'description' then
    if length(btrim(coalesce(p_fields->>'description', ''))) > 2000 then bad := array_append(bad, 'description'); end if;
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

-- "várias receitas" só faz sentido com o formulário de participação ligado
create or replace function public.campaign_validate_features(f jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  bad text[] := '{}';
begin
  if public.campaign_feat(f, 'approval')  and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'approval'); end if;
  if public.campaign_feat(f, 'photos')    and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'photos'); end if;
  if public.campaign_feat(f, 'video')     and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'video'); end if;
  if public.campaign_feat(f, 'gallery')   and not public.campaign_feat(f, 'approval')   then bad := array_append(bad, 'gallery'); end if;
  if public.campaign_feat(f, 'voting')    and not public.campaign_feat(f, 'approval')   then bad := array_append(bad, 'voting'); end if;
  if public.campaign_feat(f, 'ranking')   and not public.campaign_feat(f, 'voting')     then bad := array_append(bad, 'ranking'); end if;
  if public.campaign_feat(f, 'results')   and not public.campaign_feat(f, 'voting')     then bad := array_append(bad, 'results'); end if;
  if public.campaign_feat(f, 'announcement') and not public.campaign_feat(f, 'results') then bad := array_append(bad, 'announcement'); end if;
  if public.campaign_feat(f, 'multiple_submissions') and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'multiple_submissions'); end if;
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_CONFIG', array_to_string(bad, ','));
  end if;
end
$$;

-- Envio: 1 receita (padrão) ou várias (até 10), com trava por (campanha, pessoa)
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

  if coalesce((c.media_limits->>'require_main_photo')::boolean, false) then
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
$$;

-- Atualizar campanha: "várias receitas" pode ser ligado/desligado a qualquer momento (mesmo publicada
-- e com receitas); funcionalidades/limites de mídia só são recusados se de fato MUDAREM.
create or replace function public.campaign_update(p_actor jsonb, p_campaign uuid, p_fields jsonb, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  before jsonb;
  n integer;
  after_row public.campaigns;
  feats jsonb;
  changed boolean := false;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if p_expected_version is not null and c.version <> p_expected_version then
    perform public.campaign_raise('VERSION_CONFLICT');
  end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  before := to_jsonb(c);

  if c.status in ('draft', 'in_review') then
    if p_fields ? 'name' then
      if length(btrim(coalesce(p_fields->>'name', ''))) not between 3 and 120 then
        perform public.campaign_raise('INVALID_FIELDS', 'name');
      end if;
      update public.campaigns set name = btrim(p_fields->>'name') where id = p_campaign;
    end if;
  else
    -- publicada: não muda funcionalidades/limites se já há receitas (tour e "várias receitas" ficam de fora)
    if jsonb_typeof(p_fields->'media_limits') = 'object'
       and (c.media_limits || (p_fields->'media_limits')) is distinct from c.media_limits then
      changed := true;
    end if;
    if jsonb_typeof(p_fields->'features') = 'object' then
      feats := (p_fields->'features') - 'tour' - 'multiple_submissions';
      if exists (select 1 from jsonb_each(feats) e where c.features->e.key is distinct from e.value) then
        changed := true;
      end if;
    end if;
    if changed then
      select count(*) into n from public.campaign_submissions where campaign_id = p_campaign;
      if n > 0 then perform public.campaign_raise('CAMPAIGN_HAS_RECORDS'); end if;
    end if;
  end if;

  perform public.campaign_apply_config(p_campaign, p_fields);
  update public.campaigns
     set updated_by = (p_actor->>'id')::uuid, version = version + 1
   where id = p_campaign;

  select * into after_row from public.campaigns where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'UPDATE_CAMPAIGN', 'campaign', p_campaign::text, before, to_jsonb(after_row), null);
end
$$;

-- Estado do colaborador: agora com contagem/limite de receitas
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
  -- "travada" = tem receita(s) e TODAS estão aprovadas (congeladas); a campanha não trava mais
  locked := n_sub > 0 and n_editable = 0;
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
    'ranking_visible', released and public.campaign_ranking_visible(p_campaign),
    'results_visible', res_vis,
    'tour', coalesce(c.features->'tour', '{"enabled":false,"version":1}'::jsonb));
end
$$;

-- Participantes: uma linha por (pessoa, receita), ordem estável (nome, pessoa, slot).
-- A assinatura de retorno cresce (prato e slot), por isso a função é recriada.
drop function if exists public.campaign_participants(uuid, boolean);
create function public.campaign_participants(p_campaign uuid, p_with_votes boolean)
returns table (
  user_id uuid, user_name text, department text, unit text,
  submission_id uuid, submission_status text, submitted_at timestamptz,
  voted boolean, voted_at timestamptz, dish_name text, slot smallint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select u.id,
         coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         coalesce(u.raw_user_meta_data->>'department', ''),
         coalesce(u.raw_user_meta_data->>'lunch_location', ''),
         s.id, s.status, s.submitted_at,
         case when p_with_votes then (v.id is not null and v.invalidated_at is null) else null end,
         case when p_with_votes then v.created_at else null end,
         s.dish_name, s.slot
    from auth.users u
    left join public.campaign_submissions s on s.campaign_id = p_campaign and s.user_id = u.id
    left join public.campaign_votes v on v.campaign_id = p_campaign and v.voter_id = u.id
   where public.campaign_user_eligible(p_campaign, u.id) or s.id is not null or v.id is not null
   order by 2, 1, 11
$$;

-- ---------------------------------------------------------------------------
-- 2) Períodos separados (participação x votação)
-- ---------------------------------------------------------------------------
create or replace function public.campaign_set_periods(
  p_actor jsonb, p_campaign uuid,
  p_reg_starts timestamptz, p_reg_ends timestamptz,
  p_vot_starts timestamptz, p_vot_ends timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  v boolean;
  v_starts timestamptz;
  v_ends timestamptz;
  b jsonb;
  a jsonb;
begin
  if p_reg_starts is null or p_reg_ends is null then
    perform public.campaign_raise('INVALID_DATES', 'missing');
  end if;
  if p_reg_ends <= p_reg_starts then
    perform public.campaign_raise('INVALID_DATES', 'ends_before_starts');
  end if;
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;

  v := public.campaign_feat(c.features, 'voting');
  if v then
    -- sem datas próprias, a votação usa a mesma janela da participação (compatível com o período único)
    if p_vot_starts is null and p_vot_ends is null then
      v_starts := p_reg_starts; v_ends := p_reg_ends;
    elsif p_vot_starts is null or p_vot_ends is null then
      perform public.campaign_raise('INVALID_DATES', 'voting_missing');
    else
      v_starts := p_vot_starts; v_ends := p_vot_ends;
    end if;
    if v_ends <= v_starts then perform public.campaign_raise('INVALID_DATES', 'voting_ends_before_starts'); end if;
    if v_starts < p_reg_starts then perform public.campaign_raise('INVALID_DATES', 'voting_before_registration'); end if;
    if v_ends < p_reg_ends then perform public.campaign_raise('INVALID_DATES', 'voting_ends_before_registration'); end if;
  end if;

  select coalesce(jsonb_object_agg(stage_key, jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at)), '{}'::jsonb)
    into b from public.campaign_stages where campaign_id = p_campaign;

  update public.campaign_stages
     set starts_at = p_reg_starts, ends_at = p_reg_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key = 'registration';
  if v then
    update public.campaign_stages
       set starts_at = v_starts, ends_at = v_ends, updated_by = (p_actor->>'id')::uuid, updated_at = now()
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

-- Período único (compatibilidade): a votação usa a mesma janela das inscrições.
create or replace function public.campaign_set_period(
  p_actor jsonb, p_campaign uuid, p_starts timestamptz, p_ends timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.campaign_set_periods(p_actor, p_campaign, p_starts, p_ends, p_starts, p_ends);
end
$$;

-- Checklist de publicação: + coerência entre a janela da votação e a da participação
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

    -- participação e votação podem se sobrepor, mas a votação não começa antes nem termina antes da participação
    step := reg.starts_at is null or reg.ends_at is null or vot.starts_at is null or vot.ends_at is null
            or (vot.starts_at >= reg.starts_at and vot.ends_at >= reg.ends_at);
    items := items || jsonb_build_array(jsonb_build_object('key', 'voting_order', 'ok', step,
      'message', case when step then 'Período da votação coerente com o da participação'
                      else 'A votação não pode começar antes da participação nem terminar antes dela' end));
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

-- "Encerrar votação agora": as inscrições só acabam junto se ainda estiverem abertas E fossem
-- terminar antes ou junto com a votação (com períodos separados, não se mexe nelas fora disso).
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
  close_reg boolean;
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
    close_reg := reg.starts_at is not null and reg.starts_at < now()
                 and (reg.ends_at is null or reg.ends_at > now())
                 and (reg.ends_at is null or (vot.ends_at is not null and reg.ends_at <= vot.ends_at));
    update public.campaign_stages set ends_at = now(), paused = false, paused_at = null, paused_by = null,
           updated_by = (p_actor->>'id')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key = 'voting';
    if close_reg then
      update public.campaign_stages set ends_at = now(), paused = false, paused_at = null, paused_by = null,
             updated_by = (p_actor->>'id')::uuid, updated_at = now()
       where campaign_id = p_campaign and stage_key = 'registration';
    end if;
    perform public.campaign_audit(p_campaign, p_actor, 'END_VOTING_NOW', 'stage', 'voting',
      jsonb_build_object('ends_at', vot.ends_at, 'registration_ends_at', reg.ends_at),
      jsonb_build_object('ends_at', now(), 'registration_ends_at', case when close_reg then now() else reg.ends_at end), null);
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

-- Depois de confirmado o vencedor, a votação não pode mais ser pausada/retomada (o resultado não muda)
create or replace function public.campaign_pause_stage(
  p_actor jsonb, p_campaign uuid, p_stage text, p_pause boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; s public.campaign_stages;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into s from public.campaign_stages where campaign_id = p_campaign and stage_key = p_stage for update;
  if not found then perform public.campaign_raise('INVALID_FIELDS', 'stage'); end if;
  if s.paused = p_pause then return; end if;
  if p_stage = 'voting' then
    perform 1 from public.campaign_results where campaign_id = p_campaign and status in ('confirmed', 'announced');
    if found then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  end if;
  -- pausar/reabrir NUNCA apaga votos nem libera a edição das receitas
  update public.campaign_stages
     set paused = p_pause, paused_at = case when p_pause then now() else null end,
         paused_by = case when p_pause then (p_actor->>'id')::uuid else null end,
         updated_by = (p_actor->>'id')::uuid, updated_at = now()
   where campaign_id = p_campaign and stage_key = p_stage;
  perform public.campaign_audit(p_campaign, p_actor, case when p_pause then 'PAUSE_STAGE' else 'REOPEN_STAGE' end,
    'stage', p_stage, jsonb_build_object('paused', s.paused), jsonb_build_object('paused', p_pause), p_reason);
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Divulgação do resultado: imediata ou agendada (tudo no banco, idempotente)
-- ---------------------------------------------------------------------------
alter table public.campaign_results add column if not exists announce_at timestamptz;
alter table public.campaign_results add column if not exists announce_scheduled_by uuid;
alter table public.campaign_results add column if not exists announce_scheduled_by_name text;
alter table public.campaign_results add column if not exists announce_scheduled_at timestamptz;

-- Ranking: no modo padrão (hidden_until_confirmed) só depois da DIVULGAÇÃO. Antes ele aparecia ao
-- confirmar o vencedor, o que revelaria o resultado antes da hora quando a divulgação é agendada.
create or replace function public.campaign_ranking_visible(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; r public.campaign_results; mode text; vs text;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_feat(c.features, 'ranking') then return false; end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  mode := coalesce(c.visibility->>'ranking_mode', 'hidden_until_confirmed');
  vs := public.campaign_stage_state(p_campaign, 'voting');
  if mode = 'live' then return vs in ('open', 'paused', 'closed');
  elsif mode = 'after_close' then return vs = 'closed' or coalesce(r.status, 'none') <> 'none';
  else return coalesce(r.status, 'none') = 'announced';
  end if;
end
$$;

-- Notificações da divulgação (dentro da mesma transação da divulgação).
-- Vencedor: you_won. Participantes (enviaram receita OU votaram, voto válido): results_announced.
-- Quem só era elegível e não participou de nada NÃO recebe. 1 por pessoa (log único).
create or replace function public.campaign_announce_notify(p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  w public.campaign_submissions;
  u record;
  has_kv boolean;
  v_event text;
  v_title text;
  v_msg text;
  v_claim integer;
  n_win integer := 0;
  n_part integer := 0;
  n_err integer := 0;
begin
  select * into c from public.campaigns where id = p_campaign;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  select * into w from public.campaign_submissions where id = r.winner_submission_id;
  has_kv := to_regprocedure('public.kv_append_to_array(text,jsonb)') is not null;

  for u in
    select x.user_id from (
      select s.user_id from public.campaign_submissions s where s.campaign_id = p_campaign and s.status <> 'pending_media'
      union
      select v.voter_id from public.campaign_votes v where v.campaign_id = p_campaign and v.invalidated_at is null
      union
      select w.user_id where w.user_id is not null
    ) x
    where exists (select 1 from auth.users au where au.id = x.user_id)
  loop
    if w.user_id is not null and u.user_id = w.user_id then
      v_event := 'you_won';
      v_title := 'Sua receita venceu!';
      v_msg := 'Parabéns! ' || w.dish_name || ' foi a receita vencedora da campanha ' || c.name || '.';
    else
      v_event := 'results_announced';
      v_title := 'Resultado divulgado';
      v_msg := 'O resultado da campanha ' || c.name || ' já está disponível em Campanhas.';
    end if;

    insert into public.campaign_notification_log (campaign_id, user_id, event_key, entity_id)
    values (p_campaign, u.user_id, v_event, '')
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
         where campaign_id = p_campaign and user_id = u.user_id and event_key = v_event and entity_id = '';
        if v_event = 'you_won' then n_win := n_win + 1; else n_part := n_part + 1; end if;
      exception when others then
        n_err := n_err + 1;
        update public.campaign_notification_log set inbox_ok = false, push_ok = false, error = left(sqlerrm, 300)
         where campaign_id = p_campaign and user_id = u.user_id and event_key = v_event and entity_id = '';
      end;
    end if;
  end loop;
  return jsonb_build_object('winner', n_win, 'participants', n_part, 'errors', n_err);
end
$$;

-- Divulgar AGORA. Só vale uma vez (ALREADY_ANNOUNCED depois); limpa qualquer agendamento.
create or replace function public.campaign_announce(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.campaign_results;
  s public.campaign_submissions;
  n jsonb;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('NOT_CONFIRMED'); end if;
  if r.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if r.status <> 'confirmed' then perform public.campaign_raise('NOT_CONFIRMED'); end if;

  update public.campaign_results
     set status = 'announced', announced_by = nullif(p_actor->>'id', '')::uuid, announced_at = now(),
         announce_at = null, announce_scheduled_by = null, announce_scheduled_by_name = null, announce_scheduled_at = null
   where campaign_id = p_campaign;
  select * into s from public.campaign_submissions where id = r.winner_submission_id;
  perform public.campaign_audit(p_campaign, p_actor, 'ANNOUNCE_RESULTS', 'results', p_campaign::text,
    jsonb_build_object('announce_at', r.announce_at),
    jsonb_build_object('winner_submission_id', r.winner_submission_id,
                       'via', case when coalesce(p_actor->>'role', '') = 'system' then 'schedule' else 'manual' end), null);
  n := public.campaign_announce_notify(p_campaign);
  return jsonb_build_object('winner_submission_id', r.winner_submission_id, 'winner_user_id', s.user_id,
                            'dish_name', s.dish_name, 'notified', n);
end
$$;

-- Agendar a divulgação (data + hora). O último agendamento substitui o anterior.
create or replace function public.campaign_schedule_announcement(p_actor jsonb, p_campaign uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.campaign_results;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('RESULTS_NOT_CONFIRMED'); end if;
  if r.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if r.status <> 'confirmed' then perform public.campaign_raise('RESULTS_NOT_CONFIRMED'); end if;
  if p_at is null or p_at < now() + interval '30 seconds' then perform public.campaign_raise('ANNOUNCE_IN_PAST'); end if;
  update public.campaign_results
     set announce_at = p_at, announce_scheduled_by = nullif(p_actor->>'id', '')::uuid,
         announce_scheduled_by_name = coalesce(p_actor->>'name', ''), announce_scheduled_at = now()
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SCHEDULE_ANNOUNCEMENT', 'results', p_campaign::text,
    jsonb_build_object('announce_at', r.announce_at), jsonb_build_object('announce_at', p_at), null);
  return jsonb_build_object('announce_at', p_at);
end
$$;

-- Cancelar o agendamento (idempotente: sem agendamento, não faz nada).
create or replace function public.campaign_cancel_announcement(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.campaign_results;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found then return jsonb_build_object('cancelled', false); end if;
  if r.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if r.announce_at is null then return jsonb_build_object('cancelled', false); end if;
  update public.campaign_results
     set announce_at = null, announce_scheduled_by = null, announce_scheduled_by_name = null, announce_scheduled_at = null
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'CANCEL_ANNOUNCEMENT', 'results', p_campaign::text,
    jsonb_build_object('announce_at', r.announce_at), jsonb_build_object('announce_at', null), null);
  return jsonb_build_object('cancelled', true);
end
$$;

-- Executor das divulgações vencidas (pg_cron a cada minuto; a API chama também, por garantia).
-- Nunca antes da hora, nunca duas vezes: `for update skip locked` + ALREADY_ANNOUNCED + log único.
create or replace function public.campaign_run_due_announcements()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rec record;
  n integer := 0;
  sys jsonb := jsonb_build_object('name', 'Agendamento automático', 'role', 'system');
begin
  for rec in
    select r.campaign_id
      from public.campaign_results r
     where r.status = 'confirmed' and r.announce_at is not null and r.announce_at <= now()
       and public.campaign_is_released(r.campaign_id)
     order by r.announce_at
       for update of r skip locked
  loop
    begin
      perform public.campaign_announce(sys, rec.campaign_id);
      n := n + 1;
    exception when others then
      -- ALREADY_ANNOUNCED (outra execução chegou antes) ou erro pontual: tenta de novo no próximo minuto
      raise warning 'campaign_run_due_announcements(%): %', rec.campaign_id, sqlerrm;
    end;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Histórico de tours vistos (por usuário, no servidor)
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_tour_seen (
  user_id  uuid not null,
  tour_key text not null,
  seen_at  timestamptz not null default now(),
  primary key (user_id, tour_key),
  constraint campaign_tour_seen_key_fmt check (tour_key ~ '^[A-Za-z0-9_.:-]{1,200}$')
);
alter table public.campaign_tour_seen enable row level security;
revoke all on table public.campaign_tour_seen from anon, authenticated, service_role;
grant select on table public.campaign_tour_seen to service_role;

create or replace function public.campaign_tours_seen(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(t.tour_key order by t.tour_key), '{}'::text[])
    from public.campaign_tour_seen t where t.user_id = p_user
$$;

create or replace function public.campaign_tour_mark(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  if p_user is null or p_key is null or p_key !~ '^[A-Za-z0-9_.:-]{1,200}$' then
    perform public.campaign_raise('INVALID_FIELDS', 'key');
  end if;
  perform 1 from public.campaign_tour_seen where user_id = p_user and tour_key = p_key;
  if found then return; end if;
  select count(*) into n from public.campaign_tour_seen where user_id = p_user;
  if n >= 500 then perform public.campaign_raise('TOUR_LIMIT'); end if;
  insert into public.campaign_tour_seen (user_id, tour_key) values (p_user, p_key)
  on conflict (user_id, tour_key) do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Agendador (pg_cron) — só se a extensão existir; o fallback na API cobre a ausência
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise notice 'campanhas: pg_cron indisponível (%). A API executa as divulgações vencidas como alternativa.', sqlerrm;
    end;
  end if;
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    begin
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'campaign-run-due-announcements'$q$;
      execute $q$select cron.schedule('campaign-run-due-announcements', '* * * * *', 'select public.campaign_run_due_announcements()')$q$;
    exception when others then
      raise notice 'campanhas: não foi possível agendar o job (%). A API executa as divulgações vencidas como alternativa.', sqlerrm;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6) Privilégios (mesma regra das migrações 5/6/7)
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
