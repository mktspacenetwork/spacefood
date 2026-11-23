-- =============================================================================
-- Campanhas - rodada 6, peça 19a (ADITIVA): proveniência das fotos da INTERNET
--
-- Objetivo : guardar de onde veio uma foto escolhida na busca da internet (hoje só Wikimedia Commons): título do arquivo, autor,
--            licença, link da licença e página de origem — o crédito é a condição de uso das licenças livres e aparece junto da
--            foto ("Foto da internet"). Uma linha por mídia (campaign_media.id); fotos enviadas do aparelho não têm linha.
-- Impacto  : 1 tabela nova (RLS ligado, sem grants a anon/authenticated; service_role só lê) + campaign_media_web_set(), que
--            a API chama logo depois de criar a mídia. Nenhuma tabela/função existente é alterada.
-- Rollback : drop function public.campaign_media_web_set(uuid, jsonb); drop table public.campaign_media_web.
-- Idempotente: pode ser reaplicada.
-- =============================================================================

create table if not exists public.campaign_media_web (
  media_id    uuid primary key references public.campaign_media (id) on delete restrict,
  provider    text not null check (provider in ('wikimedia')),
  title       text not null check (length(title) between 1 and 300),
  creator     text not null default '' check (length(creator) <= 300),
  license     text not null check (length(license) between 1 and 120),
  license_url text check (license_url is null or license_url ~ '^https://'),
  source_url  text not null check (source_url ~ '^https://' and length(source_url) <= 600),
  created_at  timestamptz not null default now()
);

alter table public.campaign_media_web enable row level security;
revoke all on table public.campaign_media_web from anon, authenticated, service_role;
grant select on table public.campaign_media_web to service_role;

-- p_info: {provider, title, creator, license, license_url, source_url}. Só aceita mídia de FOTO ainda não removida; regravar a
-- mesma mídia é idempotente (atualiza o crédito). Os valores já chegam limpos (texto puro) da API, mas são conferidos aqui.
create or replace function public.campaign_media_web_set(p_media uuid, p_info jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  m public.campaign_media;
begin
  select * into m from public.campaign_media where id = p_media;
  if not found or m.status = 'removed' or m.kind not in ('main_photo', 'photo') then
    perform public.campaign_raise('INVALID_FIELDS', 'media');
  end if;
  if coalesce(p_info->>'provider', '') <> 'wikimedia' or length(btrim(coalesce(p_info->>'title', ''))) = 0
     or length(btrim(coalesce(p_info->>'license', ''))) = 0 or coalesce(p_info->>'source_url', '') !~ '^https://' then
    perform public.campaign_raise('INVALID_FIELDS', 'web');
  end if;
  insert into public.campaign_media_web (media_id, provider, title, creator, license, license_url, source_url)
  values (p_media, p_info->>'provider', left(btrim(p_info->>'title'), 300), left(btrim(coalesce(p_info->>'creator', '')), 300),
          left(btrim(p_info->>'license'), 120),
          case when coalesce(p_info->>'license_url', '') ~ '^https://' then left(btrim(p_info->>'license_url'), 600) else null end,
          left(p_info->>'source_url', 600))
  on conflict (media_id) do update
     set title = excluded.title, creator = excluded.creator, license = excluded.license,
         license_url = excluded.license_url, source_url = excluded.source_url;
end
$$;

revoke all on function public.campaign_media_web_set(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_media_web_set(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
