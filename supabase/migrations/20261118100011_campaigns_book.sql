-- =============================================================================
-- Gerenciador de Campanhas — 11: Livro de Receitas da campanha
--
-- Objetivo : permitir que o administrador GERE um livro digital (snapshot das
--            receitas APROVADAS no momento da geração), confira a prévia, anexe o
--            PDF e PUBLIQUE / RETIRE a publicação. O colaborador só lê o livro
--            publicado. Publicar nunca é automático.
-- Impacto  : cria 1 tabela (campaign_books) e funções campaign_book_*; libera
--            `application/pdf` no bucket privado de campanhas. NÃO altera
--            campaign_submissions, campaign_media nem nenhuma função existente
--            (independente das migrações 9 e 10; não redefine campaign_collab_state).
-- Regras   : só receitas `approved` e finalizadas entram; versão publicada é
--            imutável (conteúdo e PDF); atualizar = gerar nova versão (rascunho),
--            conferir a prévia e publicar (a anterior vira `superseded`).
--            Rascunho substituído vira `superseded` (nada é apagado).
-- Rollback : drop table public.campaign_books cascade; drop das funções
--            campaign_book_*; (opcional) remover 'application/pdf' do bucket.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Bucket: aceita PDF (o livro gerado). Mantém os tipos e o limite atuais.
-- ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = (
         select array_agg(distinct m order by m)
           from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/pdf']) as m)
 where id = 'make-c3078087-campaigns';

-- ---------------------------------------------------------------------------
-- 2) Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_books (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns (id) on delete restrict,
  version            integer not null check (version >= 1),
  status             text not null default 'draft'
                       check (status in ('draft', 'published', 'superseded', 'withdrawn')),
  -- { recipes: [{id, position, dish_name, author, story, ingredients, preparation, content_version,
  --              media: [{kind, path}]}], excluded: [uuid] }
  snapshot           jsonb not null,
  pdf_path           text,
  pdf_size           bigint check (pdf_size is null or pdf_size >= 0),
  generated_at       timestamptz not null default now(),
  generated_by       uuid,
  generated_by_name  text not null default '',
  published_at       timestamptz,
  published_by       uuid,
  published_by_name  text,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  withdrawn_by_name  text,
  constraint campaign_books_version_unique unique (campaign_id, version),
  constraint campaign_books_snapshot_shape check (coalesce(jsonb_typeof(snapshot->'recipes'), '') = 'array')
);

-- no máximo 1 rascunho e 1 publicada por campanha
create unique index if not exists campaign_books_one_draft
  on public.campaign_books (campaign_id) where status = 'draft';
create unique index if not exists campaign_books_one_published
  on public.campaign_books (campaign_id) where status = 'published';
create index if not exists campaign_books_campaign_status on public.campaign_books (campaign_id, status);

alter table public.campaign_books enable row level security;
revoke all on table public.campaign_books from anon, authenticated, service_role;
grant select on table public.campaign_books to service_role;

-- Imutabilidade: depois de publicada (ou substituída/retirada) o conteúdo e o PDF não mudam; só o estado.
create or replace function public.campaign_books_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.campaign_raise('BOOK_IMMUTABLE');
  end if;
  if new.campaign_id is distinct from old.campaign_id or new.version is distinct from old.version then
    perform public.campaign_raise('BOOK_IMMUTABLE');
  end if;
  if old.status <> 'draft' and (
       new.snapshot is distinct from old.snapshot
    or new.pdf_path is distinct from old.pdf_path
    or new.pdf_size is distinct from old.pdf_size
    or new.generated_at is distinct from old.generated_at
    or new.generated_by is distinct from old.generated_by
  ) then
    perform public.campaign_raise('BOOK_IMMUTABLE');
  end if;
  -- só rascunho vira publicada (retirada também pode voltar a ser publicada); superseded é definitivo
  if old.status <> new.status and not (
       (old.status = 'draft'     and new.status in ('published', 'superseded'))
    or (old.status = 'published' and new.status in ('superseded', 'withdrawn'))
    or (old.status = 'withdrawn' and new.status = 'published')
  ) then
    perform public.campaign_raise('BOOK_IMMUTABLE');
  end if;
  return new;
end
$$;

drop trigger if exists campaign_books_guard_upd on public.campaign_books;
create trigger campaign_books_guard_upd before update on public.campaign_books
  for each row execute function public.campaign_books_guard();
drop trigger if exists campaign_books_guard_del on public.campaign_books;
create trigger campaign_books_guard_del before delete on public.campaign_books
  for each row execute function public.campaign_books_guard();

-- ---------------------------------------------------------------------------
-- 3) Funções
-- ---------------------------------------------------------------------------

-- Resumo de uma versão (rascunho ou publicada) no formato que a tela usa.
create or replace function public.campaign_book_meta(b public.campaign_books)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select case when b.id is null then null else jsonb_build_object(
    'version', b.version,
    'status', b.status,
    'recipes_count', jsonb_array_length(b.snapshot->'recipes'),
    'generated_at', b.generated_at,
    'generated_by_name', b.generated_by_name,
    'published_at', b.published_at,
    'published_by_name', b.published_by_name,
    'has_pdf', b.pdf_path is not null,
    'excluded', coalesce(b.snapshot->'excluded', '[]'::jsonb)
  ) end
$$;

-- Estado para o painel: quantas aprovadas, se dá para gerar, rascunho atual e versão publicada.
create or replace function public.campaign_book_state(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer;
  d public.campaign_books;
  p public.campaign_books;
begin
  perform 1 from public.campaigns where id = p_campaign;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  select count(*)::integer into n from public.campaign_submissions
   where campaign_id = p_campaign and status = 'approved' and finalized_at is not null;
  select * into d from public.campaign_books where campaign_id = p_campaign and status = 'draft';
  select * into p from public.campaign_books where campaign_id = p_campaign and status = 'published';
  return jsonb_build_object(
    'approved_count', n,
    'can_generate', n >= 1,
    'reason', case when n >= 1 then null else 'Ainda não há receitas aprovadas para montar o livro.' end,
    'draft', public.campaign_book_meta(d),
    'published', public.campaign_book_meta(p));
end
$$;

-- Gera uma NOVA versão (rascunho) com as receitas aprovadas agora; o rascunho anterior fica `superseded`.
create or replace function public.campaign_book_generate(p_actor jsonb, p_campaign uuid, p_excluded uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  old_d public.campaign_books;
  v_next integer;
  v_recipes jsonb;
  v_excluded uuid[];
  v_count integer;
  v_id uuid;
  v_replaced text;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;

  -- só considera como "excluídas" receitas aprovadas desta campanha (ignora ids soltos)
  select coalesce(array_agg(s.id order by s.id), '{}'::uuid[]) into v_excluded
    from public.campaign_submissions s
   where s.campaign_id = p_campaign and s.status = 'approved' and s.finalized_at is not null
     and s.id = any(coalesce(p_excluded, '{}'::uuid[]));

  select coalesce(jsonb_agg(r.obj order by r.pos), '[]'::jsonb), count(*)::integer
    into v_recipes, v_count
    from (
      select row_number() over (order by lower(s.dish_name), s.submitted_at nulls last, s.id) as pos,
             jsonb_build_object(
               'id', s.id,
               'position', row_number() over (order by lower(s.dish_name), s.submitted_at nulls last, s.id),
               'dish_name', s.dish_name,
               'author', s.user_name,
               'story', s.description,
               'ingredients', s.ingredients,
               'preparation', s.preparation,
               'content_version', s.content_version,
               'media', coalesce((
                  select jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.path)
                                   order by (m.kind = 'main_photo') desc, m.position, m.created_at)
                    from (
                      select * from public.campaign_media mm
                       where mm.submission_id = s.id and mm.status = 'ready' and mm.kind in ('main_photo', 'photo')
                       order by (mm.kind = 'main_photo') desc, mm.position, mm.created_at
                       limit 3
                    ) m), '[]'::jsonb)
             ) as obj
        from public.campaign_submissions s
       where s.campaign_id = p_campaign and s.status = 'approved' and s.finalized_at is not null
         and not (s.id = any(v_excluded))
    ) r;

  if v_count = 0 then perform public.campaign_raise('BOOK_NO_APPROVED'); end if;

  -- o rascunho anterior (se houver) é substituído; o PDF dele não tem mais uso
  select * into old_d from public.campaign_books where campaign_id = p_campaign and status = 'draft' for update;
  if found then
    v_replaced := old_d.pdf_path;
    update public.campaign_books set status = 'superseded', pdf_path = null, pdf_size = null where id = old_d.id;
  end if;

  select coalesce(max(version), 0) + 1 into v_next from public.campaign_books where campaign_id = p_campaign;
  insert into public.campaign_books (campaign_id, version, status, snapshot, generated_by, generated_by_name)
  values (p_campaign, v_next, 'draft',
          jsonb_build_object('recipes', v_recipes, 'excluded', to_jsonb(v_excluded)),
          nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''))
  returning id into v_id;

  perform public.campaign_audit(p_campaign, p_actor, 'GENERATE_BOOK', 'book', v_next::text,
    case when old_d.id is null then null else jsonb_build_object('replaced_draft_version', old_d.version) end,
    jsonb_build_object('version', v_next, 'recipes_count', v_count, 'excluded_count', cardinality(v_excluded)), null);
  return jsonb_build_object('version', v_next, 'recipes_count', v_count, 'replaced_pdf_path', v_replaced);
end
$$;

-- Lê uma versão (para a prévia do admin): versão informada, senão o rascunho, senão a publicada.
create or replace function public.campaign_book_get(p_campaign uuid, p_version integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare b public.campaign_books;
begin
  if p_version is not null then
    select * into b from public.campaign_books where campaign_id = p_campaign and version = p_version;
  else
    select * into b from public.campaign_books where campaign_id = p_campaign and status = 'draft';
    if not found then select * into b from public.campaign_books where campaign_id = p_campaign and status = 'published'; end if;
  end if;
  if b.id is null then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  return jsonb_build_object('version', b.version, 'status', b.status, 'generated_at', b.generated_at,
    'has_pdf', b.pdf_path is not null, 'pdf_path', b.pdf_path, 'snapshot', b.snapshot);
end
$$;

-- Anexa o PDF gerado (só em rascunho). O caminho precisa ser do próprio livro: books/{campanha}/{versão}-{id}.pdf
create or replace function public.campaign_book_attach_pdf(
  p_actor jsonb, p_campaign uuid, p_version integer, p_path text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare b public.campaign_books; v_prev text;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  select * into b from public.campaign_books where campaign_id = p_campaign and version = p_version for update;
  if not found then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  if b.status <> 'draft' then perform public.campaign_raise('BOOK_IMMUTABLE'); end if;
  if p_path is null or p_path !~ ('^books/' || p_campaign::text || '/' || p_version::text || '-[A-Za-z0-9-]+\.pdf$')
     or p_size is null or p_size <= 0 or p_size > 52428800 then
    perform public.campaign_raise('INVALID_FIELDS', 'pdf');
  end if;
  v_prev := b.pdf_path;
  update public.campaign_books set pdf_path = p_path, pdf_size = p_size where id = b.id;
  perform public.campaign_audit(p_campaign, p_actor, 'ATTACH_BOOK_PDF', 'book', p_version::text, null,
    jsonb_build_object('version', p_version, 'size', p_size), null);
  return jsonb_build_object('previous_path', case when v_prev is distinct from p_path then v_prev else null end);
end
$$;

-- Publica (rascunho ou versão retirada). Exige PDF. A versão publicada antes vira `superseded`.
create or replace function public.campaign_book_publish(p_actor jsonb, p_campaign uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare b public.campaign_books; cur public.campaign_books; v_super integer;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if p_version is null then
    select * into b from public.campaign_books where campaign_id = p_campaign and status = 'draft' for update;
  else
    select * into b from public.campaign_books where campaign_id = p_campaign and version = p_version for update;
  end if;
  if b.id is null then perform public.campaign_raise('BOOK_NOT_FOUND'); end if;
  if b.status = 'published' then perform public.campaign_raise('BOOK_ALREADY_PUBLISHED'); end if;
  if b.status = 'superseded' then perform public.campaign_raise('BOOK_IMMUTABLE'); end if;
  if b.pdf_path is null then perform public.campaign_raise('BOOK_NO_PDF'); end if;

  select * into cur from public.campaign_books where campaign_id = p_campaign and status = 'published' for update;
  if found then
    update public.campaign_books set status = 'superseded' where id = cur.id;
    v_super := cur.version;
  end if;
  update public.campaign_books
     set status = 'published', published_at = now(), published_by = nullif(p_actor->>'id', '')::uuid,
         published_by_name = coalesce(p_actor->>'name', ''), withdrawn_at = null, withdrawn_by = null, withdrawn_by_name = null
   where id = b.id;
  perform public.campaign_audit(p_campaign, p_actor, 'PUBLISH_BOOK', 'book', b.version::text,
    jsonb_build_object('status', b.status, 'superseded_version', v_super),
    jsonb_build_object('status', 'published', 'recipes_count', jsonb_array_length(b.snapshot->'recipes')), null);
  return jsonb_build_object('version', b.version, 'superseded_version', v_super);
end
$$;

-- Retira a publicação do ar (a versão continua guardada e pode ser publicada de novo).
create or replace function public.campaign_book_withdraw(p_actor jsonb, p_campaign uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare b public.campaign_books;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  select * into b from public.campaign_books
   where campaign_id = p_campaign and status = 'published' and (p_version is null or version = p_version) for update;
  if not found then perform public.campaign_raise('BOOK_NOT_PUBLISHED'); end if;
  update public.campaign_books
     set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = nullif(p_actor->>'id', '')::uuid,
         withdrawn_by_name = coalesce(p_actor->>'name', '')
   where id = b.id;
  perform public.campaign_audit(p_campaign, p_actor, 'WITHDRAW_BOOK', 'book', b.version::text,
    jsonb_build_object('status', 'published'), jsonb_build_object('status', 'withdrawn'), null);
  return jsonb_build_object('version', b.version);
end
$$;

-- Há livro publicado? (usado para mostrar o item "Livro de Receitas" ao colaborador)
create or replace function public.campaign_book_is_published(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.campaign_books where campaign_id = p_campaign and status = 'published')
$$;

-- Leitura do COLABORADOR: só o livro publicado, só se a campanha é visível para a pessoa e ela é elegível.
-- Qualquer outro caso é BOOK_UNAVAILABLE (não revela se existe rascunho/retirado).
create or replace function public.campaign_book_reader(p_campaign uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare b public.campaign_books;
begin
  if p_user is null
     or not public.campaign_is_visible(p_campaign)
     or not public.campaign_user_eligible(p_campaign, p_user) then
    perform public.campaign_raise('BOOK_UNAVAILABLE');
  end if;
  select * into b from public.campaign_books where campaign_id = p_campaign and status = 'published';
  if b.id is null or b.pdf_path is null then perform public.campaign_raise('BOOK_UNAVAILABLE'); end if;
  return jsonb_build_object('version', b.version, 'generated_at', b.generated_at, 'published_at', b.published_at,
    'pdf_path', b.pdf_path, 'pdf_size', b.pdf_size, 'snapshot', b.snapshot);
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Privilégios (mesma regra das migrações anteriores)
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
