-- =============================================================================
-- Campanhas - rodada 5, peça 14a3 (ADITIVA): dashboard dos relatórios
--
-- Objetivo : (a) campaign_tally_period(): contagem de votos por receita, opcionalmente só os votos de um período,
--                SEM as receitas fora do prazo (independe da peça 14b);
--            (b) campaign_analytics(): tudo que o dashboard precisa numa só chamada (totais, série por dia em horário de
--                Brasília, ranking com posição de competição, participação por unidade quando pedida).
--            Só LEITURA (stable). Votos/receitas/resultados não são tocados.
-- Impacto  : 2 funções novas.
-- Rollback : drop function public.campaign_analytics(uuid, boolean); drop function public.campaign_tally_period(uuid, timestamptz, timestamptz).
-- Idempotente: create or replace.
-- =============================================================================

-- Votos válidos por receita APROVADA e NO PRAZO; p_from/p_to (inclusivos, nulos = sem limite) filtram a data do voto.
create or replace function public.campaign_tally_period(p_campaign uuid, p_from timestamptz, p_to timestamptz)
returns table (submission_id uuid, dish_name text, user_name text, votes bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.dish_name, s.user_name,
         count(v.id) filter (where v.invalidated_at is null
                               and (p_from is null or v.created_at >= p_from)
                               and (p_to is null or v.created_at <= p_to)) as votes
    from public.campaign_submissions s
    left join public.campaign_votes v on v.submission_id = s.id and v.campaign_id = s.campaign_id
   where s.campaign_id = p_campaign and s.status = 'approved' and not s.is_late
   group by s.id, s.dish_name, s.user_name
   order by votes desc, s.dish_name
$$;

create or replace function public.campaign_analytics(p_campaign uuid, p_units boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  has_vote boolean;
  vs text;
  elig integer;
  n_sub integer; n_part integer; n_pend integer; n_appr integer; n_rej integer; n_late integer;
  n_vreg integer := 0; n_vvalid integer := 0; n_voters integer := 0;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  d_from date; d_to date; end_date date;
  days jsonb := '[]'::jsonb;
  tally jsonb := null;
  units jsonb := null;
  stages jsonb;
  res_json jsonb;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  has_vote := public.campaign_feat(c.features, 'voting');
  vs := public.campaign_stage_state(p_campaign, 'voting');
  elig := public.campaign_eligible_count(p_campaign);

  select count(*)::integer, count(distinct s.user_id)::integer,
         (count(*) filter (where s.status in ('submitted', 'in_review')))::integer,
         (count(*) filter (where s.status = 'approved'))::integer,
         (count(*) filter (where s.status = 'rejected'))::integer,
         (count(*) filter (where s.is_late))::integer
    into n_sub, n_part, n_pend, n_appr, n_rej, n_late
    from public.campaign_submissions s
   where s.campaign_id = p_campaign and s.status <> 'pending_media';

  -- sem votação não há voto a mostrar (os votos antigos ficam guardados, mas escondidos)
  if has_vote then
    select count(*)::integer, (count(*) filter (where cv.invalidated_at is null))::integer,
           (count(distinct cv.voter_id) filter (where cv.invalidated_at is null))::integer
      into n_vreg, n_vvalid, n_voters
      from public.campaign_votes cv where cv.campaign_id = p_campaign;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('stage_key', st.stage_key, 'starts_at', st.starts_at, 'ends_at', st.ends_at, 'paused', st.paused)), '[]'::jsonb)
    into stages from public.campaign_stages st where st.campaign_id = p_campaign;

  -- série por dia (Brasília): enviadas por submitted_at; aprovadas/reprovadas por reviewed_at; votos válidos por created_at
  select min(x.d), max(x.d) into d_from, d_to from (
    select (s.submitted_at at time zone 'America/Sao_Paulo')::date as d
      from public.campaign_submissions s
     where s.campaign_id = p_campaign and s.status <> 'pending_media' and s.submitted_at is not null
    union all
    select (s.reviewed_at at time zone 'America/Sao_Paulo')::date
      from public.campaign_submissions s
     where s.campaign_id = p_campaign and s.status in ('approved', 'rejected') and s.reviewed_at is not null
    union all
    select (cv.created_at at time zone 'America/Sao_Paulo')::date
      from public.campaign_votes cv
     where has_vote and cv.campaign_id = p_campaign and cv.invalidated_at is null
  ) x;

  if d_from is not null then
    select max((st.ends_at at time zone 'America/Sao_Paulo')::date) into end_date
      from public.campaign_stages st
     where st.campaign_id = p_campaign and st.ends_at is not null
       and (st.stage_key = 'registration' or (has_vote and st.stage_key = 'voting'));
    -- campanha em andamento: a série vai até hoje; já encerrada: até o último dia com movimento ou o encerramento
    if end_date is not null and end_date < today then d_to := greatest(d_to, end_date);
    else d_to := greatest(d_to, today); end if;
    if d_to - d_from > 179 then d_from := d_to - 179; end if;

    select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
             'submitted', coalesce(a.submitted, 0), 'approved', coalesce(a.approved, 0),
             'rejected', coalesce(a.rejected, 0), 'votes', coalesce(a.votes, 0)) order by g.d), '[]'::jsonb)
      into days
      from (select d_from + i as d from generate_series(0, d_to - d_from) i) g
      left join (
        select d, sum(submitted)::integer as submitted, sum(approved)::integer as approved,
               sum(rejected)::integer as rejected, sum(votes)::integer as votes
          from (
            select (s.submitted_at at time zone 'America/Sao_Paulo')::date as d, 1 as submitted, 0 as approved, 0 as rejected, 0 as votes
              from public.campaign_submissions s
             where s.campaign_id = p_campaign and s.status <> 'pending_media' and s.submitted_at is not null
            union all
            select (s.reviewed_at at time zone 'America/Sao_Paulo')::date, 0, 1, 0, 0
              from public.campaign_submissions s
             where s.campaign_id = p_campaign and s.status = 'approved' and s.reviewed_at is not null
            union all
            select (s.reviewed_at at time zone 'America/Sao_Paulo')::date, 0, 0, 1, 0
              from public.campaign_submissions s
             where s.campaign_id = p_campaign and s.status = 'rejected' and s.reviewed_at is not null
            union all
            select (cv.created_at at time zone 'America/Sao_Paulo')::date, 0, 0, 0, 1
              from public.campaign_votes cv
             where has_vote and cv.campaign_id = p_campaign and cv.invalidated_at is null
          ) e group by d
      ) a on a.d = g.d;
  end if;

  -- ranking: só receitas aprovadas e no prazo; posição de COMPETIÇÃO (empate divide o lugar: 1, 1, 3)
  if has_vote then
    select coalesce(jsonb_agg(jsonb_build_object('submission_id', t.submission_id, 'dish_name', t.dish_name,
             'author', t.user_name, 'votes', t.votes, 'position', t.pos) order by t.votes desc, t.dish_name), '[]'::jsonb)
      into tally
      from (select x.*, (rank() over (order by x.votes desc))::integer as pos
              from public.campaign_tally_period(p_campaign, null, null) x) t;
  end if;

  if p_units then
    select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit, 'eligible', u.eligible, 'sent', u.sent, 'voted', u.voted)
                              order by u.eligible desc, u.unit), '[]'::jsonb)
      into units
      from (
        select coalesce(nullif(btrim(x.unit), ''), 'Sem unidade') as unit,
               (count(*) filter (where x.elig))::integer as eligible,
               (count(*) filter (where x.sent))::integer as sent,
               (count(*) filter (where x.voted))::integer as voted
          from (
            select coalesce(us.raw_user_meta_data->>'lunch_location', '') as unit,
                   public.campaign_user_eligible(p_campaign, us.id) as elig,
                   exists (select 1 from public.campaign_submissions s
                            where s.campaign_id = p_campaign and s.user_id = us.id and s.status <> 'pending_media') as sent,
                   (has_vote and exists (select 1 from public.campaign_votes cv
                                          where cv.campaign_id = p_campaign and cv.voter_id = us.id and cv.invalidated_at is null)) as voted
              from auth.users us
          ) x
         where x.elig or x.sent or x.voted
         group by 1
      ) u;
  end if;

  res_json := jsonb_build_object(
    'generated_at', now(),
    'stages', stages,
    'has_voting', has_vote,
    'voting_live', has_vote and vs in ('open', 'paused'),
    'totals', jsonb_build_object(
      'eligible', elig, 'participants', n_part, 'submissions', n_sub, 'pending', n_pend, 'approved', n_appr,
      'rejected', n_rej, 'late', n_late, 'votes_valid', n_vvalid, 'votes_invalidated', n_vreg - n_vvalid,
      'voters', n_voters,
      'participation_pct', case when elig > 0 then round(n_part::numeric * 100 / elig)::integer else 0 end,
      'voting_pct', case when elig > 0 then round(n_voters::numeric * 100 / elig)::integer else 0 end),
    'series', jsonb_build_object('from', d_from, 'to', d_to, 'days', days));
  if tally is not null then res_json := res_json || jsonb_build_object('tally', tally); end if;
  if units is not null then res_json := res_json || jsonb_build_object('by_unit', units); end if;
  return res_json;
end
$$;

revoke all on function public.campaign_tally_period(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_tally_period(uuid, timestamptz, timestamptz) to service_role;
revoke all on function public.campaign_analytics(uuid, boolean) from public, anon, authenticated;
grant execute on function public.campaign_analytics(uuid, boolean) to service_role;
