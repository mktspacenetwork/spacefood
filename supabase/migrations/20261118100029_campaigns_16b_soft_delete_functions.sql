-- =============================================================================
-- Campanhas - "Excluir campanha" = OCULTAR (peça 16b): funções campaign_soft_delete e campaign_restore
--
-- campaign_soft_delete(p_actor, p_campaign, p_confirm): só campanha FORA DO AR (rascunho, despublicada, encerrada ou arquivada).
--   Campanha no ar (publicada e não suspensa) -> CAMPAIGN_LIVE. A confirmação é o NOME da campanha digitado (sem diferenciar
--   maiúsculas/minúsculas nem espaços nas pontas) -> CONFIRM_MISMATCH se não bater. Já excluída -> INVALID_STATE.
--   Só marca deleted_at/deleted_by e grava a auditoria DELETE_CAMPAIGN; NADA é apagado.
-- campaign_restore(p_actor, p_campaign): limpa deleted_at; auditoria RESTORE_CAMPAIGN. Não excluída -> INVALID_STATE.
-- Rollback : drop function public.campaign_soft_delete(jsonb, uuid, text); drop function public.campaign_restore(jsonb, uuid);
-- Idempotente: create or replace.
-- =============================================================================
create or replace function public.campaign_soft_delete(p_actor jsonb, p_campaign uuid, p_confirm text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.deleted_at is not null then perform public.campaign_raise('INVALID_STATE', 'deleted'); end if;
  if c.status = 'authorized' and c.suspended_at is null then perform public.campaign_raise('CAMPAIGN_LIVE'); end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(c.name)) then perform public.campaign_raise('CONFIRM_MISMATCH'); end if;
  update public.campaigns
     set deleted_at = now(), deleted_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
   where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'DELETE_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status, 'name', c.name, 'suspended', c.suspended_at is not null),
    jsonb_build_object('deleted', true), null);
end
$$;

create or replace function public.campaign_restore(p_actor jsonb, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.deleted_at is null then perform public.campaign_raise('INVALID_STATE', 'not_deleted'); end if;
  update public.campaigns set deleted_at = null, deleted_by = null, updated_at = now() where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'RESTORE_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('deleted', true), jsonb_build_object('deleted', false, 'status', c.status), null);
end
$$;

revoke all on function public.campaign_soft_delete(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.campaign_soft_delete(jsonb, uuid, text) to service_role;
revoke all on function public.campaign_restore(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.campaign_restore(jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
