-- =============================================================================
-- Campanhas - rodada 6, peça 18c (COMPORTAMENTAL): leitura do livro respeita o público
--
-- Objetivo : recipe_book_view devolve BOOK_UNAVAILABLE (o mesmo de "livro não publicado") para quem não está no público do livro.
-- Impacto  : recria somente recipe_book_view (o resto igual à versão da migração 13). Com o público em 'all' (padrão) o comportamento
--            é idêntico ao de hoje.
-- Rollback : definição anterior (migração 13 / snapshot de supabase/rollback/17_snapshot_query.sql).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.recipe_book_view(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  pub boolean;
begin
  select published into pub from public.recipe_book_settings where id = 1;
  if not coalesce(pub, false) or p_user is null
     or not exists (select 1 from auth.users u where u.id = p_user and u.deleted_at is null
                      and (u.banned_until is null or u.banned_until <= now()))
     or not public.recipe_book_user_in_audience(p_user) then
    -- quem NÃO é do público recebe exatamente o mesmo erro de "livro não publicado" (nada vaza)
    perform public.campaign_raise('BOOK_UNAVAILABLE');
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.ref, 'position', t.pos, 'dish_name', t.dish_name, 'author', t.author,
               'story', t.story, 'ingredients', t.ingredients, 'preparation', t.preparation,
               'photos', t.photos, 'campaign_name', t.campaign_name) order by t.pos)
        from (select r.*, row_number() over (order by lower(r.dish_name), r.ref) as pos
                from public.recipe_book_rows() r where r.status = 'included') t), '[]'::jsonb));
end
$$;

revoke all on function public.recipe_book_view(uuid) from public, anon, authenticated;
grant execute on function public.recipe_book_view(uuid) to service_role;
