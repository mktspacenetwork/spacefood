-- =============================================================================
-- Campanhas - "Excluir campanha" COM MOTIVO (peça 20a): nova versão de campaign_soft_delete com p_reason
--
-- campaign_soft_delete(p_actor, p_campaign, p_confirm, p_reason): igual à versão de 3 argumentos (peça 16b) e, além disso,
--   exige o MOTIVO da exclusão (5 a 500 caracteres, sem contar espaços nas pontas) e o grava na auditoria (coluna `reason`
--   de campaign_audit_log), junto de quem excluiu (actor_id/actor_name), a campanha (campaign_id), o estado em que ela estava
--   (`before`) e a data/hora (`occurred_at`). Motivo ausente/curto/longo -> INVALID_FIELDS ('reason').
--   Continua sendo exclusão LÓGICA (marca deleted_at/deleted_by); nada é apagado e dá para restaurar.
--   A versão de 3 argumentos NÃO é removida (a API anterior continua funcionando durante a troca; a nova API exige o motivo).
--   Só o service_role executa (a API); anon/authenticated não têm acesso.
-- Rollback : drop function public.campaign_soft_delete(jsonb, uuid, text, text);
-- Idempotente: create or replace.
-- =============================================================================
create or replace function public.campaign_soft_delete(p_actor jsonb, p_campaign uuid, p_confirm text, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.deleted_at is not null then perform public.campaign_raise('INVALID_STATE', 'deleted'); end if;
  if c.status = 'authorized' and c.suspended_at is null then perform public.campaign_raise('CAMPAIGN_LIVE'); end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(c.name)) then perform public.campaign_raise('CONFIRM_MISMATCH'); end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then perform public.campaign_raise('INVALID_FIELDS', 'reason'); end if;
  update public.campaigns
     set deleted_at = now(), deleted_by = nullif(p_actor->>'id', '')::uuid, updated_at = now()
   where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'DELETE_CAMPAIGN', 'campaign', p_campaign::text,
    jsonb_build_object('status', c.status, 'name', c.name, 'suspended', c.suspended_at is not null),
    jsonb_build_object('deleted', true), v_reason);
end
$$;

revoke all on function public.campaign_soft_delete(jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.campaign_soft_delete(jsonb, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
