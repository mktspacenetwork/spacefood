-- =============================================================================
-- Campanhas - "Excluir campanha" também para CONCLUÍDA por fim de período (peça 21b)
--
-- Uma campanha que chegou ao fim normalmente (período acabou e, havendo votação, o resultado foi divulgado) continua com status
-- 'authorized' e sem suspensão; por isso campaign_soft_delete a tratava como "no ar" (CAMPAIGN_LIVE) e não deixava excluir. No Histórico
-- ela é "Concluída". Agora a função aceita `p_allow_ended` (padrão false): só a API passa true, e só depois de calcular, no servidor, que
-- a campanha é Concluída por fim de período (mesma regra do Histórico). Campanha realmente no ar, ou ainda em apuração, segue recusada.
-- O resto é igual à versão da peça 20a (motivo obrigatório de 5 a 500 caracteres, nome digitado, auditoria com o motivo).
-- A versão de 4 argumentos é substituída por esta de 5 (com padrão): quem chama com 4 argumentos nomeados continua funcionando.
-- A versão de 3 argumentos (peça 16b) NÃO é tocada.
-- Rollback : recriar a versão de 4 argumentos da peça 20a (supabase/migrations/..._20a_...) depois de
--            drop function public.campaign_soft_delete(jsonb, uuid, text, text, boolean);
-- Idempotente.
-- =============================================================================
drop function if exists public.campaign_soft_delete(jsonb, uuid, text, text);

create or replace function public.campaign_soft_delete(
  p_actor jsonb, p_campaign uuid, p_confirm text, p_reason text, p_allow_ended boolean default false
)
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
  if c.status = 'authorized' and c.suspended_at is null and not coalesce(p_allow_ended, false) then perform public.campaign_raise('CAMPAIGN_LIVE'); end if;
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

revoke all on function public.campaign_soft_delete(jsonb, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.campaign_soft_delete(jsonb, uuid, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
