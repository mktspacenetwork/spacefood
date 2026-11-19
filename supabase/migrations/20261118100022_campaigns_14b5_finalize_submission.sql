-- =============================================================================
-- Campanhas - rodada 5, peça 14b5 (COMPORTAMENTAL): finalização de receita fora do prazo
--
-- Objetivo : a primeira finalização na janela de envio atrasado é aceita e grava is_late = true (momento efetivo do envio); imutável depois.
-- Impacto  : recria somente campaign_finalize_submission (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

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
  v_late boolean;
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
    -- fora do prazo: a primeira finalização na janela de envio atrasado é aceita e marca a receita (is_late)
    if not (reg = 'closed' and (s.is_late or s.finalized_at is null) and public.campaign_late_window(p_campaign)) then
      perform public.campaign_raise('REGISTRATION_CLOSED');
    end if;
  end if;
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
  -- momento efetivo do envio = primeira finalização; fora da participação aberta = FORA DO PRAZO (gravado uma vez)
  v_late := first_time and reg <> 'open';
  update public.campaign_submissions
     set status = case when first_time then 'submitted' else 'in_review' end,
         submitted_at = coalesce(submitted_at, now()), finalized_at = coalesce(finalized_at, now()), updated_at = now(),
         is_late = is_late or v_late
   where id = p_submission;

  perform public.campaign_audit(p_campaign, actor, 'FINALIZE_SUBMISSION', 'submission', p_submission::text,
    jsonb_build_object('status', s.status),
    jsonb_build_object('status', case when first_time then 'submitted' else 'in_review' end)
      || case when v_late then jsonb_build_object('is_late', true) else '{}'::jsonb end, null);
  return jsonb_build_object('status', case when first_time then 'submitted' else 'in_review' end,
                            'first_time', first_time, 'dish_name', s.dish_name, 'is_late', (s.is_late or v_late));
end
$$;

revoke all on function public.campaign_finalize_submission(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_finalize_submission(uuid, uuid, uuid, jsonb) to service_role;
