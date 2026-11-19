-- =============================================================================
-- Campanhas - rodada 5, peça 14b1 (COMPORTAMENTAL): contagem de votos sem receitas fora do prazo
--
-- Objetivo : campaign_tally (usada por ranking, apuração e resultados) deixa de listar receitas fora do prazo: elas não concorrem.
-- Impacto  : recria somente campaign_tally (uma função por peça; o resto é igual à versão anterior). Sem efeito enquanto não
--            existir receita fora do prazo (is_late = false para todas). Aplicar na ordem 14b1 -> 14b7: a 14b7
--            (collab_state) é o INTERRUPTOR FINAL que liga o botão na tela.
-- Rollback : seção correspondente de supabase/rollback/14b_restore_functions.sql (snapshot B, tirado antes da 14b).
-- Idempotente: create or replace.
-- =============================================================================

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
   where s.campaign_id = p_campaign and s.status = 'approved' and not s.is_late
   group by s.id, s.dish_name, s.user_name
   order by votes desc, s.dish_name
$$;


revoke all on function public.campaign_tally(uuid) from public, anon, authenticated;
grant execute on function public.campaign_tally(uuid) to service_role;
