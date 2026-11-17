-- =============================================================================
-- Gerenciador de Campanhas — 2/5: funções auxiliares e gatilhos (defesa em
-- profundidade: as regras valem mesmo que alguém grave direto no banco)
--
-- Objetivo : estado de etapas, trava de edição, elegibilidade, visibilidade e
--            gatilhos que impedem voto próprio, edição após a trava,
--            alteração/exclusão de votos e do histórico.
-- Impacto  : somente objetos novos (campaign_*).
-- Rollback : drop function/trigger campaign_* (ver supabase/dev/ROLLBACK_campaigns.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Estado de uma etapa: unset | upcoming | open | paused | closed
-- ---------------------------------------------------------------------------
create or replace function public.campaign_stage_state(p_campaign uuid, p_stage text)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select case
    when s.campaign_id is null then 'unset'
    when s.starts_at is null and s.ends_at is null then 'unset'
    when s.paused then 'paused'
    when s.starts_at is not null and now() < s.starts_at then 'upcoming'
    when s.ends_at is not null and now() >= s.ends_at then 'closed'
    else 'open'
  end
  from (select 1) d
  left join public.campaign_stages s
    on s.campaign_id = p_campaign and s.stage_key = p_stage
$$;

-- Edição das receitas travada? (votação já começou OU trava gravada)
create or replace function public.campaign_is_locked(p_campaign uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((select c.edit_locked_at is not null from public.campaigns c where c.id = p_campaign), false)
      or exists (
        select 1 from public.campaign_stages s
        where s.campaign_id = p_campaign and s.stage_key = 'voting'
          and s.starts_at is not null and s.starts_at <= now()
      )
$$;

-- Grava a trava (uma vez; nunca é limpa). Idempotente.
create or replace function public.campaign_sync_lock(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.campaigns c
     set edit_locked_at = coalesce(
           (select s.starts_at from public.campaign_stages s
             where s.campaign_id = c.id and s.stage_key = 'voting'), now())
   where c.id = p_campaign
     and c.edit_locked_at is null
     and exists (
       select 1 from public.campaign_stages s
       where s.campaign_id = c.id and s.stage_key = 'voting'
         and s.starts_at is not null and s.starts_at <= now());
end
$$;

create or replace function public.campaign_module_enabled()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((select enabled from public.campaign_settings where id = 1), false)
$$;

-- Liberada = módulo ligado + publicada + não suspensa + já passou visible_from
create or replace function public.campaign_is_released(p_campaign uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.campaign_module_enabled() and exists (
    select 1 from public.campaigns c
    where c.id = p_campaign
      and c.status = 'authorized'
      and c.authorized_at is not null
      and c.suspended_at is null
      and (c.visible_from is null or c.visible_from <= now())
  )
$$;

-- Visível = liberada OU publicada com "consulta antecipada" (aparece como Em breve)
create or replace function public.campaign_is_visible(p_campaign uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.campaign_module_enabled() and exists (
    select 1 from public.campaigns c
    where c.id = p_campaign
      and c.status = 'authorized'
      and c.authorized_at is not null
      and c.suspended_at is null
      and (c.visible_from is null
           or c.visible_from <= now()
           or coalesce((c.visibility->>'allow_preview')::boolean, false))
  )
$$;

-- Elegibilidade do colaborador (lê auth.users; a regra de público é aplicada aqui,
-- no banco). unidade/departamento são autodeclarados no perfil: servem de FILTRO,
-- não de fronteira de segurança.
create or replace function public.campaign_user_eligible(p_campaign uuid, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  u record;
  a jsonb;
  m text;
begin
  select id, raw_user_meta_data as meta, banned_until, deleted_at
    into u from auth.users where id = p_user;
  if not found then return false; end if;
  if u.deleted_at is not null then return false; end if;
  if u.banned_until is not null and u.banned_until > now() then return false; end if;
  if coalesce(u.meta->>'onboarding_completed', '') <> 'true' then return false; end if;

  select audience into a from public.campaigns where id = p_campaign;
  if not found then return false; end if;
  m := coalesce(a->>'mode', 'all');

  if m = 'all' then
    return true;
  elsif m = 'units' then
    return coalesce(u.meta->>'lunch_location', '') in
      (select jsonb_array_elements_text(coalesce(a->'units', '[]'::jsonb)));
  elsif m = 'departments' then
    return lower(btrim(coalesce(u.meta->>'department', ''))) in
      (select lower(btrim(x)) from jsonb_array_elements_text(coalesce(a->'departments', '[]'::jsonb)) x);
  elsif m = 'users' then
    return exists (select 1 from public.campaign_eligible_users e
                    where e.campaign_id = p_campaign and e.user_id = p_user);
  end if;
  return false;
end
$$;

create or replace function public.campaign_eligible_count(p_campaign uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer from auth.users u where public.campaign_user_eligible(p_campaign, u.id)
$$;

-- Acesso administrativo ao módulo (lista própria)
create or replace function public.campaign_admin_has(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select (a.permissions->>p_key)::boolean from public.campaign_admins a where a.user_id = p_user), false)
$$;

-- Auditoria (sempre na mesma transação da ação)
create or replace function public.campaign_audit(
  p_campaign uuid, p_actor jsonb, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_reason text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.campaign_audit_log
    (campaign_id, actor_id, actor_name, actor_role, ip, action, entity_type, entity_id, before, after, reason)
  values
    (p_campaign,
     nullif(p_actor->>'id', '')::uuid,
     coalesce(p_actor->>'name', ''),
     coalesce(p_actor->>'role', ''),
     coalesce(p_actor->>'ip', ''),
     p_action, coalesce(p_entity_type, ''), coalesce(p_entity_id, ''),
     p_before, p_after, p_reason);
end
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

-- Histórico imutável
create or replace function public.campaign_audit_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'AUDIT_IMMUTABLE';
end
$$;

drop trigger if exists campaign_audit_no_update_delete on public.campaign_audit_log;
create trigger campaign_audit_no_update_delete
  before update or delete on public.campaign_audit_log
  for each row execute function public.campaign_audit_immutable();

drop trigger if exists campaign_audit_no_truncate on public.campaign_audit_log;
create trigger campaign_audit_no_truncate
  before truncate on public.campaign_audit_log
  for each statement execute function public.campaign_audit_immutable();

-- Voto: só em receita aprovada da MESMA campanha, nunca na própria, na janela
-- aberta, com a campanha liberada.
create or replace function public.campaign_votes_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  s record;
  v text;
begin
  select user_id, status, campaign_id into s
    from public.campaign_submissions where id = new.submission_id;
  if not found or s.campaign_id <> new.campaign_id then
    raise exception using errcode = 'P0001', message = 'NOT_APPROVED';
  end if;
  if s.user_id = new.voter_id then
    raise exception using errcode = 'P0001', message = 'SELF_VOTE';
  end if;
  if s.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'NOT_APPROVED';
  end if;
  if not public.campaign_is_released(new.campaign_id) then
    raise exception using errcode = 'P0001', message = 'CAMPAIGN_UNAVAILABLE';
  end if;
  v := public.campaign_stage_state(new.campaign_id, 'voting');
  if v = 'paused' then
    raise exception using errcode = 'P0001', message = 'VOTING_PAUSED';
  elsif v <> 'open' then
    raise exception using errcode = 'P0001', message = 'VOTING_CLOSED';
  end if;
  return new;
end
$$;

drop trigger if exists campaign_votes_guard_ins on public.campaign_votes;
create trigger campaign_votes_guard_ins
  before insert on public.campaign_votes
  for each row execute function public.campaign_votes_guard();

-- Voto: não se altera nem se exclui; só pode ser INVALIDADO (registro preservado).
create or replace function public.campaign_votes_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'VOTES_ARE_PERMANENT';
  end if;
  if new.id is distinct from old.id
     or new.campaign_id is distinct from old.campaign_id
     or new.submission_id is distinct from old.submission_id
     or new.voter_id is distinct from old.voter_id
     or new.voter_name is distinct from old.voter_name
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'VOTE_IMMUTABLE';
  end if;
  if old.invalidated_at is not null then
    raise exception using errcode = 'P0001', message = 'VOTE_IMMUTABLE';
  end if;
  return new;
end
$$;

drop trigger if exists campaign_votes_no_change on public.campaign_votes;
create trigger campaign_votes_no_change
  before update or delete on public.campaign_votes
  for each row execute function public.campaign_votes_immutable();

-- Conteúdo da receita: imutável depois da trava (salvo correção administrativa
-- auditada, que liga campaign.bypass_lock dentro da própria transação).
create or replace function public.campaign_submissions_lock_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('campaign.bypass_lock', true), '') = 'on' then
    return new;
  end if;
  if (new.dish_name, new.description, new.ingredients, new.preparation)
       is distinct from (old.dish_name, old.description, old.ingredients, old.preparation) then
    if public.campaign_is_locked(new.campaign_id) then
      raise exception using errcode = 'P0001', message = 'EDIT_LOCKED';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists campaign_submissions_lock on public.campaign_submissions;
create trigger campaign_submissions_lock
  before update on public.campaign_submissions
  for each row execute function public.campaign_submissions_lock_guard();

-- Mídia da receita: também congelada depois da trava.
create or replace function public.campaign_media_lock_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('campaign.bypass_lock', true), '') = 'on' then
    return new;
  end if;
  if public.campaign_is_locked(new.campaign_id) then
    raise exception using errcode = 'P0001', message = 'EDIT_LOCKED';
  end if;
  return new;
end
$$;

drop trigger if exists campaign_media_lock on public.campaign_media;
create trigger campaign_media_lock
  before insert or update on public.campaign_media
  for each row execute function public.campaign_media_lock_guard();
