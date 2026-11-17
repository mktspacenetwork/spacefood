-- =============================================================================
-- Gerenciador de Campanhas — 3/5: funções transacionais (toda mutação passa por aqui)
--
-- Objetivo : concentrar as regras de negócio no banco. Cada função valida tudo,
--            grava a auditoria na MESMA transação e usa códigos de erro estáveis
--            (P0001, mensagem = CÓDIGO) que a API traduz para mensagens em PT-BR.
-- Impacto  : somente objetos novos (campaign_*). SECURITY DEFINER; EXECUTE só
--            para service_role (migração 5/5).
-- =============================================================================

create or replace function public.campaign_raise(p_code text, p_detail text default null)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if p_detail is null then
    raise exception using errcode = 'P0001', message = p_code;
  end if;
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail;
end
$$;

create or replace function public.campaign_feat(f jsonb, k text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$ select coalesce((f->>k)::boolean, false) $$;

-- ---------------------------------------------------------------------------
-- Validações
-- ---------------------------------------------------------------------------
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
  if not p_partial or p_fields ? 'description' then
    v := btrim(coalesce(p_fields->>'description', ''));
    if length(v) < 10 or length(v) > 600 then bad := array_append(bad, 'description'); end if;
  end if;
  if not p_partial or p_fields ? 'ingredients' then
    v := btrim(coalesce(p_fields->>'ingredients', ''));
    if length(v) < 5 or length(v) > 3000 then bad := array_append(bad, 'ingredients'); end if;
  end if;
  if not p_partial or p_fields ? 'preparation' then
    v := btrim(coalesce(p_fields->>'preparation', ''));
    if length(v) < 10 or length(v) > 6000 then bad := array_append(bad, 'preparation'); end if;
  end if;
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_FIELDS', array_to_string(bad, ','));
  end if;
end
$$;

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
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_CONFIG', array_to_string(bad, ','));
  end if;
end
$$;

-- Aplica campos de configuração (descrição, público, funcionalidades, etc.) já validados.
create or replace function public.campaign_apply_config(p_campaign uuid, p_fields jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  f jsonb;
  v jsonb;
  m jsonb;
  a jsonb;
  tour jsonb;
  mode text;
begin
  select * into c from public.campaigns where id = p_campaign;

  -- funcionalidades (com mesclagem do objeto tour)
  f := c.features || coalesce(p_fields->'features', '{}'::jsonb);
  if p_fields->'features' ? 'tour' then
    tour := coalesce(c.features->'tour', '{}'::jsonb) || coalesce(p_fields->'features'->'tour', '{}'::jsonb);
    f := jsonb_set(f, '{tour}', tour);
  end if;
  perform public.campaign_validate_features(f);

  -- visibilidade
  v := c.visibility || coalesce(p_fields->'visibility', '{}'::jsonb);
  if (v->>'ranking_mode') not in ('hidden_until_confirmed', 'after_close', 'live') then
    perform public.campaign_raise('INVALID_CONFIG', 'ranking_mode');
  end if;
  if (v->>'gallery_visibility') not in ('on_approval', 'on_voting_start', 'on_results') then
    perform public.campaign_raise('INVALID_CONFIG', 'gallery_visibility');
  end if;

  -- limites de mídia
  m := c.media_limits || coalesce(p_fields->'media_limits', '{}'::jsonb);
  if (m->>'max_photos')::int not between 0 and 6
     or (m->>'max_photo_mb')::int not between 1 and 5
     or (m->>'max_video_mb')::int not between 1 and 50 then
    perform public.campaign_raise('INVALID_CONFIG', 'media_limits');
  end if;

  -- público
  a := coalesce(p_fields->'audience', c.audience);
  mode := coalesce(a->>'mode', 'all');
  if mode not in ('all', 'units', 'departments', 'users') then
    perform public.campaign_raise('INVALID_CONFIG', 'audience');
  end if;

  update public.campaigns set
    description  = case when p_fields ? 'description'  then coalesce(p_fields->>'description', '')  else description  end,
    objective    = case when p_fields ? 'objective'    then coalesce(p_fields->>'objective', '')    else objective    end,
    instructions = case when p_fields ? 'instructions' then coalesce(p_fields->>'instructions', '') else instructions end,
    cover_path   = case when p_fields ? 'cover_path'   then nullif(p_fields->>'cover_path', '')     else cover_path   end,
    features     = f,
    visibility   = v,
    media_limits = m,
    audience     = a,
    updated_at   = now()
  where id = p_campaign;
end
$$;

-- ---------------------------------------------------------------------------
-- Campanha: criar / atualizar / ciclo de vida
-- ---------------------------------------------------------------------------
create or replace function public.campaign_create(p_actor jsonb, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_slug text;
  v_name text;
  c public.campaigns;
begin
  v_name := btrim(coalesce(p_fields->>'name', ''));
  v_slug := lower(btrim(coalesce(p_fields->>'slug', '')));
  if length(v_name) < 3 or length(v_name) > 120 then
    perform public.campaign_raise('INVALID_FIELDS', 'name');
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60 then
    perform public.campaign_raise('INVALID_FIELDS', 'slug');
  end if;

  insert into public.campaigns (slug, type, name, created_by, created_by_name, updated_by)
  values (v_slug, coalesce(p_fields->>'type', 'recipe_contest'), v_name,
          (p_actor->>'id')::uuid, coalesce(p_actor->>'name', ''), (p_actor->>'id')::uuid)
  returning id into v_id;

  perform public.campaign_apply_config(v_id, p_fields);

  insert into public.campaign_stages (campaign_id, stage_key)
    select v_id, k from unnest(array['registration', 'voting', 'results', 'announcement']) as k;
  insert into public.campaign_results (campaign_id) values (v_id);

  select * into c from public.campaigns where id = v_id;
  perform public.campaign_audit(v_id, p_actor, 'CREATE_CAMPAIGN', 'campaign', v_id::text, null, to_jsonb(c), null);
  return v_id;
exception when unique_violation then
  perform public.campaign_raise('SLUG_TAKEN');
  return null;
end
$$;

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
    -- publicada: não muda funcionalidades/limites se já há receitas
    if (p_fields ? 'media_limits')
       or ((p_fields ? 'features') and ((p_fields->'features') - 'tour') <> '{}'::jsonb) then
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

create or replace function public.campaign_submit_for_review(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status <> 'draft' then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  update public.campaigns set status = 'in_review', updated_by = (p_actor->>'id')::uuid, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SUBMIT_FOR_REVIEW', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status), jsonb_build_object('status', 'in_review'), null);
end
$$;

-- Checklist de prontidão para publicar
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
      'message', case when step then 'Período de inscrições definido' else 'Defina início e fim das inscrições (o fim deve ser depois do início)' end));
    ok := ok and step;
  end if;

  if public.campaign_feat(c.features, 'voting') then
    step := vot.starts_at is not null and vot.ends_at is not null and vot.ends_at > vot.starts_at
            and (reg.ends_at is null or reg.ends_at <= vot.starts_at);
    items := items || jsonb_build_array(jsonb_build_object('key', 'voting_dates', 'ok', step,
      'message', case when step then 'Período de votação definido, depois das inscrições'
                      else 'Defina a votação (fim depois do início) começando depois do fim das inscrições' end));
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

create or replace function public.campaign_publish(p_actor jsonb, p_campaign uuid, p_opts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  chk jsonb;
  vf timestamptz;
  module_was boolean;
  tour jsonb;
  v jsonb;
  f jsonb;
  after_row public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status = 'authorized' then perform public.campaign_raise('ALREADY_PUBLISHED'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;

  chk := public.campaign_publish_check(p_campaign);
  if not (chk->>'ok')::boolean then
    perform public.campaign_raise('PUBLISH_CHECK_FAILED', chk::text);
  end if;

  vf := nullif(p_opts->>'visible_from', '')::timestamptz;
  if vf is null or vf < now() then vf := now(); end if;

  v := c.visibility || jsonb_build_object('allow_preview', coalesce((p_opts->>'allow_preview')::boolean, false));
  tour := coalesce(c.features->'tour', '{"enabled":true,"version":1}'::jsonb);
  tour := jsonb_set(tour, '{enabled}', to_jsonb(coalesce((p_opts->>'tour_enabled')::boolean, true)));
  if coalesce((p_opts->>'tour_reshow')::boolean, false) then
    tour := jsonb_set(tour, '{version}', to_jsonb(coalesce((tour->>'version')::int, 1) + 1));
  end if;
  f := jsonb_set(c.features, '{tour}', tour);

  update public.campaigns set
    status = 'authorized', authorized_at = now(), authorized_by = (p_actor->>'id')::uuid,
    suspended_at = null, suspended_by = null, visible_from = vf,
    visibility = v, features = f,
    updated_by = (p_actor->>'id')::uuid, updated_at = now(), version = version + 1
  where id = p_campaign;

  select enabled into module_was from public.campaign_settings where id = 1;
  if not coalesce(module_was, false) then
    update public.campaign_settings set enabled = true, updated_by = (p_actor->>'id')::uuid, updated_at = now() where id = 1;
    perform public.campaign_audit(null, p_actor, 'MODULE_ENABLED', 'module', '1',
      jsonb_build_object('enabled', false), jsonb_build_object('enabled', true), 'Ligado ao publicar a campanha ' || c.name);
  end if;

  select * into after_row from public.campaigns where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'PUBLISH_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status),
    jsonb_build_object('status', 'authorized', 'visible_from', vf, 'options', p_opts, 'eligible_count', chk->'eligible_count'),
    null);

  return jsonb_build_object('ok', true, 'visible_from', vf, 'module_enabled_now', not coalesce(module_was, false),
                            'eligible_count', (chk->>'eligible_count')::int,
                            'notify', coalesce((p_opts->>'notify')::boolean, false),
                            'campaign', to_jsonb(after_row));
end
$$;

create or replace function public.campaign_suspend(p_actor jsonb, p_campaign uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status <> 'authorized' then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  if c.suspended_at is not null then return; end if;
  update public.campaigns set suspended_at = now(), suspended_by = (p_actor->>'id')::uuid, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SUSPEND_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('suspended', false), jsonb_build_object('suspended', true), p_reason);
end
$$;

create or replace function public.campaign_resume(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status <> 'authorized' then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  if c.suspended_at is null then return; end if;
  update public.campaigns set suspended_at = null, suspended_by = null, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'RESUME_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('suspended', true), jsonb_build_object('suspended', false), null);
end
$$;

create or replace function public.campaign_back_to_draft(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; n integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status not in ('in_review', 'authorized') then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  select count(*) into n from public.campaign_submissions where campaign_id = p_campaign;
  if n > 0 then perform public.campaign_raise('CAMPAIGN_HAS_RECORDS'); end if;
  update public.campaigns set status = 'draft', authorized_at = null, authorized_by = null, visible_from = null,
    suspended_at = null, suspended_by = null, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'BACK_TO_DRAFT', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status), jsonb_build_object('status', 'draft'), null);
end
$$;

create or replace function public.campaign_close(p_actor jsonb, p_campaign uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status <> 'authorized' then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  update public.campaigns set status = 'closed', closed_at = now(), updated_by = (p_actor->>'id')::uuid, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'CLOSE_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status), jsonb_build_object('status', 'closed'), p_reason);
end
$$;

create or replace function public.campaign_archive(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status not in ('draft', 'closed') then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  update public.campaigns set status = 'archived', archived_at = now(), updated_by = (p_actor->>'id')::uuid, updated_at = now(), version = version + 1 where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'ARCHIVE_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status), jsonb_build_object('status', 'archived'), null);
end
$$;

create or replace function public.campaign_delete_empty_draft(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; n integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status <> 'draft' then perform public.campaign_raise('INVALID_STATE', c.status); end if;
  select count(*) into n from public.campaign_submissions where campaign_id = p_campaign;
  if n > 0 then perform public.campaign_raise('CAMPAIGN_HAS_RECORDS'); end if;
  perform public.campaign_audit(p_campaign, p_actor, 'DELETE_EMPTY_DRAFT', 'campaign', p_campaign::text, to_jsonb(c), null, null);
  delete from public.campaign_eligible_users where campaign_id = p_campaign;
  delete from public.campaign_results where campaign_id = p_campaign;
  delete from public.campaign_stages where campaign_id = p_campaign;
  delete from public.campaigns where id = p_campaign;
end
$$;

create or replace function public.campaign_duplicate(p_actor jsonb, p_source uuid, p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.campaigns;
  v_id uuid;
  tour jsonb;
begin
  select * into s from public.campaigns where id = p_source;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if length(btrim(coalesce(p_name, ''))) not between 3 and 120 then perform public.campaign_raise('INVALID_FIELDS', 'name'); end if;
  if lower(coalesce(p_slug, '')) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 60 then
    perform public.campaign_raise('INVALID_FIELDS', 'slug');
  end if;
  tour := jsonb_set(coalesce(s.features->'tour', '{"enabled":true,"version":1}'::jsonb), '{version}', '1'::jsonb);

  -- copia SOMENTE configuração. Nunca participantes, receitas, mídia, votos,
  -- ranking, resultados nem histórico. Datas das etapas ficam em branco.
  insert into public.campaigns
    (slug, type, name, description, objective, instructions, cover_path, status,
     audience, features, visibility, media_limits, source_campaign_id,
     created_by, created_by_name, updated_by)
  values
    (lower(p_slug), s.type, btrim(p_name), s.description, s.objective, s.instructions, s.cover_path, 'draft',
     s.audience, jsonb_set(s.features, '{tour}', tour), s.visibility, s.media_limits, s.id,
     (p_actor->>'id')::uuid, coalesce(p_actor->>'name', ''), (p_actor->>'id')::uuid)
  returning id into v_id;

  insert into public.campaign_stages (campaign_id, stage_key)
    select v_id, stage_key from public.campaign_stages where campaign_id = p_source;
  insert into public.campaign_results (campaign_id) values (v_id);
  insert into public.campaign_eligible_users (campaign_id, user_id, added_by)
    select v_id, user_id, (p_actor->>'id')::uuid from public.campaign_eligible_users where campaign_id = p_source;

  perform public.campaign_audit(v_id, p_actor, 'DUPLICATE_CAMPAIGN', 'campaign', v_id::text,
    jsonb_build_object('source', p_source), jsonb_build_object('id', v_id, 'slug', lower(p_slug)), null);
  return v_id;
exception when unique_violation then
  perform public.campaign_raise('SLUG_TAKEN');
  return null;
end
$$;

create or replace function public.campaign_set_eligible_users(p_actor jsonb, p_campaign uuid, p_users uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; n integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  delete from public.campaign_eligible_users where campaign_id = p_campaign;
  insert into public.campaign_eligible_users (campaign_id, user_id, added_by)
    select p_campaign, u, (p_actor->>'id')::uuid from (select distinct unnest(coalesce(p_users, '{}')) as u) x;
  get diagnostics n = row_count;
  perform public.campaign_audit(p_campaign, p_actor, 'SET_ELIGIBLE_USERS', 'campaign', p_campaign::text,
    null, jsonb_build_object('count', n), null);
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- Etapas
-- ---------------------------------------------------------------------------
create or replace function public.campaign_check_stage_order(p_campaign uuid)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  reg public.campaign_stages;
  vot public.campaign_stages;
  res public.campaign_stages;
begin
  select * into reg from public.campaign_stages where campaign_id = p_campaign and stage_key = 'registration';
  select * into vot from public.campaign_stages where campaign_id = p_campaign and stage_key = 'voting';
  select * into res from public.campaign_stages where campaign_id = p_campaign and stage_key = 'results';
  if reg.ends_at is not null and vot.starts_at is not null and reg.ends_at > vot.starts_at then
    perform public.campaign_raise('INVALID_DATES', 'registration_after_voting');
  end if;
  if vot.ends_at is not null and res.starts_at is not null and vot.ends_at > res.starts_at then
    perform public.campaign_raise('INVALID_DATES', 'voting_after_results');
  end if;
end
$$;

create or replace function public.campaign_reset_preliminary(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.campaign_results;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if found and r.status in ('confirmed', 'announced') then
    perform public.campaign_raise('RESULTS_CONFIRMED');
  end if;
  update public.campaign_results set status = 'none', tally = '[]'::jsonb, total_valid_votes = 0, eligible_count = 0,
    voters_count = 0, tie_candidates = '{}', tie_decision_submission_id = null, tie_justification = null,
    tie_decided_by = null, tie_decided_at = null, winner_submission_id = null, winner_votes = null, computed_at = null
  where campaign_id = p_campaign;
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
  locked boolean;
begin
  perform public.campaign_sync_lock(p_campaign);
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
  locked := public.campaign_is_locked(p_campaign);
  if locked and p_stage = 'voting' and p_starts is distinct from s.starts_at then
    perform public.campaign_raise('VOTING_ALREADY_STARTED');
  end if;
  if locked and p_stage = 'registration' then
    perform public.campaign_raise('EDIT_LOCKED');
  end if;
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
  perform public.campaign_sync_lock(p_campaign);
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into s from public.campaign_stages where campaign_id = p_campaign and stage_key = p_stage for update;
  if not found then perform public.campaign_raise('INVALID_FIELDS', 'stage'); end if;
  if s.ends_at is null or p_new_ends is null or p_new_ends <= s.ends_at then
    perform public.campaign_raise('INVALID_DATES', 'extend_must_be_later');
  end if;
  if p_stage = 'registration' and public.campaign_is_locked(p_campaign) then
    perform public.campaign_raise('EDIT_LOCKED');
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
-- Receitas
-- ---------------------------------------------------------------------------
create or replace function public.campaign_mime_ext(p_mime text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case lower(p_mime)
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov'
    else null end
$$;

-- Valida e registra intenções de mídia de uma receita. Devolve as linhas criadas.
create or replace function public.campaign_add_media_intents(p_campaign uuid, p_submission uuid, p_media jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  lim jsonb;
  m jsonb;
  v_kind text;
  v_mime text;
  v_size bigint;
  v_ext text;
  v_id uuid;
  v_max bigint;
  n_main integer;
  n_photo integer;
  n_video integer;
  pos integer;
  result_rows jsonb := '[]'::jsonb;
begin
  select * into c from public.campaigns where id = p_campaign;
  lim := c.media_limits;

  select count(*) filter (where kind = 'main_photo'), count(*) filter (where kind = 'photo'), count(*) filter (where kind = 'video'),
         coalesce(max(position), 0)
    into n_main, n_photo, n_video, pos
    from public.campaign_media where submission_id = p_submission and status <> 'removed';

  for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    v_kind := m->>'kind';
    v_mime := lower(coalesce(m->>'mime', ''));
    v_size := coalesce((m->>'size')::bigint, 0);
    v_ext := public.campaign_mime_ext(v_mime);
    if v_kind not in ('main_photo', 'photo', 'video') or v_ext is null then
      perform public.campaign_raise('MEDIA_INVALID', coalesce(v_kind, '') || ':' || v_mime);
    end if;
    if v_kind in ('main_photo', 'photo') then
      if v_mime not like 'image/%' then perform public.campaign_raise('MEDIA_INVALID', v_kind || ':' || v_mime); end if;
      if not public.campaign_feat(c.features, 'photos') then perform public.campaign_raise('MEDIA_NOT_ALLOWED', 'photos'); end if;
      v_max := ((lim->>'max_photo_mb')::bigint) * 1024 * 1024;
    else
      if v_mime not like 'video/%' then perform public.campaign_raise('MEDIA_INVALID', v_kind || ':' || v_mime); end if;
      if not public.campaign_feat(c.features, 'video') or not coalesce((lim->>'allow_video')::boolean, false) then
        perform public.campaign_raise('MEDIA_NOT_ALLOWED', 'video');
      end if;
      v_max := ((lim->>'max_video_mb')::bigint) * 1024 * 1024;
    end if;
    if v_size <= 0 or v_size > v_max then
      perform public.campaign_raise('MEDIA_TOO_LARGE', v_kind);
    end if;
    if v_kind = 'main_photo' then n_main := n_main + 1; if n_main > 1 then perform public.campaign_raise('MEDIA_LIMIT', 'main_photo'); end if; end if;
    if v_kind = 'photo' then n_photo := n_photo + 1; if n_photo > (lim->>'max_photos')::int then perform public.campaign_raise('MEDIA_LIMIT', 'photo'); end if; end if;
    if v_kind = 'video' then n_video := n_video + 1; if n_video > 1 then perform public.campaign_raise('MEDIA_LIMIT', 'video'); end if; end if;

    v_id := gen_random_uuid();
    pos := pos + 1;
    insert into public.campaign_media (id, submission_id, campaign_id, kind, path, mime, size_bytes, status, position)
    values (v_id, p_submission, p_campaign, v_kind, p_campaign::text || '/' || p_submission::text || '/' || v_id::text || '.' || v_ext,
            v_mime, v_size, 'pending', pos);
    result_rows := result_rows || jsonb_build_array(jsonb_build_object('id', v_id, 'kind', v_kind, 'mime', v_mime, 'max_bytes', v_max,
      'path', p_campaign::text || '/' || p_submission::text || '/' || v_id::text || '.' || v_ext));
  end loop;
  return result_rows;
end
$$;

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
  perform public.campaign_sync_lock(p_campaign);
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if c.type <> 'recipe_contest' or not public.campaign_feat(c.features, 'submission') then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_user_eligible(p_campaign, p_user) then perform public.campaign_raise('NOT_ELIGIBLE'); end if;
  if public.campaign_is_locked(p_campaign) then perform public.campaign_raise('EDIT_LOCKED'); end if;
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
       btrim(p_fields->>'dish_name'), btrim(p_fields->>'description'), btrim(p_fields->>'ingredients'), btrim(p_fields->>'preparation'),
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
begin
  perform public.campaign_sync_lock(p_campaign);
  select * into s from public.campaign_submissions
   where id = p_submission and campaign_id = p_campaign and user_id = p_user for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if public.campaign_is_locked(p_campaign) then perform public.campaign_raise('EDIT_LOCKED'); end if;
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
begin
  perform public.campaign_sync_lock(p_campaign);
  select * into s from public.campaign_submissions
   where id = p_submission and campaign_id = p_campaign and user_id = p_user for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if public.campaign_is_locked(p_campaign) then perform public.campaign_raise('EDIT_LOCKED'); end if;
  actor := jsonb_build_object('id', p_user, 'name', s.user_name, 'role', 'user');

  perform public.campaign_validate_recipe(coalesce(p_fields, '{}'::jsonb), true);
  before := jsonb_build_object('dish_name', s.dish_name, 'description', s.description,
                               'ingredients', s.ingredients, 'preparation', s.preparation, 'status', s.status);

  if coalesce(p_fields, '{}'::jsonb) <> '{}'::jsonb then
    if (p_fields ? 'dish_name' and btrim(p_fields->>'dish_name') is distinct from s.dish_name)
       or (p_fields ? 'description' and btrim(p_fields->>'description') is distinct from s.description)
       or (p_fields ? 'ingredients' and btrim(p_fields->>'ingredients') is distinct from s.ingredients)
       or (p_fields ? 'preparation' and btrim(p_fields->>'preparation') is distinct from s.preparation) then
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
    description = case when p_fields ? 'description' then btrim(p_fields->>'description') else description end,
    ingredients = case when p_fields ? 'ingredients' then btrim(p_fields->>'ingredients') else ingredients end,
    preparation = case when p_fields ? 'preparation' then btrim(p_fields->>'preparation') else preparation end,
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
    description = case when p_fields ? 'description' then btrim(p_fields->>'description') else description end,
    ingredients = case when p_fields ? 'ingredients' then btrim(p_fields->>'ingredients') else ingredients end,
    preparation = case when p_fields ? 'preparation' then btrim(p_fields->>'preparation') else preparation end,
    content_version = content_version + 1, updated_at = now()
  where id = p_submission;
  perform set_config('campaign.bypass_lock', 'off', true);
  select * into after_row from public.campaign_submissions where id = p_submission;
  perform public.campaign_audit(p_campaign, p_actor, 'ADMIN_EDIT_SUBMISSION', 'submission', p_submission::text, before,
    jsonb_build_object('dish_name', after_row.dish_name, 'description', after_row.description,
                       'ingredients', after_row.ingredients, 'preparation', after_row.preparation), p_reason);
end
$$;

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
  new_status text;
begin
  perform public.campaign_sync_lock(p_campaign);
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  if public.campaign_is_locked(p_campaign) then perform public.campaign_raise('VOTING_STARTED'); end if;
  if p_decision not in ('approve', 'reject') then perform public.campaign_raise('INVALID_FIELDS', 'decision'); end if;
  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  if s.status = 'pending_media' then perform public.campaign_raise('SUBMISSION_INCOMPLETE'); end if;

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
-- Votação
-- ---------------------------------------------------------------------------
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

create or replace function public.campaign_invalidate_vote(
  p_actor jsonb, p_campaign uuid, p_vote uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v public.campaign_votes; r public.campaign_results;
begin
  if length(btrim(coalesce(p_reason, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
  select * into v from public.campaign_votes where id = p_vote and campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('VOTE_NOT_FOUND'); end if;
  if v.invalidated_at is not null then perform public.campaign_raise('ALREADY_INVALIDATED'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;

  update public.campaign_votes
     set invalidated_at = now(), invalidated_by = (p_actor->>'id')::uuid,
         invalidated_by_name = coalesce(p_actor->>'name', ''), invalidation_reason = btrim(p_reason)
   where id = p_vote;
  -- a apuração preliminar fica obsoleta e precisa ser refeita
  if found and r.status in ('preliminary', 'tie_pending') then perform public.campaign_reset_preliminary(p_campaign); end if;
  perform public.campaign_audit(p_campaign, p_actor, 'INVALIDATE_VOTE', 'vote', p_vote::text,
    jsonb_build_object('invalidated', false), jsonb_build_object('invalidated', true), btrim(p_reason));
end
$$;

create or replace function public.campaign_tally(p_campaign uuid)
returns table (submission_id uuid, dish_name text, user_name text, votes bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.dish_name, s.user_name,
         count(v.id) filter (where v.invalidated_at is null) as votes
    from public.campaign_submissions s
    left join public.campaign_votes v on v.submission_id = s.id and v.campaign_id = s.campaign_id
   where s.campaign_id = p_campaign and s.status = 'approved'
   group by s.id, s.dish_name, s.user_name
   order by votes desc, s.dish_name
$$;

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
    update public.campaign_stages set ends_at = now(), paused = false, paused_at = null, paused_by = null,
           updated_by = (p_actor->>'id')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key = 'voting';
    perform public.campaign_audit(p_campaign, p_actor, 'END_VOTING_NOW', 'stage', 'voting',
      jsonb_build_object('ends_at', vot.ends_at), jsonb_build_object('ends_at', now()), null);
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

create or replace function public.campaign_decide_tie(
  p_actor jsonb, p_campaign uuid, p_submission uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.campaign_results;
begin
  if length(btrim(coalesce(p_justification, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found or r.status <> 'tie_pending' then perform public.campaign_raise('NO_TIE'); end if;
  if not (p_submission = any (r.tie_candidates)) then perform public.campaign_raise('NOT_A_TIE_CANDIDATE'); end if;
  update public.campaign_results set
    tie_decision_submission_id = p_submission, tie_justification = btrim(p_justification),
    tie_decided_by = (p_actor->>'id')::uuid, tie_decided_at = now(), status = 'preliminary',
    winner_submission_id = p_submission,
    winner_votes = (select t.votes::integer from public.campaign_tally(p_campaign) t where t.submission_id = p_submission)
  where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'DECIDE_TIE', 'results', p_campaign::text,
    jsonb_build_object('candidates', to_jsonb(r.tie_candidates)), jsonb_build_object('winner', p_submission), btrim(p_justification));
end
$$;

create or replace function public.campaign_confirm_winner(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.campaign_results;
  vs text;
  top bigint;
  cands uuid[];
  win uuid;
  win_votes integer;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found or r.status = 'none' then perform public.campaign_raise('NOT_CLOSED'); end if;
  if r.status = 'tie_pending' then perform public.campaign_raise('TIE_PENDING'); end if;
  if r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  vs := public.campaign_stage_state(p_campaign, 'voting');
  if vs in ('open', 'paused', 'upcoming') then perform public.campaign_raise('VOTING_STILL_OPEN'); end if;

  -- recalcula a partir dos votos válidos e confere com a apuração preliminar
  select coalesce(max(votes), 0) into top from public.campaign_tally(p_campaign);
  select coalesce(array_agg(submission_id), '{}') into cands from public.campaign_tally(p_campaign) where votes = top;
  if top = 0 then perform public.campaign_raise('NO_VOTES'); end if;
  if r.tie_decision_submission_id is not null then
    win := r.tie_decision_submission_id;
    if not (win = any (cands)) then perform public.campaign_raise('STALE_RESULTS'); end if;
  else
    if cardinality(cands) <> 1 then perform public.campaign_raise('STALE_RESULTS'); end if;
    win := cands[1];
  end if;
  select votes::integer into win_votes from public.campaign_tally(p_campaign) where submission_id = win;

  update public.campaign_results set status = 'confirmed', winner_submission_id = win, winner_votes = win_votes,
    confirmed_by = (p_actor->>'id')::uuid, confirmed_by_name = coalesce(p_actor->>'name', ''), confirmed_at = now()
  where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'CONFIRM_WINNER', 'results', p_campaign::text, null,
    jsonb_build_object('winner_submission_id', win, 'votes', win_votes), null);
  return jsonb_build_object('winner_submission_id', win, 'votes', win_votes);
end
$$;

create or replace function public.campaign_announce(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.campaign_results; s public.campaign_submissions;
begin
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found or r.status <> 'confirmed' then perform public.campaign_raise('NOT_CONFIRMED'); end if;
  update public.campaign_results set status = 'announced', announced_by = (p_actor->>'id')::uuid, announced_at = now()
   where campaign_id = p_campaign;
  select * into s from public.campaign_submissions where id = r.winner_submission_id;
  perform public.campaign_audit(p_campaign, p_actor, 'ANNOUNCE_RESULTS', 'results', p_campaign::text, null,
    jsonb_build_object('winner_submission_id', r.winner_submission_id), null);
  return jsonb_build_object('winner_submission_id', r.winner_submission_id, 'winner_user_id', s.user_id, 'dish_name', s.dish_name);
end
$$;

-- ---------------------------------------------------------------------------
-- Leitura / visibilidade para o colaborador
-- ---------------------------------------------------------------------------
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
  else return coalesce(r.status, 'none') in ('confirmed', 'announced');
  end if;
end
$$;

create or replace function public.campaign_results_visible(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; r public.campaign_results; a public.campaign_stages;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_feat(c.features, 'results') then return false; end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  if coalesce(r.status, 'none') <> 'announced' then return false; end if;
  select * into a from public.campaign_stages where campaign_id = p_campaign and stage_key = 'announcement';
  return a.starts_at is null or a.starts_at <= now();
end
$$;

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
  elsif mode = 'on_voting_start' then return public.campaign_is_locked(p_campaign);
  else return public.campaign_results_visible(p_campaign);
  end if;
end
$$;

-- Estado completo da campanha para um colaborador (fonte única das regras de tela)
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
  locked := public.campaign_is_locked(p_campaign);
  res_vis := public.campaign_results_visible(p_campaign);

  stage := case
    when res_vis then 'results'
    when c.status = 'closed' then 'closed'
    when not released then 'upcoming'
    when vot = 'paused' then 'voting_paused'
    when vot = 'open' then 'voting'
    when vot = 'closed' then 'voting_closed'
    when reg = 'open' then 'registration'
    when reg = 'paused' then 'registration_paused'
    when reg = 'upcoming' then 'upcoming'
    when reg = 'closed' then 'review'
    else 'upcoming' end;

  can_submit := released and public.campaign_feat(c.features, 'submission') and s.id is null
                and reg = 'open' and not locked and c.status = 'authorized';
  can_edit := released and s.id is not null and not locked and c.status = 'authorized';
  can_vote := released and public.campaign_feat(c.features, 'voting') and vot = 'open'
              and v.id is null and c.status = 'authorized';

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

-- Participantes elegíveis e quem enviou/votou (voto individual só se p_with_votes)
create or replace function public.campaign_participants(p_campaign uuid, p_with_votes boolean)
returns table (
  user_id uuid, user_name text, department text, unit text,
  submission_id uuid, submission_status text, submitted_at timestamptz,
  voted boolean, voted_at timestamptz)
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
         case when p_with_votes then v.created_at else null end
    from auth.users u
    left join public.campaign_submissions s on s.campaign_id = p_campaign and s.user_id = u.id
    left join public.campaign_votes v on v.campaign_id = p_campaign and v.voter_id = u.id
   where public.campaign_user_eligible(p_campaign, u.id) or s.id is not null or v.id is not null
   order by 2
$$;

-- ---------------------------------------------------------------------------
-- Notificações (idempotência) e acesso administrativo
-- ---------------------------------------------------------------------------
create or replace function public.campaign_notification_claim(
  p_campaign uuid, p_user uuid, p_event text, p_entity text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  insert into public.campaign_notification_log (campaign_id, user_id, event_key, entity_id)
  values (p_campaign, p_user, p_event, coalesce(p_entity, ''))
  on conflict (campaign_id, user_id, event_key, entity_id) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

create or replace function public.campaign_notification_done(
  p_campaign uuid, p_user uuid, p_event text, p_entity text, p_inbox boolean, p_push boolean, p_error text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.campaign_notification_log
     set inbox_ok = p_inbox, push_ok = p_push, error = p_error
   where campaign_id = p_campaign and user_id = p_user and event_key = p_event and entity_id = coalesce(p_entity, '')
$$;

create or replace function public.campaign_set_module(p_actor jsonb, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare was boolean;
begin
  select enabled into was from public.campaign_settings where id = 1 for update;
  if was = p_enabled then return; end if;
  update public.campaign_settings set enabled = p_enabled, updated_by = (p_actor->>'id')::uuid, updated_at = now() where id = 1;
  perform public.campaign_audit(null, p_actor, case when p_enabled then 'MODULE_ENABLED' else 'MODULE_DISABLED' end,
    'module', '1', jsonb_build_object('enabled', was), jsonb_build_object('enabled', p_enabled), null);
end
$$;

create or replace function public.campaign_admin_set(p_actor jsonb, p_user uuid, p_name text, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  before jsonb;
  managers integer;
begin
  select permissions into before from public.campaign_admins where user_id = p_user;
  insert into public.campaign_admins (user_id, user_name, permissions, added_by)
  values (p_user, coalesce(p_name, ''), coalesce(p_permissions, '{}'::jsonb), (p_actor->>'id')::uuid)
  on conflict (user_id) do update
    set permissions = coalesce(p_permissions, '{}'::jsonb), user_name = coalesce(nullif(p_name, ''), public.campaign_admins.user_name), updated_at = now();
  select count(*) into managers from public.campaign_admins where coalesce((permissions->>'campaigns_access')::boolean, false);
  if managers = 0 then perform public.campaign_raise('LAST_ACCESS_MANAGER'); end if;
  perform public.campaign_audit(null, p_actor, 'SET_CAMPAIGN_ADMIN', 'admin', p_user::text, before, p_permissions, null);
end
$$;

create or replace function public.campaign_admin_remove(p_actor jsonb, p_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare before jsonb; managers integer;
begin
  select permissions into before from public.campaign_admins where user_id = p_user;
  delete from public.campaign_admins where user_id = p_user;
  select count(*) into managers from public.campaign_admins where coalesce((permissions->>'campaigns_access')::boolean, false);
  if managers = 0 then perform public.campaign_raise('LAST_ACCESS_MANAGER'); end if;
  perform public.campaign_audit(null, p_actor, 'REMOVE_CAMPAIGN_ADMIN', 'admin', p_user::text, before, null, null);
end
$$;
