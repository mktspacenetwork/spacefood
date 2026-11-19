-- =============================================================================
-- Campanhas - rodada 5, peça 14b6 (COMPORTAMENTAL): envio de receita fora do prazo
--
-- Objetivo : campaign_submit aceita o envio na janela de envio atrasado (campanha com votação, participação encerrada, resultado ainda não divulgado); sem votação o encerramento continua bloqueando.
-- Impacto  : recria somente campaign_submit (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

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
  v_late boolean := false;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if c.type <> 'recipe_contest' or not public.campaign_feat(c.features, 'submission') then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_user_eligible(p_campaign, p_user) then perform public.campaign_raise('NOT_ELIGIBLE'); end if;
  st := public.campaign_stage_state(p_campaign, 'registration');
  if st = 'paused' then perform public.campaign_raise('REGISTRATION_PAUSED'); end if;
  if st <> 'open' then
    -- fora do prazo: aceito só na janela de envio atrasado (campanha COM votação, até a divulgação do resultado);
    -- sem votação, ou depois da divulgação, o encerramento continua bloqueando
    if st = 'closed' and public.campaign_late_window(p_campaign) then v_late := true;
    else perform public.campaign_raise('REGISTRATION_CLOSED'); end if;
  end if;
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
       submitted_at, finalized_at, is_late)
    values
      (p_campaign, p_user, v_slot, coalesce(nullif(btrim(p_user_name), ''), 'Colaborador'),
       coalesce(meta->>'lunch_location', ''), coalesce(meta->>'department', ''),
       btrim(p_fields->>'dish_name'),
       coalesce(btrim(p_fields->>'description'), ''),
       coalesce(btrim(p_fields->>'ingredients'), ''),
       coalesce(btrim(p_fields->>'preparation'), ''),
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then 'submitted' else 'pending_media' end,
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then now() else null end,
       case when jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then now() else null end,
       -- sem mídia a receita já nasce finalizada (momento efetivo do envio); com mídia, is_late é gravado na finalização
       (v_late and jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0))
    returning id into sid;
  exception when unique_violation then
    select id into existing from public.campaign_submissions
     where campaign_id = p_campaign and user_id = p_user order by slot limit 1;
    perform public.campaign_raise('ALREADY_SUBMITTED', existing::text);
  end;

  uploads := public.campaign_add_media_intents(p_campaign, sid, p_media);
  perform public.campaign_audit(p_campaign, actor, 'SUBMIT_RECIPE', 'submission', sid::text, null,
    jsonb_build_object('dish_name', btrim(p_fields->>'dish_name'), 'media', jsonb_array_length(uploads), 'slot', v_slot)
      || case when v_late then jsonb_build_object('late_window', true) else '{}'::jsonb end, null);
  return jsonb_build_object('submission_id', sid,
    'status', case when jsonb_array_length(uploads) = 0 then 'submitted' else 'pending_media' end,
    'uploads', uploads, 'slot', v_slot, 'is_late', (v_late and jsonb_array_length(uploads) = 0));
end
$$;

revoke all on function public.campaign_submit(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_submit(uuid, uuid, text, jsonb, jsonb) to service_role;
