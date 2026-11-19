-- =============================================================================
-- SNAPSHOT A (antes da 14a): definição anterior de campaign_publish_check (versão da migração 8, = produção em 2026-11-19).
-- Serve APENAS para reverter a 14a4. NÃO faz parte do rollback da 14b (que manteria a versão da 14a, compatível com a janela legada).
-- Aplicar como UMA peça (apply_migration, nome campaigns_14a_rollback_publish_check) e conferir o hash:
--   md5(replace(prosrc, chr(13), '')) = 1df3b6d29b7b7ff360ba6674fb0b22c1
-- =============================================================================
CREATE OR REPLACE FUNCTION public.campaign_publish_check(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;

revoke all on function public.campaign_publish_check(uuid) from public, anon, authenticated;
grant execute on function public.campaign_publish_check(uuid) to service_role;
