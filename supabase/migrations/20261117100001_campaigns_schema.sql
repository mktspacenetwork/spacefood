-- =============================================================================
-- Gerenciador de Campanhas — 1/5: esquema (tabelas, restrições e índices)
--
-- Objetivo : criar as tabelas do módulo de campanhas.
-- Impacto  : SOMENTE objetos novos (prefixo campaign_). Não altera nem lê
--            nenhuma tabela existente (kv_store_*, fp_*, auth.*, storage.*).
-- Segurança: RLS e privilégios são aplicados na migração 5/5.
-- Rollback : drop table if exists public.campaign_* cascade (somente se não
--            houver dado real; ver supabase/dev/ROLLBACK_campaigns.sql).
-- Nota     : user_id/voter_id = auth.users.id SEM chave estrangeira, de
--            propósito: o app já exclui usuários via auth.admin.deleteUser e
--            um FK com RESTRICT quebraria essa funcionalidade existente.
-- =============================================================================

-- Chave global de lançamento (uma linha). Desligada por padrão.
create table if not exists public.campaign_settings (
  id          smallint primary key default 1 check (id = 1),
  enabled     boolean not null default false,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
insert into public.campaign_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;

-- Acesso administrativo do módulo (lista própria, controlada só pelo servidor).
-- O papel "admin" do site vem de user_metadata, que o próprio usuário consegue
-- editar; por isso o módulo NÃO confia nele e usa esta lista.
create table if not exists public.campaign_admins (
  user_id     uuid primary key,
  user_name   text not null default '',
  permissions jsonb not null default '{}'::jsonb,
  added_by    uuid,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique
                       check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  type               text not null check (type in ('recipe_contest')),
  name               text not null check (length(btrim(name)) between 3 and 120),
  description        text not null default '',
  objective          text not null default '',
  instructions       text not null default '',
  cover_path         text,
  status             text not null default 'draft'
                       check (status in ('draft','in_review','authorized','closed','archived')),
  audience           jsonb not null default '{"mode":"all"}'::jsonb,
  features           jsonb not null default '{"submission":true,"photos":true,"video":true,"approval":true,"gallery":true,"voting":true,"ranking":true,"results":true,"announcement":true,"tour":{"enabled":true,"version":1}}'::jsonb,
  visibility         jsonb not null default '{"ranking_mode":"hidden_until_confirmed","gallery_visibility":"on_approval","show_podium":false,"allow_preview":false}'::jsonb,
  media_limits       jsonb not null default '{"max_photos":5,"max_photo_mb":5,"allow_video":true,"max_video_mb":50,"require_main_photo":false}'::jsonb,
  visible_from       timestamptz,
  authorized_at      timestamptz,   -- = momento da publicação
  authorized_by      uuid,
  suspended_at       timestamptz,
  suspended_by       uuid,
  edit_locked_at     timestamptz,   -- gravado quando a votação inicia; nunca é limpo
  closed_at          timestamptz,
  archived_at        timestamptz,
  source_campaign_id uuid,
  created_by         uuid not null,
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_by         uuid,
  updated_at         timestamptz not null default now(),
  version            integer not null default 1,
  constraint campaigns_authorized_has_timestamp
    check (status <> 'authorized' or authorized_at is not null)
);

create table if not exists public.campaign_eligible_users (
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  user_id     uuid not null,
  added_by    uuid,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_stages (
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  stage_key   text not null check (stage_key in ('registration','voting','results','announcement')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  paused      boolean not null default false,
  paused_at   timestamptz,
  paused_by   uuid,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, stage_key),
  constraint campaign_stages_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.campaign_submissions (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete restrict,
  user_id          uuid not null,
  user_name        text not null,
  user_unit        text not null default '',
  user_department  text not null default '',
  dish_name        text not null check (length(btrim(dish_name)) between 3 and 120),
  description      text not null check (length(btrim(description)) between 10 and 600),
  ingredients      text not null check (length(btrim(ingredients)) between 5 and 3000),
  preparation      text not null check (length(btrim(preparation)) between 10 and 6000),
  status           text not null default 'pending_media'
                     check (status in ('pending_media','submitted','in_review','approved','rejected')),
  rejection_reason text,
  reviewed_by      uuid,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  content_version  integer not null default 1,
  created_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  finalized_at     timestamptz,
  updated_at       timestamptz not null default now(),
  -- 1 receita por colaborador por campanha (garantia no banco)
  constraint campaign_submissions_one_per_user unique (campaign_id, user_id),
  -- permite FK composta (voto/mídia só apontam para receita da MESMA campanha)
  constraint campaign_submissions_id_campaign unique (id, campaign_id),
  constraint campaign_submissions_reject_reason
    check (status <> 'rejected' or (rejection_reason is not null and length(btrim(rejection_reason)) >= 10))
);

create table if not exists public.campaign_media (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  campaign_id   uuid not null,
  kind          text not null check (kind in ('main_photo','photo','video')),
  bucket        text not null default 'make-c3078087-campaigns',
  path          text not null unique,
  mime          text not null,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  status        text not null default 'pending' check (status in ('pending','ready','removed')),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  finalized_at  timestamptz,
  removed_at    timestamptz,
  constraint campaign_media_submission_fk
    foreign key (submission_id, campaign_id)
    references public.campaign_submissions (id, campaign_id) on delete restrict
);

create table if not exists public.campaign_votes (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null,
  submission_id       uuid not null,
  voter_id            uuid not null,
  voter_name          text not null default '',
  created_at          timestamptz not null default now(),
  invalidated_at      timestamptz,
  invalidated_by      uuid,
  invalidated_by_name text,
  invalidation_reason text,
  constraint campaign_votes_submission_fk
    foreign key (submission_id, campaign_id)
    references public.campaign_submissions (id, campaign_id) on delete restrict,
  -- 1 voto por colaborador por campanha (inclui votos invalidados: invalidar
  -- não devolve o direito de votar)
  constraint campaign_votes_one_per_voter unique (campaign_id, voter_id),
  constraint campaign_votes_invalidation_reason
    check (invalidated_at is null or (invalidation_reason is not null and length(btrim(invalidation_reason)) >= 10))
);

create table if not exists public.campaign_results (
  campaign_id                uuid primary key references public.campaigns(id) on delete restrict,
  status                     text not null default 'none'
                               check (status in ('none','preliminary','tie_pending','confirmed','announced')),
  computed_at                timestamptz,
  tally                      jsonb not null default '[]'::jsonb,
  total_valid_votes          integer not null default 0,
  eligible_count             integer not null default 0,
  voters_count               integer not null default 0,
  tie_candidates             uuid[] not null default '{}',
  tie_decision_submission_id uuid,
  tie_justification          text,
  tie_decided_by             uuid,
  tie_decided_at             timestamptz,
  winner_submission_id       uuid,
  winner_votes               integer,
  confirmed_by               uuid,
  confirmed_by_name          text,
  confirmed_at               timestamptz,
  announced_by               uuid,
  announced_at               timestamptz,
  constraint campaign_results_tie_reason
    check (tie_decision_submission_id is null
           or (tie_justification is not null and length(btrim(tie_justification)) >= 10))
);

create table if not exists public.campaign_audit_log (
  id          bigint generated always as identity primary key,
  campaign_id uuid,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null default '',
  actor_role  text not null default '',
  ip          text not null default '',
  action      text not null,
  entity_type text not null default '',
  entity_id   text not null default '',
  before      jsonb,
  after       jsonb,
  reason      text
);

create table if not exists public.campaign_notification_log (
  id          bigint generated always as identity primary key,
  campaign_id uuid not null,
  user_id     uuid not null,
  event_key   text not null,
  entity_id   text not null default '',
  created_at  timestamptz not null default now(),
  inbox_ok    boolean,
  push_ok     boolean,
  error       text,
  -- sem notificação duplicada para o mesmo evento
  constraint campaign_notification_unique unique (campaign_id, user_id, event_key, entity_id)
);

create index if not exists campaign_submissions_campaign_status_idx on public.campaign_submissions (campaign_id, status);
create index if not exists campaign_submissions_user_idx           on public.campaign_submissions (user_id);
create index if not exists campaign_media_submission_idx           on public.campaign_media (submission_id);
create unique index if not exists campaign_media_one_main_photo    on public.campaign_media (submission_id) where kind = 'main_photo' and status <> 'removed';
create unique index if not exists campaign_media_one_video         on public.campaign_media (submission_id) where kind = 'video' and status <> 'removed';
create index if not exists campaign_votes_tally_idx                on public.campaign_votes (campaign_id, submission_id) where invalidated_at is null;
create index if not exists campaign_audit_campaign_time_idx        on public.campaign_audit_log (campaign_id, occurred_at desc);
create index if not exists campaign_stages_campaign_idx            on public.campaign_stages (campaign_id);
