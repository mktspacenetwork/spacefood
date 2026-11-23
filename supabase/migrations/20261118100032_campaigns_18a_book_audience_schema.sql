-- =============================================================================
-- Campanhas - rodada 6, peça 18a (ADITIVA): público do Livro de Receitas - estrutura
--
-- Objetivo : o Livro (global) passa a respeitar um PÚBLICO definido pelo administrador: Todos os colaboradores (padrão = o
--            comportamento de hoje) OU apenas pessoas específicas. Esta peça só cria a estrutura:
--            (a) recipe_book_settings.audience_mode ('all' | 'users', padrão 'all': nenhuma linha muda de comportamento);
--            (b) recipe_book_audience_users: as pessoas do público (usada só no modo 'users').
-- Impacto  : 1 coluna com padrão + 1 tabela nova (RLS ligado, sem grants a anon/authenticated; service_role só lê).
--            Nenhuma função existente é alterada; o livro continua NÃO publicado até o administrador publicar.
-- Rollback : inofensiva (modo 'all' = como antes). Para desfazer: drop table public.recipe_book_audience_users;
--            alter table public.recipe_book_settings drop column audience_mode.
-- Idempotente: pode ser reaplicada.
-- =============================================================================

alter table public.recipe_book_settings
  add column if not exists audience_mode text not null default 'all';

alter table public.recipe_book_settings drop constraint if exists recipe_book_settings_audience_mode_chk;
alter table public.recipe_book_settings
  add constraint recipe_book_settings_audience_mode_chk check (audience_mode in ('all', 'users'));

create table if not exists public.recipe_book_audience_users (
  user_id  uuid primary key,
  added_by uuid,
  added_at timestamptz not null default now()
);

alter table public.recipe_book_audience_users enable row level security;
revoke all on table public.recipe_book_audience_users from anon, authenticated, service_role;
grant select on table public.recipe_book_audience_users to service_role;

notify pgrst, 'reload schema';
