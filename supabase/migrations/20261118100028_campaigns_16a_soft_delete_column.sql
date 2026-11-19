-- =============================================================================
-- Campanhas - "Excluir campanha" = OCULTAR (peça 16a, ADITIVA): coluna + trava
--
-- Objetivo : permitir que o administrador "exclua" uma campanha fora do ar SEM apagar nada: ela fica oculta (deleted_at)
--            e dá para restaurar. Receitas, fotos, votos, resultados e auditoria continuam guardados (imutáveis).
-- Impacto  : coluna nova campaigns.deleted_at (nula para todas) + deleted_by; gatilho que impede QUALQUER alteração numa
--            campanha excluída enquanto ela estiver excluída (só a restauração passa). Nenhuma função existente é alterada.
--            Como excluir só é permitido para campanha fora do ar e a campanha excluída não pode mais ser alterada, ela nunca
--            volta a ser publicada/retomada sem antes ser restaurada.
-- Rollback : drop trigger campaign_deleted_guard_upd on public.campaigns; drop function public.campaign_deleted_guard();
--            (a coluna pode ficar: é inofensiva; campanhas excluídas voltariam às listas se a API for revertida).
-- Idempotente: pode ser reaplicada.
-- =============================================================================
alter table public.campaigns add column if not exists deleted_at timestamptz;
alter table public.campaigns add column if not exists deleted_by uuid;

comment on column public.campaigns.deleted_at is
  'Campanha EXCLUÍDA = oculta das listas e do site. Nada é apagado (receitas, votos, auditoria ficam); restaurar limpa o campo.';

create or replace function public.campaign_deleted_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- só a restauração (deleted_at passa de preenchido a nulo) pode alterar uma campanha excluída
  raise exception using errcode = 'P0001', message = 'CAMPAIGN_DELETED';
end
$$;

drop trigger if exists campaign_deleted_guard_upd on public.campaigns;
create trigger campaign_deleted_guard_upd
  before update on public.campaigns
  for each row when (old.deleted_at is not null and new.deleted_at is not null)
  execute function public.campaign_deleted_guard();

revoke all on function public.campaign_deleted_guard() from public, anon, authenticated;

notify pgrst, 'reload schema';
