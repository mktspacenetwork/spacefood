-- =============================================================================
-- Campanhas - EXCLUIR RECEITA REPROVADA (peça 22a): pelo próprio colaborador ou pela administração
--
-- Problema: uma receita reprovada continuava ocupando a vaga da pessoa (campaign_submit conta as linhas de campaign_submissions e a
-- trava UNIQUE (campaign_id, user_id, slot) impede outra), então ela só podia corrigir e reenviar a mesma. Editar já existia
-- (campaign_update_submission devolve a receita reprovada para "em análise"); faltava EXCLUIR.
--
-- Como (decisão de projeto: nada se perde): a receita não é apagada; ela é MOVIDA para campaign_submissions_deleted, junto das linhas de mídia
-- e da proveniência de foto da internet, e sai das tabelas ativas. Assim a vaga volta SEM mexer em nenhuma das ~23 funções que leem
-- campaign_submissions (contagens, participantes, analytics, votação, Livro). A auditoria DELETE_SUBMISSION guarda quem, quando, o motivo
-- (administração) e um resumo. Os arquivos de foto continuam no bucket (o caminho fica no arquivo morto).
--
-- campaign_delete_submission(p_actor, p_campaign, p_submission, p_user, p_reason):
--   · p_user preenchido = o PRÓPRIO COLABORADOR (só a sua receita; mesmas portas da edição: campanha liberada, participação aberta ou
--     janela de envio atrasado da receita);
--   · p_user nulo       = ADMINISTRAÇÃO (qualquer receita da campanha; motivo obrigatório de 5 a 500 caracteres; campanha encerrada
--     ou arquivada recusa; a API só chama com a permissão campaigns_review).
--   Em ambos: SÓ receita com status 'rejected' (senão INVALID_STATE 'not_rejected'); voto ou Livro apontando para ela recusam
--   (HAS_VOTES / INVALID_STATE 'in_book') por segurança; campanha excluída recusa (CAMPAIGN_DELETED).
-- Só o service_role executa. Tabela nova: RLS ligado, service_role só LÊ (regra do módulo).
-- Rollback : drop function public.campaign_delete_submission(jsonb, uuid, uuid, uuid, text);
--            (a tabela campaign_submissions_deleted NÃO deve ser apagada: guarda receitas excluídas)
-- Idempotente.
-- =============================================================================
create table if not exists public.campaign_submissions_deleted (
  submission_id   uuid primary key,
  campaign_id     uuid not null references public.campaigns(id),
  user_id         uuid not null,
  snapshot        jsonb not null,
  media           jsonb not null default '[]'::jsonb,
  media_web       jsonb not null default '[]'::jsonb,
  deleted_at      timestamptz not null default now(),
  deleted_by      uuid,
  deleted_by_name text not null default '',
  deleted_by_role text not null,
  reason          text
);

create index if not exists campaign_submissions_deleted_campaign_idx on public.campaign_submissions_deleted (campaign_id);
create index if not exists campaign_submissions_deleted_user_idx on public.campaign_submissions_deleted (user_id);

alter table public.campaign_submissions_deleted enable row level security;
revoke all on table public.campaign_submissions_deleted from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.campaign_submissions_deleted from service_role;
grant select on table public.campaign_submissions_deleted to service_role;

comment on table public.campaign_submissions_deleted is
  'Receitas REPROVADAS excluídas (pelo autor ou pela administração). Guardadas inteiras (linha + mídia); saem das tabelas ativas para liberar a vaga da pessoa.';

create or replace function public.campaign_delete_submission(
  p_actor jsonb, p_campaign uuid, p_submission uuid, p_user uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  s public.campaign_submissions;
  v_admin boolean := (p_user is null);
  v_reason text := btrim(coalesce(p_reason, ''));
  reg text;
  v_media jsonb;
  v_web jsonb;
begin
  select * into s from public.campaign_submissions
   where id = p_submission and campaign_id = p_campaign and (v_admin or user_id = p_user) for update;
  if not found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if c.deleted_at is not null then perform public.campaign_raise('CAMPAIGN_DELETED'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  if s.status <> 'rejected' then perform public.campaign_raise('INVALID_STATE', 'not_rejected'); end if;

  if v_admin then
    if char_length(v_reason) < 5 or char_length(v_reason) > 500 then perform public.campaign_raise('INVALID_FIELDS', 'reason'); end if;
  else
    -- o autor: mesmas portas da edição da receita
    if not public.campaign_is_released(p_campaign) then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
    reg := public.campaign_stage_state(p_campaign, 'registration');
    if reg = 'paused' then perform public.campaign_raise('REGISTRATION_PAUSED'); end if;
    if reg <> 'open' then
      if not (reg = 'closed' and (s.is_late or s.finalized_at is null) and public.campaign_late_window(p_campaign)) then
        perform public.campaign_raise('REGISTRATION_CLOSED');
      end if;
    end if;
  end if;

  -- salvaguardas: uma receita reprovada não tem voto nem está no Livro; se algo apontar para ela, não mexe
  if exists (select 1 from public.campaign_votes v where v.submission_id = p_submission) then perform public.campaign_raise('HAS_VOTES'); end if;
  if exists (select 1 from public.recipe_book_entries e where e.submission_id = p_submission) then perform public.campaign_raise('INVALID_STATE', 'in_book'); end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.position, m.created_at), '[]'::jsonb) into v_media
    from public.campaign_media m where m.submission_id = p_submission;
  select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) into v_web
    from public.campaign_media_web w where w.media_id in (select m.id from public.campaign_media m where m.submission_id = p_submission);

  insert into public.campaign_submissions_deleted
    (submission_id, campaign_id, user_id, snapshot, media, media_web, deleted_by, deleted_by_name, deleted_by_role, reason)
  values
    (s.id, s.campaign_id, s.user_id, to_jsonb(s), v_media, v_web,
     nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''), case when v_admin then 'admin' else 'user' end,
     nullif(v_reason, ''));

  delete from public.campaign_media_web where media_id in (select m.id from public.campaign_media m where m.submission_id = p_submission);
  delete from public.campaign_media where submission_id = p_submission;
  delete from public.campaign_submissions where id = p_submission;

  perform public.campaign_audit(p_campaign, p_actor, 'DELETE_SUBMISSION', 'submission', p_submission::text,
    jsonb_build_object('dish_name', s.dish_name, 'status', s.status, 'rejection_reason', s.rejection_reason, 'user_id', s.user_id,
                       'user_name', s.user_name, 'slot', s.slot, 'is_late', s.is_late, 'media', jsonb_array_length(v_media)),
    jsonb_build_object('deleted', true, 'by', case when v_admin then 'admin' else 'user' end),
    nullif(v_reason, ''));

  return jsonb_build_object('user_id', s.user_id, 'user_name', s.user_name, 'dish_name', s.dish_name, 'by', case when v_admin then 'admin' else 'user' end);
end
$$;

revoke all on function public.campaign_delete_submission(jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.campaign_delete_submission(jsonb, uuid, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
