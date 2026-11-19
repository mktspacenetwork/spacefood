-- =============================================================================
-- Campanhas - rodada 5, peça 14a1 (ADITIVA): receita "fora do prazo" - núcleo
--
-- Objetivo : cria a base da regra "fora do prazo" SEM mudar nenhum comportamento atual:
--            (a) coluna campaign_submissions.is_late (padrão false, só metadado: nenhuma linha é reescrita);
--            (b) campaign_late_window(): votação ligada + participação encerrada + campanha liberada + resultado
--                ainda não divulgado = a janela em que o envio atrasado é aceito (usada só pelas peças 14b);
--            (c) gatilho campaign_votes_late_guard: NUNCA aceita voto em receita fora do prazo (independente das
--                funções, por isso sobrevive a qualquer rollback delas);
--            (d) gatilho campaign_submissions_late_guard: is_late só vira true na PRIMEIRA finalização e nunca muda depois.
-- Impacto  : coluna nova + 1 função nova + 2 gatilhos novos. Nenhuma função existente é alterada.
--            Enquanto a 14b não for aplicada, is_late vale false para todas as receitas.
-- Rollback : esta peça é inofensiva e não é revertida pelo rollback da 14b (ver supabase/rollback/README.md).
--            Para desfazer (raro): drop trigger campaign_votes_late_guard_ins / campaign_submissions_late_guard_upd,
--            drop function campaign_late_window, campaign_votes_late_guard, campaign_submissions_late_guard
--            (a coluna pode ficar: é inofensiva).
-- Idempotente: pode ser reaplicada.
-- =============================================================================

alter table public.campaign_submissions
  add column if not exists is_late boolean not null default false;

comment on column public.campaign_submissions.is_late is
  'Receita enviada FORA DO PRAZO (após o encerramento da participação, na janela até a divulgação do resultado). Gravada uma vez, na primeira finalização; imutável. Não concorre à votação, ao ranking nem ao resultado.';

-- Janela de envio atrasado: só campanhas COM votação, participação já encerrada, campanha liberada e resultado
-- ainda não divulgado. Campanha sem votação nunca tem janela (o encerramento continua bloqueando o envio).
create or replace function public.campaign_late_window(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select public.campaign_feat(c.features, 'voting')
       and public.campaign_stage_state(c.id, 'registration') = 'closed'
       and public.campaign_is_released(c.id)
       and coalesce((select r.status from public.campaign_results r where r.campaign_id = c.id), 'none') <> 'announced'
      from public.campaigns c
     where c.id = p_campaign
  ), false)
$$;

-- Voto: recusa receita fora do prazo (defesa em profundidade, além de campaign_cast_vote e do filtro da API).
create or replace function public.campaign_votes_late_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.campaign_submissions s where s.id = new.submission_id and s.is_late) then
    raise exception using errcode = 'P0001', message = 'LATE_SUBMISSION';
  end if;
  return new;
end
$$;

drop trigger if exists campaign_votes_late_guard_ins on public.campaign_votes;
create trigger campaign_votes_late_guard_ins
  before insert on public.campaign_votes
  for each row execute function public.campaign_votes_late_guard();

-- is_late: a única mudança permitida é false -> true no momento da PRIMEIRA finalização (finalized_at passa de nulo a preenchido).
create or replace function public.campaign_submissions_late_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_late = false and new.is_late = true and old.finalized_at is null and new.finalized_at is not null then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'LATE_IMMUTABLE';
end
$$;

drop trigger if exists campaign_submissions_late_guard_upd on public.campaign_submissions;
create trigger campaign_submissions_late_guard_upd
  before update of is_late on public.campaign_submissions
  for each row when (old.is_late is distinct from new.is_late)
  execute function public.campaign_submissions_late_guard();

revoke all on function public.campaign_late_window(uuid) from public, anon, authenticated;
grant execute on function public.campaign_late_window(uuid) to service_role;
revoke all on function public.campaign_votes_late_guard() from public, anon, authenticated;
revoke all on function public.campaign_submissions_late_guard() from public, anon, authenticated;

notify pgrst, 'reload schema';
