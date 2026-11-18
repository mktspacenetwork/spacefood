-- =============================================================================
-- Gerenciador de Campanhas — 9: campos da receita, teto de fotos e ranking só após divulgação
--
-- Objetivo : (a) receita NOVA exige ingredientes e modo de preparo (receitas antigas continuam válidas);
--            (b) textos longos: ingredientes e preparo até 20.000 caracteres, história até 5.000
--                (no banco E na função de validação; quebras de linha preservadas);
--            (c) fotos: no máximo 3 por receita (1ª main_photo + até 2 photo), aplicado no banco; a foto
--                só é exigida quando a campanha aceita fotos (features.photos) E exige a principal;
--            (d) ranking para o COLABORADOR só depois da divulgação oficial, qualquer que seja o
--                ranking_mode (nunca parcial). A gestão acompanha ao vivo pela API (não há dado novo).
-- Impacto  : SOMENTE objetos campaign_*. Aditiva e idempotente. Nenhum dado é apagado: os limites só
--            AUMENTAM e a obrigatoriedade vale só para envios novos.
-- Rollback : reaplicar as definições das migrações 3/6/8 (funções) e recriar as CHECK com os limites antigos
--            (600->2000 história, 3000 ingredientes, 6000 preparo) se nenhum texto maior tiver sido gravado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Limites de texto
-- ---------------------------------------------------------------------------
alter table public.campaign_submissions drop constraint if exists campaign_submissions_description_len;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_ingredients_len;
alter table public.campaign_submissions drop constraint if exists campaign_submissions_preparation_len;
alter table public.campaign_submissions
  add constraint campaign_submissions_description_len check (length(btrim(description)) <= 5000),
  add constraint campaign_submissions_ingredients_len check (length(btrim(ingredients)) <= 20000),
  add constraint campaign_submissions_preparation_len check (length(btrim(preparation)) <= 20000);

-- Validação: título 3–120; história opcional (<= 5000); ingredientes e preparo obrigatórios no envio novo
-- (p_partial = false) e, em edição (p_partial = true), não podem ficar vazios SE vierem no corpo; <= 20000.
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
    if length(btrim(coalesce(p_fields->>'description', ''))) > 5000 then bad := array_append(bad, 'description'); end if;
  end if;
  -- "vazio" = sem nenhum caractere visível (o btrim padrão só tira espaços; aqui também tabs e quebras de linha)
  if not p_partial or p_fields ? 'ingredients' then
    v := coalesce(p_fields->>'ingredients', '');
    if length(btrim(v, E' \t\r\n')) < 1 or length(btrim(v)) > 20000 then bad := array_append(bad, 'ingredients'); end if;
  end if;
  if not p_partial or p_fields ? 'preparation' then
    v := coalesce(p_fields->>'preparation', '');
    if length(btrim(v, E' \t\r\n')) < 1 or length(btrim(v)) > 20000 then bad := array_append(bad, 'preparation'); end if;
  end if;
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_FIELDS', array_to_string(bad, ','));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Fotos: teto de 3 por receita (main_photo + photo), contando só as não removidas
-- ---------------------------------------------------------------------------
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
    if v_kind = 'photo' then
      n_photo := n_photo + 1;
      if n_photo > coalesce((lim->>'max_photos')::int, 2) then perform public.campaign_raise('MEDIA_LIMIT', 'photo'); end if;
    end if;
    -- teto da rodada: no máximo 3 fotos por receita, em qualquer combinação de main_photo + photo
    if v_kind in ('main_photo', 'photo') and (n_main + n_photo) > 3 then perform public.campaign_raise('MEDIA_LIMIT', 'photos_max_3'); end if;
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

-- ---------------------------------------------------------------------------
-- 3) Envio: ingredientes/preparo obrigatórios (via validação) e foto só se a campanha aceita fotos
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
$$;

-- ---------------------------------------------------------------------------
-- 4) Ranking do colaborador: SÓ depois da divulgação oficial (qualquer ranking_mode)
-- ---------------------------------------------------------------------------
create or replace function public.campaign_ranking_visible(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; r public.campaign_results;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_feat(c.features, 'ranking') then return false; end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  -- nunca parcial: nem no modo "ao vivo" nem "depois do encerramento"; só quando o resultado foi divulgado
  return coalesce(r.status, 'none') = 'announced';
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Privilégios (mesma regra das migrações anteriores)
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
