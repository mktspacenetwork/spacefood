-- =============================================================================
-- Campanhas - rodada 6, peça 17a (COMPORTAMENTAL): bloqueio de envio/edição quando a VOTAÇÃO começa
--
-- Objetivo : a receita FORA DO PRAZO só é aceita ENTRE o fim da participação e o INÍCIO da votação. Quando a votação começa
--            (etapa `voting` com início já passado, aberta, pausada depois de começar ou encerrada), nada mais entra nem é
--            editado — e continua assim depois que ela encerra. campaign_late_window() (14a1) ganha a condição
--            "a votação AINDA NÃO começou". Como campaign_submit, campaign_finalize_submission, campaign_update_submission e
--            campaign_collab_state já usam essa função, o bloqueio se propaga (REGISTRATION_CLOSED; can_submit, can_edit e
--            late_window falsos). A análise (aprovar/reprovar) de receita atrasada NÃO depende mais desta janela: ver peça 17b.
-- Impacto  : recria somente campaign_late_window. Campanhas ANTIGAS de janela única (participação e votação simultâneas):
--            com a participação aberta, nada muda (a função só vale com a participação ENCERRADA); depois do fim a votação
--            já começou, então não há mais atraso (a votação terminou junto). Dados e auditoria intactos.
-- Rollback : restaurar a definição anterior (snapshot de supabase/rollback/17_snapshot_query.sql ou a 14a1) — a regra volta a
--            valer "até a divulgação do resultado".
-- Idempotente: create or replace.
-- =============================================================================

create or replace function public.campaign_late_window(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select public.campaign_feat(c.features, 'voting')
       and public.campaign_stage_state(c.id, 'registration') = 'closed'
       and public.campaign_is_released(c.id)
       and coalesce((select r.status from public.campaign_results r where r.campaign_id = c.id), 'none') <> 'announced'
       -- a votação ainda NÃO começou (pausada depois de começar também conta como começada)
       and not exists (select 1 from public.campaign_stages s
                        where s.campaign_id = c.id and s.stage_key = 'voting'
                          and s.starts_at is not null and s.starts_at <= now())
      from public.campaigns c
     where c.id = p_campaign
  ), false)
$$;

revoke all on function public.campaign_late_window(uuid) from public, anon, authenticated;
grant execute on function public.campaign_late_window(uuid) to service_role;
