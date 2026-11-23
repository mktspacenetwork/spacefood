-- =============================================================================
-- Campanhas - rodada 6, peça 18b (ADITIVA): público do Livro de Receitas - funções novas
--
-- recipe_book_user_in_audience(p_user)        -> boolean: a pessoa está no público? ('all' = qualquer pessoa; 'users' = só a lista)
-- recipe_book_available(p_user)               -> boolean: livro PUBLICADO + pessoa ativa + no público (usada pela disponibilidade
--                                                do menu; quem não é do público recebe o mesmo que "livro não publicado")
-- recipe_book_set_audience(p_actor, p_mode, p_user_ids) -> jsonb {mode, user_ids}
--     Modo 'users' exige >= 1 pessoa (AUDIENCE_EMPTY) e todas existentes (AUDIENCE_USER_NOT_FOUND, detalhe = id). Modo 'all'
--     NÃO apaga a lista guardada (ela reaparece se o administrador voltar a "pessoas específicas"). Troca atômica; auditoria
--     BOOK_AUDIENCE (antes/depois) só quando algo muda. Não publica nem despublica.
-- Impacto  : 3 funções novas. Nenhuma função existente é alterada nesta peça.
-- Rollback : drop das 3 funções (nada depende delas até as peças 18c-18e serem aplicadas).
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.recipe_book_user_in_audience(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user is not null and case coalesce((select s.audience_mode from public.recipe_book_settings s where s.id = 1), 'all')
           when 'users' then exists (select 1 from public.recipe_book_audience_users a where a.user_id = p_user)
           else true end
$$;

create or replace function public.recipe_book_available(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select s.published from public.recipe_book_settings s where s.id = 1), false)
     and p_user is not null
     and exists (select 1 from auth.users u where u.id = p_user and u.deleted_at is null
                   and (u.banned_until is null or u.banned_until <= now()))
     and public.recipe_book_user_in_audience(p_user)
$$;

create or replace function public.recipe_book_set_audience(p_actor jsonb, p_mode text, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  b public.recipe_book_settings;
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  ids uuid[];
  bad uuid;
  old_ids uuid[];
  new_ids uuid[];
  changed boolean;
begin
  if v_mode not in ('all', 'users') then perform public.campaign_raise('INVALID_FIELDS', 'mode'); end if;
  select * into b from public.recipe_book_settings where id = 1 for update;
  select coalesce(array_agg(a.user_id order by a.user_id), '{}'::uuid[]) into old_ids from public.recipe_book_audience_users a;

  if v_mode = 'users' then
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into ids
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) x where x is not null;
    if cardinality(ids) = 0 then perform public.campaign_raise('AUDIENCE_EMPTY'); end if;
    select x into bad from unnest(ids) x
     where not exists (select 1 from auth.users u where u.id = x and u.deleted_at is null) limit 1;
    if bad is not null then perform public.campaign_raise('AUDIENCE_USER_NOT_FOUND', bad::text); end if;
    delete from public.recipe_book_audience_users where user_id <> all(ids);
    insert into public.recipe_book_audience_users (user_id, added_by)
      select x, nullif(p_actor->>'id', '')::uuid from unnest(ids) x on conflict (user_id) do nothing;
    new_ids := ids;
  else
    new_ids := old_ids; -- a lista guardada fica (reaparece ao voltar para "pessoas específicas")
  end if;

  update public.recipe_book_settings
     set audience_mode = v_mode, updated_by = nullif(p_actor->>'id', '')::uuid,
         updated_by_name = coalesce(p_actor->>'name', ''), updated_at = now()
   where id = 1;

  changed := b.audience_mode is distinct from v_mode or (v_mode = 'users' and old_ids is distinct from new_ids);
  if changed then
    perform public.campaign_audit(null, p_actor, 'BOOK_AUDIENCE', 'book', 'audience',
      jsonb_build_object('mode', b.audience_mode, 'user_ids', to_jsonb(old_ids)),
      jsonb_build_object('mode', v_mode, 'user_ids', to_jsonb(new_ids)), null);
  end if;
  return jsonb_build_object('mode', v_mode, 'user_ids', to_jsonb(new_ids));
end
$$;

revoke all on function public.recipe_book_user_in_audience(uuid) from public, anon, authenticated;
grant execute on function public.recipe_book_user_in_audience(uuid) to service_role;
revoke all on function public.recipe_book_available(uuid) from public, anon, authenticated;
grant execute on function public.recipe_book_available(uuid) to service_role;
revoke all on function public.recipe_book_set_audience(jsonb, text, uuid[]) from public, anon, authenticated;
grant execute on function public.recipe_book_set_audience(jsonb, text, uuid[]) to service_role;
