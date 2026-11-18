-- =============================================================================
-- Gerenciador de Campanhas - 13: LIVRO DE RECEITAS unico (acervo permanente)
--
-- Objetivo : UM unico livro da plataforma. Receitas APROVADAS entram sozinhas (se auto_include estiver ligado,
--            mesmo com a campanha ativa); o administrador tambem adiciona receitas da plataforma e cadastra receitas
--            manuais (com foto). Remover do livro NUNCA mexe no cadastro da receita (status, votos, historico,
--            campanha): so grava uma entrada "removida" no acervo; da para readicionar. Sem duplicidade; autoria
--            original preservada; receita manual usa "Cadastrada pela administracao" (sem autoria ficticia).
--            O livro so aparece ao colaborador quando o administrador PUBLICAR.
-- Modelo   : o acervo e COMPUTADO na leitura: entradas gravadas (incluidas/removidas) + receitas aprovadas ainda sem
--            entrada (quando auto_include esta ligado). Nada e copiado em massa. Editar uma receita de campanha
--            grava so sobreposicoes de TEXTO na entrada (o cadastro original nao muda). Receita que deixa de estar
--            aprovada some do livro sozinha.
-- Impacto  : cria recipe_book_settings (1 linha) e recipe_book_entries + funcoes recipe_book_*. NAO altera
--            campaign_submissions, campaign_media nem nenhuma funcao existente. Aditiva e idempotente.
-- Rollback : drop table public.recipe_book_entries, public.recipe_book_settings cascade; drop das funcoes recipe_book_*.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelas (RLS ligado, sem grants a anon/authenticated; service_role so le)
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_book_settings (
  id              smallint primary key default 1 check (id = 1),
  published       boolean not null default false,
  auto_include    boolean not null default true,
  updated_by      uuid,
  updated_by_name text not null default '',
  updated_at      timestamptz not null default now()
);
insert into public.recipe_book_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.recipe_book_entries (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('campaign', 'manual')),
  submission_id   uuid references public.campaign_submissions (id) on delete restrict,
  status          text not null default 'included' check (status in ('included', 'removed')),
  -- so campanha: 'auto' (entrada criada por remover/editar uma receita automatica) ou 'added' (adicionada pelo admin)
  via             text check (via is null or via in ('auto', 'added')),
  -- campanha: SOBREPOSICOES de texto (null = usa o cadastro original); manual: os proprios dados
  dish_name       text,
  author_label    text,
  story           text,
  ingredients     text,
  preparation     text,
  photo_path      text,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_by_name text not null default '',
  removed_at      timestamptz,
  removed_by      uuid,
  removed_by_name text,
  constraint recipe_book_entries_submission_uq unique (submission_id),
  constraint recipe_book_entries_shape check (
       (kind = 'campaign' and submission_id is not null and via is not null and author_label is null and photo_path is null)
    or (kind = 'manual' and submission_id is null and via is null and dish_name is not null
        and ingredients is not null and preparation is not null)),
  constraint recipe_book_entries_len check (
       (dish_name is null or length(btrim(dish_name)) between 3 and 120)
   and (author_label is null or length(author_label) <= 120)
   and (story is null or length(story) <= 5000)
   and (ingredients is null or length(btrim(ingredients)) between 1 and 20000)
   and (preparation is null or length(btrim(preparation)) between 1 and 20000))
);

alter table public.recipe_book_settings enable row level security;
alter table public.recipe_book_entries enable row level security;
revoke all on table public.recipe_book_settings from anon, authenticated, service_role;
revoke all on table public.recipe_book_entries from anon, authenticated, service_role;
grant select on table public.recipe_book_settings to service_role;
grant select on table public.recipe_book_entries to service_role;

-- Entradas nunca sao apagadas nem trocam de receita: remover = status 'removed'
create or replace function public.recipe_book_entries_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then perform public.campaign_raise('BOOK_IMMUTABLE'); end if;
  if new.kind is distinct from old.kind or new.submission_id is distinct from old.submission_id then
    perform public.campaign_raise('BOOK_IMMUTABLE');
  end if;
  return new;
end
$$;
drop trigger if exists recipe_book_entries_guard_upd on public.recipe_book_entries;
create trigger recipe_book_entries_guard_upd before update on public.recipe_book_entries
  for each row execute function public.recipe_book_entries_guard();
drop trigger if exists recipe_book_entries_guard_del on public.recipe_book_entries;
create trigger recipe_book_entries_guard_del before delete on public.recipe_book_entries
  for each row execute function public.recipe_book_entries_guard();

-- ---------------------------------------------------------------------------
-- 2) Auxiliares
-- ---------------------------------------------------------------------------
-- texto normalizado para comparar nomes (sem acento, caixa e espacos extras)
create or replace function public.recipe_book_norm(t text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select regexp_replace(lower(translate(btrim(coalesce(t, '')),
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcC')), '\s+', ' ', 'g')
$$;

-- "s:<submission>" ou "e:<entrada>" -> uuid (invalido = BOOK_NOT_FOUND)
create or replace function public.recipe_book_ref_id(p_ref text, p_prefix text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_ref is null or left(p_ref, 2) <> p_prefix || ':' then return null; end if;
  begin
    return substr(p_ref, 3)::uuid;
  exception when others then
    return null;
  end;
end
$$;

-- Tipo das linhas do acervo (uma funcao que devolve TABLE nao cria tipo nomeado)
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'recipe_book_row') then
    create type public.recipe_book_row as (
      ref text, source text, via text, status text, entry_id uuid, submission_id uuid,
      campaign_id uuid, campaign_name text, dish_name text, author text, story text, ingredients text,
      preparation text, edited boolean, created_at timestamptz, photos jsonb,
      orig_dish_name text, orig_story text, orig_ingredients text, orig_preparation text);
  end if;
end
$$;

-- Todas as linhas do acervo (computado): campanha (entrada + aprovadas sem entrada, se auto_include) + manuais.
create or replace function public.recipe_book_rows()
returns setof public.recipe_book_row
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    's:' || s.id::text, 'campaign'::text,
    case when e.id is null then 'auto' else e.via end,
    coalesce(e.status, 'included'),
    e.id, s.id, s.campaign_id, c.name,
    coalesce(e.dish_name, s.dish_name),
    s.user_name,
    coalesce(e.story, s.description),
    coalesce(e.ingredients, s.ingredients),
    coalesce(e.preparation, s.preparation),
    (e.dish_name is not null or e.story is not null or e.ingredients is not null or e.preparation is not null),
    coalesce(e.created_at, s.finalized_at, s.submitted_at),
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path)
                       order by (m.kind = 'main_photo') desc, m.position, m.created_at)
        from (select mm.* from public.campaign_media mm
               where mm.submission_id = s.id and mm.status = 'ready' and mm.kind in ('main_photo', 'photo')
               order by (mm.kind = 'main_photo') desc, mm.position, mm.created_at
               limit 3) m), '[]'::jsonb),
    s.dish_name, s.description, s.ingredients, s.preparation
  from public.campaign_submissions s
  join public.campaigns c on c.id = s.campaign_id
  left join public.recipe_book_entries e on e.submission_id = s.id
  where s.status = 'approved' and s.finalized_at is not null
    and (e.id is not null or coalesce((select st.auto_include from public.recipe_book_settings st where st.id = 1), true))
  union all
  select
    'e:' || e.id::text, 'manual'::text, null::text, e.status,
    e.id, null::uuid, null::uuid, null::text,
    e.dish_name,
    coalesce(nullif(btrim(e.author_label), ''), 'Cadastrada pela administração'),
    coalesce(e.story, ''), e.ingredients, e.preparation, false, e.created_at,
    case when e.photo_path is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('kind', 'main_photo', 'path', e.photo_path)) end,
    null::text, null::text, null::text, null::text
  from public.recipe_book_entries e
  where e.kind = 'manual'
$$;

-- Item resumido no formato da API (AdminBookItem)
create or replace function public.recipe_book_item_json(r public.recipe_book_row)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'ref', r.ref, 'source', r.source, 'via', r.via,
    'status', case when r.status = 'included' then 'in_book' else 'removed' end,
    'dish_name', r.dish_name, 'author', r.author,
    'campaign_name', r.campaign_name, 'campaign_id', r.campaign_id, 'submission_id', r.submission_id,
    'photo_path', r.photos->0->>'path', 'edited', r.edited, 'created_at', r.created_at)
$$;

-- ---------------------------------------------------------------------------
-- 3) Leitura (admin)
-- ---------------------------------------------------------------------------
create or replace function public.recipe_book_state()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'settings', jsonb_build_object('published', s.published, 'auto_include', s.auto_include),
    'counts', jsonb_build_object(
      'in_book', count(r.ref) filter (where r.status = 'included'),
      'removed', count(r.ref) filter (where r.status = 'removed'),
      'manual', count(r.ref) filter (where r.source = 'manual' and r.status = 'included'),
      'from_campaigns', count(r.ref) filter (where r.source = 'campaign' and r.status = 'included')))
  from public.recipe_book_settings s
  left join public.recipe_book_rows() r on true
  where s.id = 1
  group by s.published, s.auto_include
$$;

create or replace function public.recipe_book_list()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(public.recipe_book_item_json(r) order by lower(r.dish_name), r.ref), '[]'::jsonb)
    from public.recipe_book_rows() r
$$;

create or replace function public.recipe_book_get(p_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.recipe_book_row;
  v_out jsonb;
begin
  select * into r from public.recipe_book_rows() x where x.ref = p_ref;
  if r.ref is null then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  v_out := public.recipe_book_item_json(r) || jsonb_build_object(
    'story', r.story, 'ingredients', r.ingredients, 'preparation', r.preparation, 'photos', r.photos,
    'original', case when r.source = 'campaign' then jsonb_build_object(
      'dish_name', r.orig_dish_name, 'story', r.orig_story, 'ingredients', r.orig_ingredients, 'preparation', r.orig_preparation)
      else null end);
  return v_out;
end
$$;

-- Receitas aprovadas que ainda NAO estao no livro (para "Adicionar da plataforma"); ate 50, com busca.
create or replace function public.recipe_book_candidates(p_q text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(x.j order by x.k), '[]'::jsonb)
    from (
      select lower(s.dish_name) as k,
             jsonb_build_object(
               'submission_id', s.id, 'dish_name', s.dish_name, 'author', s.user_name, 'campaign_name', c.name,
               'photo_path', (select mm.path from public.campaign_media mm
                               where mm.submission_id = s.id and mm.status = 'ready' and mm.kind in ('main_photo', 'photo')
                               order by (mm.kind = 'main_photo') desc, mm.position, mm.created_at limit 1)) as j
        from public.campaign_submissions s
        join public.campaigns c on c.id = s.campaign_id
        left join public.recipe_book_entries e on e.submission_id = s.id
       where s.status = 'approved' and s.finalized_at is not null
         and ((e.id is null and not coalesce((select st.auto_include from public.recipe_book_settings st where st.id = 1), true))
              or e.status = 'removed')
         and (btrim(coalesce(p_q, '')) = ''
              or public.recipe_book_norm(s.dish_name) like '%' || public.recipe_book_norm(p_q) || '%'
              or public.recipe_book_norm(s.user_name) like '%' || public.recipe_book_norm(p_q) || '%'
              or public.recipe_book_norm(c.name) like '%' || public.recipe_book_norm(p_q) || '%')
       order by lower(s.dish_name), s.id
       limit 50
    ) x
$$;

-- ---------------------------------------------------------------------------
-- 4) Leitura (colaborador): so com o livro PUBLICADO; qualquer colaborador ativo
-- ---------------------------------------------------------------------------
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
                      and (u.banned_until is null or u.banned_until <= now())) then
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

-- ---------------------------------------------------------------------------
-- 5) Escrita (admin). Nenhuma funcao altera campaign_submissions / campaign_media / votos.
-- ---------------------------------------------------------------------------
create or replace function public.recipe_book_set_settings(p_actor jsonb, p_published boolean, p_auto_include boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare b public.recipe_book_settings;
begin
  select * into b from public.recipe_book_settings where id = 1 for update;
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

-- Adicionar uma receita APROVADA da plataforma (ou readicionar uma removida)
create or replace function public.recipe_book_add_from_submission(p_actor jsonb, p_submission uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.campaign_submissions;
  e public.recipe_book_entries;
  ai boolean;
begin
  select * into s from public.campaign_submissions where id = p_submission;
  if not found then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  if s.status <> 'approved' or s.finalized_at is null then perform public.campaign_raise('BOOK_NOT_APPROVED'); end if;
  select auto_include into ai from public.recipe_book_settings where id = 1;
  select * into e from public.recipe_book_entries where submission_id = p_submission for update;
  if found then
    if e.status = 'included' then perform public.campaign_raise('BOOK_DUPLICATE'); end if;
    update public.recipe_book_entries
       set status = 'included', via = 'added', removed_at = null, removed_by = null, removed_by_name = null,
           updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
     where id = e.id;
  else
    if coalesce(ai, true) then perform public.campaign_raise('BOOK_DUPLICATE'); end if;
    begin
      insert into public.recipe_book_entries (kind, submission_id, via, status, created_by, created_by_name, updated_by, updated_by_name)
      values ('campaign', p_submission, 'added', 'included', nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''),
              nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''));
    exception when unique_violation then
      perform public.campaign_raise('BOOK_DUPLICATE');
    end;
  end if;
  perform public.campaign_audit(s.campaign_id, p_actor, 'BOOK_ADD', 'book', 's:' || p_submission::text, null,
    jsonb_build_object('dish_name', s.dish_name, 'author', s.user_name), null);
  return jsonb_build_object('ref', 's:' || p_submission::text);
end
$$;

-- Cadastrar uma receita MANUAL (administracao). Ingredientes e preparo obrigatorios; foto vem depois.
create or replace function public.recipe_book_add_manual(
  p_actor jsonb, p_dish_name text, p_author_label text, p_story text, p_ingredients text, p_preparation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  bad text[] := '{}';
  v_id uuid;
  v_author text := coalesce(nullif(btrim(coalesce(p_author_label, '')), ''), 'Cadastrada pela administração');
begin
  if length(btrim(coalesce(p_dish_name, ''))) not between 3 and 120 then bad := array_append(bad, 'dish_name'); end if;
  if length(coalesce(p_author_label, '')) > 120 then bad := array_append(bad, 'author_label'); end if;
  if length(coalesce(p_story, '')) > 5000 then bad := array_append(bad, 'story'); end if;
  if length(btrim(coalesce(p_ingredients, ''))) not between 1 and 20000 then bad := array_append(bad, 'ingredients'); end if;
  if length(btrim(coalesce(p_preparation, ''))) not between 1 and 20000 then bad := array_append(bad, 'preparation'); end if;
  if array_length(bad, 1) is not null then perform public.campaign_raise('INVALID_FIELDS', array_to_string(bad, ',')); end if;

  perform pg_advisory_xact_lock(hashtextextended('recipe_book_manual', 0));
  if exists (select 1 from public.recipe_book_rows() r
              where r.status = 'included' and public.recipe_book_norm(r.dish_name) = public.recipe_book_norm(p_dish_name)
                and public.recipe_book_norm(r.author) = public.recipe_book_norm(v_author)) then
    perform public.campaign_raise('BOOK_DUPLICATE');
  end if;
  insert into public.recipe_book_entries (kind, dish_name, author_label, story, ingredients, preparation,
                                          created_by, created_by_name, updated_by, updated_by_name)
  values ('manual', btrim(p_dish_name), nullif(btrim(coalesce(p_author_label, '')), ''), coalesce(p_story, ''),
          btrim(p_ingredients), btrim(p_preparation),
          nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''), nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''))
  returning id into v_id;
  perform public.campaign_audit(null, p_actor, 'BOOK_ADD_MANUAL', 'book', 'e:' || v_id::text, null,
    jsonb_build_object('dish_name', btrim(p_dish_name), 'author', v_author), null);
  return jsonb_build_object('ref', 'e:' || v_id::text);
end
$$;

-- Editar: receita de campanha = so SOBREPOSICAO de texto (autoria e cadastro original intactos);
--         receita manual = todos os campos.
create or replace function public.recipe_book_update(p_actor jsonb, p_ref text, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.recipe_book_row;
  s public.campaign_submissions;
  e public.recipe_book_entries;
  bad text[] := '{}';
  sid uuid := public.recipe_book_ref_id(p_ref, 's');
  eid uuid := public.recipe_book_ref_id(p_ref, 'e');
  n_dish text; n_story text; n_ing text; n_prep text; n_author text;
  v_before jsonb; v_after jsonb;
  v_author text;
begin
  select * into r from public.recipe_book_rows() x where x.ref = p_ref;
  if r.ref is null then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;

  if p_fields ? 'dish_name' and length(btrim(coalesce(p_fields->>'dish_name', ''))) not between 3 and 120 then bad := array_append(bad, 'dish_name'); end if;
  if p_fields ? 'story' and length(coalesce(p_fields->>'story', '')) > 5000 then bad := array_append(bad, 'story'); end if;
  if p_fields ? 'ingredients' and length(btrim(coalesce(p_fields->>'ingredients', ''))) not between 1 and 20000 then bad := array_append(bad, 'ingredients'); end if;
  if p_fields ? 'preparation' and length(btrim(coalesce(p_fields->>'preparation', ''))) not between 1 and 20000 then bad := array_append(bad, 'preparation'); end if;
  if eid is not null and p_fields ? 'author_label' and length(coalesce(p_fields->>'author_label', '')) > 120 then bad := array_append(bad, 'author_label'); end if;
  if array_length(bad, 1) is not null then perform public.campaign_raise('INVALID_FIELDS', array_to_string(bad, ',')); end if;

  if sid is not null then
    select * into s from public.campaign_submissions where id = sid;
    if s.status <> 'approved' then perform public.campaign_raise('BOOK_NOT_APPROVED'); end if;
    select * into e from public.recipe_book_entries where submission_id = sid for update;
    -- valor igual ao original = sem sobreposicao
    n_dish  := case when p_fields ? 'dish_name'   then nullif(btrim(p_fields->>'dish_name'), s.dish_name)  else e.dish_name end;
    n_story := case when p_fields ? 'story'       then case when coalesce(p_fields->>'story', '') = s.description then null else coalesce(p_fields->>'story', '') end else e.story end;
    n_ing   := case when p_fields ? 'ingredients' then case when btrim(p_fields->>'ingredients') = s.ingredients then null else btrim(p_fields->>'ingredients') end else e.ingredients end;
    n_prep  := case when p_fields ? 'preparation' then case when btrim(p_fields->>'preparation') = s.preparation then null else btrim(p_fields->>'preparation') end else e.preparation end;
    v_before := jsonb_build_object('dish_name', r.dish_name, 'story', r.story, 'ingredients', r.ingredients, 'preparation', r.preparation);
    if e.id is null then
      insert into public.recipe_book_entries (kind, submission_id, via, status, dish_name, story, ingredients, preparation,
                                              created_by, created_by_name, updated_by, updated_by_name)
      values ('campaign', sid, 'auto', 'included', n_dish, n_story, n_ing, n_prep,
              nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''), nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''));
    else
      update public.recipe_book_entries
         set dish_name = n_dish, story = n_story, ingredients = n_ing, preparation = n_prep,
             updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
       where id = e.id;
    end if;
    v_after := jsonb_build_object('dish_name', coalesce(n_dish, s.dish_name), 'story', coalesce(n_story, s.description),
      'ingredients', coalesce(n_ing, s.ingredients), 'preparation', coalesce(n_prep, s.preparation));
    perform public.campaign_audit(s.campaign_id, p_actor, 'BOOK_UPDATE', 'book', p_ref, v_before, v_after, null);
    return jsonb_build_object('ref', p_ref);
  end if;

  -- manual
  select * into e from public.recipe_book_entries where id = eid for update;
  n_dish   := case when p_fields ? 'dish_name'    then btrim(p_fields->>'dish_name') else e.dish_name end;
  n_author := case when p_fields ? 'author_label' then nullif(btrim(coalesce(p_fields->>'author_label', '')), '') else e.author_label end;
  n_story  := case when p_fields ? 'story'        then coalesce(p_fields->>'story', '') else e.story end;
  n_ing    := case when p_fields ? 'ingredients'  then btrim(p_fields->>'ingredients') else e.ingredients end;
  n_prep   := case when p_fields ? 'preparation'  then btrim(p_fields->>'preparation') else e.preparation end;
  v_author := coalesce(n_author, 'Cadastrada pela administração');
  if (n_dish is distinct from e.dish_name or n_author is distinct from e.author_label) and exists (
       select 1 from public.recipe_book_rows() x
        where x.ref <> p_ref and x.status = 'included'
          and public.recipe_book_norm(x.dish_name) = public.recipe_book_norm(n_dish)
          and public.recipe_book_norm(x.author) = public.recipe_book_norm(v_author)) then
    perform public.campaign_raise('BOOK_DUPLICATE');
  end if;
  v_before := jsonb_build_object('dish_name', e.dish_name, 'author_label', e.author_label, 'story', e.story,
    'ingredients', e.ingredients, 'preparation', e.preparation);
  update public.recipe_book_entries
     set dish_name = n_dish, author_label = n_author, story = n_story, ingredients = n_ing, preparation = n_prep,
         updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
   where id = eid;
  perform public.campaign_audit(null, p_actor, 'BOOK_UPDATE', 'book', p_ref, v_before,
    jsonb_build_object('dish_name', n_dish, 'author_label', n_author, 'story', n_story, 'ingredients', n_ing, 'preparation', n_prep), null);
  return jsonb_build_object('ref', p_ref);
end
$$;

-- Remover do livro: so tira do ACERVO (grava/atualiza a entrada como removida). O cadastro da receita nao muda.
create or replace function public.recipe_book_remove(p_actor jsonb, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.recipe_book_row;
  e public.recipe_book_entries;
  sid uuid := public.recipe_book_ref_id(p_ref, 's');
  eid uuid := public.recipe_book_ref_id(p_ref, 'e');
  v_camp uuid;
begin
  select * into r from public.recipe_book_rows() x where x.ref = p_ref;
  if r.ref is null then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  if r.status = 'removed' then return jsonb_build_object('ref', p_ref, 'removed', false); end if;
  v_camp := r.campaign_id;
  if sid is not null then
    select * into e from public.recipe_book_entries where submission_id = sid for update;
    if e.id is null then
      insert into public.recipe_book_entries (kind, submission_id, via, status, removed_at, removed_by, removed_by_name,
                                              created_by, created_by_name, updated_by, updated_by_name)
      values ('campaign', sid, 'auto', 'removed', now(), nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''),
              nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''), nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''));
    else
      update public.recipe_book_entries
         set status = 'removed', removed_at = now(), removed_by = nullif(p_actor->>'id', '')::uuid, removed_by_name = coalesce(p_actor->>'name', ''),
             updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
       where id = e.id;
    end if;
  else
    update public.recipe_book_entries
       set status = 'removed', removed_at = now(), removed_by = nullif(p_actor->>'id', '')::uuid, removed_by_name = coalesce(p_actor->>'name', ''),
           updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
     where id = eid;
  end if;
  perform public.campaign_audit(v_camp, p_actor, 'BOOK_REMOVE', 'book', p_ref,
    jsonb_build_object('dish_name', r.dish_name, 'author', r.author), null, null);
  return jsonb_build_object('ref', p_ref, 'removed', true);
end
$$;

-- Readicionar uma receita removida
create or replace function public.recipe_book_restore(p_actor jsonb, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.recipe_book_row;
begin
  select * into r from public.recipe_book_rows() x where x.ref = p_ref;
  if r.ref is null then
    -- receita aprovada que saiu da lista por outro motivo (ex.: auto_include desligado e sem entrada): nao ha o que readicionar
    perform public.campaign_raise('BOOK_NOT_FOUND');
  end if;
  if r.status = 'included' then return jsonb_build_object('ref', p_ref, 'restored', false); end if;
  update public.recipe_book_entries
     set status = 'included', removed_at = null, removed_by = null, removed_by_name = null,
         updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
   where id = r.entry_id;
  perform public.campaign_audit(r.campaign_id, p_actor, 'BOOK_RESTORE', 'book', p_ref,
    null, jsonb_build_object('dish_name', r.dish_name, 'author', r.author), null);
  return jsonb_build_object('ref', p_ref, 'restored', true);
end
$$;

-- Foto da receita MANUAL (o arquivo ja foi enviado ao armazenamento privado e verificado pela API).
-- Devolve o caminho anterior para a API apagar o arquivo antigo.
create or replace function public.recipe_book_set_photo(p_actor jsonb, p_ref text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  eid uuid := public.recipe_book_ref_id(p_ref, 'e');
  e public.recipe_book_entries;
begin
  select * into e from public.recipe_book_entries where id = eid and kind = 'manual' for update;
  if not found then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  if p_path is not null and p_path !~ ('^recipe-book/' || eid::text || '/[A-Za-z0-9._-]+$') then
    perform public.campaign_raise('BOOK_PHOTO_INVALID');
  end if;
  update public.recipe_book_entries
     set photo_path = p_path, updated_at = now(), updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', '')
   where id = eid;
  perform public.campaign_audit(null, p_actor, case when p_path is null then 'BOOK_PHOTO_REMOVE' else 'BOOK_PHOTO_SET' end, 'book', p_ref,
    jsonb_build_object('photo', e.photo_path is not null), jsonb_build_object('photo', p_path is not null), null);
  return jsonb_build_object('previous_path', e.photo_path);
end
$$;

-- ---------------------------------------------------------------------------
-- 6) Privilegios (as funcoes novas NAO comecam com "campaign_": tratamos o prefixo recipe_book_)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'campaign\_%' or p.proname like 'recipe\_book\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;

notify pgrst, 'reload schema';
