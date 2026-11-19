-- =============================================================================
-- Campanhas - rodada 5, peça 14b4 (COMPORTAMENTAL): edição de receita fora do prazo
--
-- Objetivo : receita atrasada não aprovada (e rascunho ainda não finalizado) pode ser editada enquanto durar a janela de envio atrasado; receita no prazo segue bloqueada após o encerramento.
-- Impacto  : recria somente campaign_update_submission (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

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
  if reg <> 'open' then
    -- fora do prazo: receita atrasada (ou rascunho ainda não finalizado) segue editável na janela de envio atrasado
    if not (reg = 'closed' and (s.is_late or s.finalized_at is null) and public.campaign_late_window(p_campaign)) then
      perform public.campaign_raise('REGISTRATION_CLOSED');
    end if;
  end if;
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

revoke all on function public.campaign_update_submission(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_update_submission(uuid, uuid, uuid, jsonb, jsonb) to service_role;
