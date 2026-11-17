-- =============================================================================
-- Gerenciador de Campanhas — 5/5: RLS e privilégios
--
-- Objetivo : nenhum cliente (anon/authenticated) acessa estas tabelas nem
--            funções. Só a Edge Function (service_role) lê as tabelas e chama
--            as funções; toda gravação passa pelas funções SECURITY DEFINER.
--            O service_role NÃO tem INSERT/UPDATE/DELETE direto nas tabelas.
-- Impacto  : somente objetos campaign_*.
-- =============================================================================

alter table public.campaign_settings          enable row level security;
alter table public.campaign_admins            enable row level security;
alter table public.campaigns                  enable row level security;
alter table public.campaign_eligible_users    enable row level security;
alter table public.campaign_stages            enable row level security;
alter table public.campaign_submissions       enable row level security;
alter table public.campaign_media             enable row level security;
alter table public.campaign_votes             enable row level security;
alter table public.campaign_results           enable row level security;
alter table public.campaign_audit_log         enable row level security;
alter table public.campaign_notification_log  enable row level security;

revoke all on table
  public.campaign_settings, public.campaign_admins, public.campaigns,
  public.campaign_eligible_users, public.campaign_stages, public.campaign_submissions,
  public.campaign_media, public.campaign_votes, public.campaign_results,
  public.campaign_audit_log, public.campaign_notification_log
from anon, authenticated, service_role;

grant select on table
  public.campaign_settings, public.campaign_admins, public.campaigns,
  public.campaign_eligible_users, public.campaign_stages, public.campaign_submissions,
  public.campaign_media, public.campaign_votes, public.campaign_results,
  public.campaign_audit_log, public.campaign_notification_log
to service_role;

-- Funções: sem EXECUTE para ninguém, exceto service_role.
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

-- Atualiza o cache de esquema da API (PostgREST) para enxergar as funções novas.
notify pgrst, 'reload schema';
