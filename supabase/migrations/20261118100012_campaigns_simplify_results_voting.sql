-- =============================================================================
-- Gerenciador de Campanhas - 12: simplificacao (rodada 4)
--
-- Objetivo : (a) REMOVE o sorteio (tabela campaign_draws, funcoes campaign_draw_*, gatilhos) e o livro POR
--            CAMPANHA (campaign_books, funcoes campaign_book_*): o Livro passa a ser UM acervo unico (migracao 13);
--            (b) data de anuncio do resultado = referencia unica (campaign_results.announce_at), definida a qualquer
--            momento ANTES de divulgar; a divulgacao automatica so ocorre se o ganhador ja estava CONFIRMADO antes
--            da data (confirmou depois: divulgar continua sendo acao manual);
--            (c) votacao pode ser LIGADA/DESLIGADA depois de criada (mesmo publicada e com receitas/votos); desligar
--            e bloqueado se o resultado ja foi confirmado/divulgado; os votos nunca sao apagados;
--            (d) ranking PARCIAL para colaboradores, por opcao do administrador (visibility.show_partial, padrao nao).
-- Impacto  : SOMENTE objetos campaign_*. Recria (create or replace): campaign_validate_features, campaign_update,
--            campaign_schedule_announcement, campaign_run_due_announcements, campaign_ranking_visible,
--            campaign_collab_state. Cria campaign_set_partial_ranking. Remove objetos de sorteio e do livro por
--            campanha (so dados de TESTE existiam). Retira as chaves draw/draw_winners de campaigns.features.
--            A auditoria (append-only) permanece intacta. Votos, receitas e resultados nao sao tocados.
-- Rollback : reaplicar as definicoes das migracoes 8, 9, 10 e 11 (funcoes) e recriar as tabelas removidas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Funcionalidades: sem sorteio
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Atualizar campanha: a VOTACAO pode ser ligada/desligada a qualquer momento.
--    - desligar: bloqueado se o resultado ja foi confirmado/divulgado (RESULTS_CONFIRMED); votos preservados;
--    - ligar: exige aprovacao (validador); sem datas de votacao, copia as da participacao (janela unica);
--    - ranking/results/announcement acompanham a votacao, salvo se vierem explicitos;
--    - tour e "varias receitas" continuam livres; o resto das funcionalidades/midia segue travado com receitas.
-- ---------------------------------------------------------------------------
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
  nf jsonb;
  old_v boolean;
  new_v boolean;
  v_changed boolean := false;
  res_status text;
  n_votes integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if p_expected_version is not null and c.version <> p_expected_version then
    perform public.campaign_raise('VERSION_CONFLICT');
  end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  before := to_jsonb(c);

  -- votacao ligada/desligada depois de criada
  nf := p_fields->'features';
  old_v := public.campaign_feat(c.features, 'voting');
  if jsonb_typeof(nf) = 'object' and nf ? 'voting' then
    new_v := coalesce((nf->>'voting')::boolean, false);
    if new_v is distinct from old_v then
      v_changed := true;
      if not new_v then
        select status into res_status from public.campaign_results where campaign_id = p_campaign;
        if res_status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
      end if;
      -- as funcionalidades derivadas acompanham a votacao, salvo se vierem explicitas
      nf := jsonb_build_object('ranking', new_v, 'results', new_v, 'announcement', new_v) || nf;
      p_fields := jsonb_set(p_fields, '{features}', nf);
    end if;
  end if;

  if c.status in ('draft', 'in_review') then
    if p_fields ? 'name' then
      if length(btrim(coalesce(p_fields->>'name', ''))) not between 3 and 120 then
        perform public.campaign_raise('INVALID_FIELDS', 'name');
      end if;
      update public.campaigns set name = btrim(p_fields->>'name') where id = p_campaign;
    end if;
  else
    -- publicada: nao muda funcionalidades/limites se ja ha receitas (livres: tour, "varias receitas" e votacao)
    if jsonb_typeof(p_fields->'media_limits') = 'object'
       and (c.media_limits || (p_fields->'media_limits')) is distinct from c.media_limits then
      changed := true;
    end if;
    if jsonb_typeof(p_fields->'features') = 'object' then
      feats := (p_fields->'features') - 'tour' - 'multiple_submissions' - 'voting' - 'ranking' - 'results' - 'announcement';
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

  -- ligou a votacao sem datas proprias: usa a janela da participacao (periodo unico)
  if v_changed and new_v then
    update public.campaign_stages v
       set starts_at = r.starts_at, ends_at = r.ends_at, updated_by = (p_actor->>'id')::uuid, updated_at = now()
      from public.campaign_stages r
     where v.campaign_id = p_campaign and v.stage_key = 'voting'
       and r.campaign_id = p_campaign and r.stage_key = 'registration'
       and v.starts_at is null and v.ends_at is null;
  end if;

  select * into after_row from public.campaigns where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'UPDATE_CAMPAIGN', 'campaign', p_campaign::text, before, to_jsonb(after_row), null);
  if v_changed then
    select count(*)::integer into n_votes from public.campaign_votes where campaign_id = p_campaign and invalidated_at is null;
    perform public.campaign_audit(p_campaign, p_actor, 'SET_VOTING', 'campaign', p_campaign::text,
      jsonb_build_object('voting', old_v), jsonb_build_object('voting', new_v, 'valid_votes', n_votes), null);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Data de anuncio do resultado: vale em qualquer estado ANTES de divulgar (nao so confirmado);
--    reenviar o mesmo valor e idempotente; data nova precisa ser pelo menos 30 s a frente.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_schedule_announcement(p_actor jsonb, p_campaign uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if not public.campaign_feat(c.features, 'voting') then perform public.campaign_raise('INVALID_STATE', 'no_voting'); end if;
  select * into r from public.campaign_results where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('RESULTS_NOT_CONFIRMED'); end if;
  if r.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if p_at is null then perform public.campaign_raise('ANNOUNCE_IN_PAST'); end if;
  if r.announce_at is not distinct from p_at then
    return jsonb_build_object('announce_at', p_at);
  end if;
  if p_at < now() + interval '30 seconds' then perform public.campaign_raise('ANNOUNCE_IN_PAST'); end if;
  update public.campaign_results
     set announce_at = p_at, announce_scheduled_by = nullif(p_actor->>'id', '')::uuid,
         announce_scheduled_by_name = coalesce(p_actor->>'name', ''), announce_scheduled_at = now()
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SCHEDULE_ANNOUNCEMENT', 'results', p_campaign::text,
    jsonb_build_object('announce_at', r.announce_at), jsonb_build_object('announce_at', p_at), null);
  return jsonb_build_object('announce_at', p_at);
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Executor: divulga SOMENTE se o ganhador foi confirmado ANTES da data de anuncio.
--    Confirmou depois da data: nao divulga sozinho (confirmar e divulgar sao acoes independentes).
-- ---------------------------------------------------------------------------
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
       and r.confirmed_at is not null and r.confirmed_at <= r.announce_at
       and public.campaign_is_released(r.campaign_id)
     order by r.announce_at
       for update of r skip locked
  loop
    begin
      perform public.campaign_announce(sys, rec.campaign_id);
      n := n + 1;
    exception when others then
      raise warning 'campaign_run_due_announcements(%): %', rec.campaign_id, sqlerrm;
    end;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Ranking parcial para colaboradores: so se o administrador ligar (visibility.show_partial), com a votacao
--    ja iniciada. O oficial continua so depois da divulgacao.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_ranking_visible(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; r public.campaign_results; vs text;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found or not public.campaign_feat(c.features, 'ranking') or not public.campaign_feat(c.features, 'voting') then
    return false;
  end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  if coalesce(r.status, 'none') = 'announced' then return true; end if;
  vs := public.campaign_stage_state(p_campaign, 'voting');
  return coalesce((c.visibility->>'show_partial')::boolean, false) and vs in ('open', 'paused', 'closed');
end
$$;

create or replace function public.campaign_set_partial_ranking(p_actor jsonb, p_campaign uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns; old_v boolean;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  if not public.campaign_feat(c.features, 'voting') then perform public.campaign_raise('INVALID_STATE', 'no_voting'); end if;
  old_v := coalesce((c.visibility->>'show_partial')::boolean, false);
  if old_v is distinct from coalesce(p_enabled, false) then
    update public.campaigns
       set visibility = visibility || jsonb_build_object('show_partial', coalesce(p_enabled, false)),
           updated_by = nullif(p_actor->>'id', '')::uuid
     where id = p_campaign;
    perform public.campaign_audit(p_campaign, p_actor, 'SET_PARTIAL_RANKING', 'campaign', p_campaign::text,
      jsonb_build_object('show_partial', old_v), jsonb_build_object('show_partial', coalesce(p_enabled, false)), null);
  end if;
  return jsonb_build_object('enabled', coalesce(p_enabled, false));
end
$$;

-- ---------------------------------------------------------------------------
-- 6) Estado do colaborador: sem sorteio; + ranking_partial
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- 7) Remocao do SORTEIO e do LIVRO POR CAMPANHA (so dados de teste existiam)
--    As funcoes novas acima ja nao dependem destes objetos.
-- ---------------------------------------------------------------------------
drop trigger if exists campaign_draw_guard_ins on public.campaign_submissions;
drop trigger if exists campaign_draw_guard_upd on public.campaign_submissions;
drop table if exists public.campaign_draws cascade;
drop table if exists public.campaign_books cascade;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'campaign\_draw\_%' or p.proname like 'campaign\_book\_%' or p.proname = 'campaign_books_guard')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end
$$;

-- chaves de sorteio nao fazem mais parte das funcionalidades
update public.campaigns
   set features = features - 'draw' - 'draw_winners'
 where features ? 'draw' or features ? 'draw_winners';

-- ---------------------------------------------------------------------------
-- 8) Privilegios (mesma regra das migracoes anteriores)
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
