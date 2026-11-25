-- =============================================================================
-- Campanhas - "Remover do histórico" (peça 21a): campanha JÁ EXCLUÍDA deixa de aparecer no Histórico de campanhas
--
-- campaign_history_hidden: uma linha por campanha removida do Histórico (quem, quando e o MOTIVO). NADA é apagado: a campanha continua
--   marcada como excluída (deleted_at), com receitas, votos, resultados e auditoria intactos. A tabela é separada de `campaigns` de
--   propósito: o gatilho campaign_deleted_guard bloqueia qualquer alteração da linha de uma campanha excluída, e assim ela nem é tocada.
--   RLS ligado, sem acesso para anon/authenticated; o service_role só LÊ (a escrita passa pela função abaixo).
--
-- campaign_history_hide(p_actor, p_campaign, p_confirm, p_reason): só campanha JÁ EXCLUÍDA (senão INVALID_STATE 'not_deleted'); já removida
--   -> INVALID_STATE 'hidden'; o nome digitado precisa bater (CONFIRM_MISMATCH); motivo de 5 a 500 caracteres (INVALID_FIELDS 'reason').
--   Auditoria HIDE_FROM_HISTORY com o motivo, o administrador (id e nome), a campanha e a data/hora (`occurred_at`).
-- Rollback : drop function public.campaign_history_hide(jsonb, uuid, text, text); drop table public.campaign_history_hidden;
-- Idempotente: create ... if not exists / create or replace.
-- =============================================================================
create table if not exists public.campaign_history_hidden (
  campaign_id uuid primary key references public.campaigns(id),
  hidden_at   timestamptz not null default now(),
  hidden_by   uuid,
  reason      text not null
);

alter table public.campaign_history_hidden enable row level security;
revoke all on table public.campaign_history_hidden from public, anon, authenticated;
grant select on table public.campaign_history_hidden to service_role;

comment on table public.campaign_history_hidden is
  'Campanhas EXCLUÍDAS removidas do Histórico de campanhas (com motivo). Nada é apagado; a campanha segue excluída e guardada.';

create or replace function public.campaign_history_hide(p_actor jsonb, p_campaign uuid, p_confirm text, p_reason text)
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
  if c.deleted_at is null then perform public.campaign_raise('INVALID_STATE', 'not_deleted'); end if;
  if exists (select 1 from public.campaign_history_hidden h where h.campaign_id = p_campaign) then
    perform public.campaign_raise('INVALID_STATE', 'hidden');
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(c.name)) then perform public.campaign_raise('CONFIRM_MISMATCH'); end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then perform public.campaign_raise('INVALID_FIELDS', 'reason'); end if;
  insert into public.campaign_history_hidden (campaign_id, hidden_by, reason)
  values (p_campaign, nullif(p_actor->>'id', '')::uuid, v_reason);
  perform public.campaign_audit(p_campaign, p_actor, 'HIDE_FROM_HISTORY', 'campaign', p_campaign::text,
    jsonb_build_object('deleted', true, 'name', c.name),
    jsonb_build_object('history_hidden', true), v_reason);
end
$$;

revoke all on function public.campaign_history_hide(jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.campaign_history_hide(jsonb, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
