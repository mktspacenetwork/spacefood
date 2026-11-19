-- =============================================================================
-- Campanhas - rodada 5, peça 14a2 (ADITIVA): cronograma com três datas
--
-- Objetivo : campaign_set_schedule() grava, numa ÚNICA transação, as datas da campanha em sequência estrita:
--            participação (starts_at..ends_at) -> votação (voting_starts_at..voting_ends_at) -> divulgação (announce_at).
--            Entrada: p_period jsonb; a PRESENÇA da chave importa:
--              - voting_* ausentes  = modo legado: a votação acompanha a participação (igual ao período único de antes);
--                se a campanha já tem votação em janela PRÓPRIA (sequência estrita), ela é mantida e só validada;
--              - announce_at ausente = não mexe; null = limpa; valor = agenda (campaign_schedule_announcement).
--            Erros INVALID_DATES (detail): missing, ends_before_starts, voting_missing, voting_ends_before_starts,
--            voting_before_registration_end, announce_before_voting_end, announce_without_voting.
--            Sem mudança real = não grava nem audita (devolve changed=false). Mudou = auditoria SET_PERIOD (e a do anúncio).
-- Impacto  : 1 função nova. campaign_set_periods/campaign_set_period continuam existindo (sem uso pela API nova).
-- Rollback : drop function public.campaign_set_schedule(jsonb, uuid, jsonb) (nada depende dela no banco).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.campaign_set_schedule(p_actor jsonb, p_campaign uuid, p_period jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  reg public.campaign_stages;
  vot public.campaign_stages;
  v boolean;
  n_rs timestamptz;
  n_re timestamptz;
  n_vs timestamptz;
  n_ve timestamptz;
  n_an timestamptz;
  s_rs timestamptz;
  s_re timestamptz;
  s_vs timestamptz;
  s_ve timestamptz;
  vot_keys boolean;
  dates_changed boolean;
  ann_changed boolean;
  b jsonb;
  a jsonb;
begin
  p_period := coalesce(p_period, '{}'::jsonb);
  n_rs := nullif(p_period->>'starts_at', '')::timestamptz;
  n_re := nullif(p_period->>'ends_at', '')::timestamptz;
  if n_rs is null or n_re is null then perform public.campaign_raise('INVALID_DATES', 'missing'); end if;
  if n_re <= n_rs then perform public.campaign_raise('INVALID_DATES', 'ends_before_starts'); end if;

  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  select * into reg from public.campaign_stages where campaign_id = p_campaign and stage_key = 'registration' for update;
  select * into vot from public.campaign_stages where campaign_id = p_campaign and stage_key = 'voting' for update;
  v := public.campaign_feat(c.features, 'voting');
  -- datas gravadas em MILISSEGUNDOS: o navegador devolve datas com 3 casas, e "encerrar votação agora" grava now() com
  -- microssegundos; sem isto, reenviar datas iguais contaria como mudança (e falharia com o resultado confirmado).
  s_rs := date_trunc('milliseconds', reg.starts_at); s_re := date_trunc('milliseconds', reg.ends_at);
  s_vs := date_trunc('milliseconds', vot.starts_at); s_ve := date_trunc('milliseconds', vot.ends_at);

  if v then
    vot_keys := (p_period ? 'voting_starts_at') or (p_period ? 'voting_ends_at');
    if vot_keys then
      n_vs := nullif(p_period->>'voting_starts_at', '')::timestamptz;
      n_ve := nullif(p_period->>'voting_ends_at', '')::timestamptz;
      if n_vs is null or n_ve is null then perform public.campaign_raise('INVALID_DATES', 'voting_missing'); end if;
      if n_ve <= n_vs then perform public.campaign_raise('INVALID_DATES', 'voting_ends_before_starts'); end if;
      -- sequência estrita: a votação começa quando a participação termina (ou depois). Única exceção: janela única
      -- legada reenviada sem NENHUMA mudança (nada é gravado nesse caso).
      if n_vs < n_re then
        if not (n_vs = n_rs and n_ve = n_re
                and n_rs is not distinct from s_rs and n_re is not distinct from s_re
                and n_vs is not distinct from s_vs and n_ve is not distinct from s_ve) then
          perform public.campaign_raise('INVALID_DATES', 'voting_before_registration_end');
        end if;
      end if;
    elsif s_vs is not null and s_ve is not null and (s_vs, s_ve) is distinct from (s_rs, s_re) then
      -- votação já tem janela PRÓPRIA (sequência estrita): mantém e só confere contra a nova participação
      n_vs := s_vs; n_ve := s_ve;
      if n_vs < n_re and (n_rs, n_re) is distinct from (s_rs, s_re) then
        perform public.campaign_raise('INVALID_DATES', 'voting_before_registration_end');
      end if;
    else
      -- modo legado: a votação acompanha a participação
      n_vs := n_rs; n_ve := n_re;
    end if;
  else
    if nullif(p_period->>'announce_at', '') is not null then
      perform public.campaign_raise('INVALID_DATES', 'announce_without_voting');
    end if;
    n_vs := null; n_ve := null;
  end if;

  dates_changed := (n_rs, n_re) is distinct from (s_rs, s_re)
                or (n_vs, n_ve) is distinct from (s_vs, s_ve);

  if v then
    if p_period ? 'announce_at' then n_an := nullif(p_period->>'announce_at', '')::timestamptz;
    else n_an := date_trunc('milliseconds', r.announce_at); end if;
    if n_an is not null and n_an < n_ve and ((p_period ? 'announce_at') or dates_changed) then
      perform public.campaign_raise('INVALID_DATES', 'announce_before_voting_end');
    end if;
  else
    n_an := null;
  end if;
  ann_changed := n_an is distinct from date_trunc('milliseconds', r.announce_at);

  if dates_changed and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
  if not dates_changed and not ann_changed then return jsonb_build_object('changed', false); end if;

  if dates_changed then
    select coalesce(jsonb_object_agg(stage_key, jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at)), '{}'::jsonb)
      into b from public.campaign_stages where campaign_id = p_campaign;

    if (n_rs, n_re) is distinct from (s_rs, s_re) then
      update public.campaign_stages
         set starts_at = n_rs, ends_at = n_re, updated_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
       where campaign_id = p_campaign and stage_key = 'registration';
    end if;
    if v then
      if (n_vs, n_ve) is distinct from (s_vs, s_ve) then
        update public.campaign_stages
           set starts_at = n_vs, ends_at = n_ve, updated_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
         where campaign_id = p_campaign and stage_key = 'voting';
      end if;
    else
      update public.campaign_stages
         set starts_at = null, ends_at = null, paused = false, paused_at = null, paused_by = null,
             updated_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
       where campaign_id = p_campaign and stage_key = 'voting';
    end if;
    update public.campaign_stages
       set starts_at = null, ends_at = null, updated_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
     where campaign_id = p_campaign and stage_key in ('results', 'announcement');

    if v then perform public.campaign_reset_preliminary(p_campaign); end if;
    perform public.campaign_check_stage_order(p_campaign);

    select coalesce(jsonb_object_agg(stage_key, jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at)), '{}'::jsonb)
      into a from public.campaign_stages where campaign_id = p_campaign;
    perform public.campaign_audit(p_campaign, p_actor, 'SET_PERIOD', 'stage', 'period', b, a, null);
  end if;

  if ann_changed then
    if n_an is null then
      perform public.campaign_cancel_announcement(p_actor, p_campaign);
    else
      perform public.campaign_schedule_announcement(p_actor, p_campaign, n_an);
    end if;
  end if;

  return jsonb_build_object('changed', true, 'dates_changed', dates_changed, 'announce_changed', ann_changed);
end
$$;

revoke all on function public.campaign_set_schedule(jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_set_schedule(jsonb, uuid, jsonb) to service_role;
