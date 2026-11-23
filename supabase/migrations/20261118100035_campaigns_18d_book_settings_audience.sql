-- =============================================================================
-- Campanhas - rodada 6, peça 18d (COMPORTAMENTAL): publicar o livro exige público válido
--
-- Objetivo : recipe_book_set_settings recusa publicar (AUDIENCE_EMPTY) quando o público é "pessoas específicas" e a lista está vazia.
-- Impacto  : recria somente recipe_book_set_settings (o resto igual à versão da migração 13). Com o público em 'all' (padrão) o comportamento
--            é idêntico ao de hoje.
-- Rollback : definição anterior (migração 13 / snapshot de supabase/rollback/17_snapshot_query.sql).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.recipe_book_set_settings(p_actor jsonb, p_published boolean, p_auto_include boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare b public.recipe_book_settings;
begin
  select * into b from public.recipe_book_settings where id = 1 for update;
  -- publicar para "pessoas específicas" sem nenhuma pessoa escolhida é recusado
  if coalesce(p_published, b.published) and b.audience_mode = 'users'
     and not exists (select 1 from public.recipe_book_audience_users) then
    perform public.campaign_raise('AUDIENCE_EMPTY');
  end if;
  update public.recipe_book_settings
     set published = coalesce(p_published, published), auto_include = coalesce(p_auto_include, auto_include),
         updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', ''), updated_at = now()
   where id = 1;
  if (p_published is not null and p_published is distinct from b.published)
     or (p_auto_include is not null and p_auto_include is distinct from b.auto_include) then
    perform public.campaign_audit(null, p_actor, 'BOOK_SETTINGS', 'book', 'settings',
      jsonb_build_object('published', b.published, 'auto_include', b.auto_include),
      jsonb_build_object('published', coalesce(p_published, b.published), 'auto_include', coalesce(p_auto_include, b.auto_include)), null);
  end if;
  return jsonb_build_object('published', coalesce(p_published, b.published), 'auto_include', coalesce(p_auto_include, b.auto_include));
end
$$;

revoke all on function public.recipe_book_set_settings(jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.recipe_book_set_settings(jsonb, boolean, boolean) to service_role;
