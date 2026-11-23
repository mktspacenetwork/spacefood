-- =============================================================================
-- Campanhas - rodada 6, peça 18e (COMPORTAMENTAL): estado do livro (admin) inclui o público
--
-- Objetivo : recipe_book_state devolve settings.audience {mode, user_ids} (a tela do administrador mostra e edita o público).
-- Impacto  : recria somente recipe_book_state (o resto igual à versão da migração 13). Com o público em 'all' (padrão) o comportamento
--            é idêntico ao de hoje.
-- Rollback : definição anterior (migração 13 / snapshot de supabase/rollback/17_snapshot_query.sql).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.recipe_book_state()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'settings', jsonb_build_object('published', s.published, 'auto_include', s.auto_include,
      'audience', jsonb_build_object('mode', s.audience_mode,
        'user_ids', coalesce((select jsonb_agg(a.user_id order by a.user_id) from public.recipe_book_audience_users a), '[]'::jsonb))),
    'counts', jsonb_build_object(
      'in_book', count(r.ref) filter (where r.status = 'included'),
      'removed', count(r.ref) filter (where r.status = 'removed'),
      'manual', count(r.ref) filter (where r.source = 'manual' and r.status = 'included'),
      'from_campaigns', count(r.ref) filter (where r.source = 'campaign' and r.status = 'included')))
  from public.recipe_book_settings s
  left join public.recipe_book_rows() r on true
  where s.id = 1
  group by s.published, s.auto_include, s.audience_mode
$$;

revoke all on function public.recipe_book_state() from public, anon, authenticated;
grant execute on function public.recipe_book_state() to service_role;
