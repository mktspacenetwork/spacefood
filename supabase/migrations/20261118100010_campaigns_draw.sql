-- =============================================================================
-- Gerenciador de Campanhas — 10: sorteio simples entre quem tem receita aprovada
--
-- Objetivo : campanha pode ter SORTEIO (features.draw + features.draw_winners, 1 a 10). Sorteia entre
--            PESSOAS com pelo menos uma receita aprovada (uma chance por pessoa), ganhadores distintos,
--            aleatoriedade segura do banco (order by gen_random_uuid()), UMA vez por campanha. Antes de
--            confirmar pode ser DESCARTADO com justificativa (auditado). Depois de confirmado nada muda.
--            Divulgar agora ou AGENDAR (data+hora), com notificação única no próprio banco, igual ao
--            resultado de votação (runner pg_cron/API estendido).
-- Impacto  : SOMENTE objetos campaign_*. Aditiva e idempotente. Tabela nova campaign_draws; funções novas;
--            recria (create or replace): campaign_validate_features, campaign_update (isenta draw/draw_winners
--            da trava "campanha publicada com receitas"), campaign_collab_state (+ draw_visible, i_won) e
--            campaign_run_due_announcements (+ sorteios vencidos). Nenhum dado existente é alterado.
-- Rollback : reaplicar as definições da migração 8 (funções), derrubar os gatilhos campaign_draw_guard_* e
--            a tabela campaign_draws (se não houver sorteio real).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabela (RLS ligado, sem grants a anon/authenticated; service_role só lê)
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_draws (
  campaign_id                uuid primary key references public.campaigns(id) on delete restrict,
  status                     text not null check (status in ('drawn', 'confirmed', 'announced')),
  drawn_at                   timestamptz not null default now(),
  drawn_by                   uuid,
  drawn_by_name              text,
  winners_count              integer not null check (winners_count between 1 and 10),
  eligible_snapshot          jsonb not null default '[]'::jsonb,
  winners                    jsonb not null default '[]'::jsonb,
  confirmed_at               timestamptz,
  confirmed_by               uuid,
  confirmed_by_name          text,
  announced_at               timestamptz,
  announced_by               uuid,
  announce_at                timestamptz,
  announce_scheduled_by      uuid,
  announce_scheduled_by_name text,
  announce_scheduled_at      timestamptz
);
alter table public.campaign_draws enable row level security;
revoke all on table public.campaign_draws from anon, authenticated, service_role;
grant select on table public.campaign_draws to service_role;

-- ---------------------------------------------------------------------------
-- 2) Funcionalidades: draw exige aprovação; draw_winners entre 1 e 10
-- ---------------------------------------------------------------------------
create or replace function public.campaign_validate_features(f jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  bad text[] := '{}';
  w numeric;
begin
  if public.campaign_feat(f, 'approval')  and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'approval'); end if;
  if public.campaign_feat(f, 'photos')    and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'photos'); end if;
  if public.campaign_feat(f, 'video')     and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'video'); end if;
  if public.campaign_feat(f, 'gallery')   and not public.campaign_feat(f, 'approval')   then bad := array_append(bad, 'gallery'); end if;
  if public.campaign_feat(f, 'voting')    and not public.campaign_feat(f, 'approval')   then bad := array_append(bad, 'voting'); end if;
  if public.campaign_feat(f, 'ranking')   and not public.campaign_feat(f, 'voting')     then bad := array_append(bad, 'ranking'); end if;
  if public.campaign_feat(f, 'results')   and not public.campaign_feat(f, 'voting')     then bad := array_append(bad, 'results'); end if;
  if public.campaign_feat(f, 'announcement') and not public.campaign_feat(f, 'results') then bad := array_append(bad, 'announcement'); end if;
  if public.campaign_feat(f, 'multiple_submissions') and not public.campaign_feat(f, 'submission') then bad := array_append(bad, 'multiple_submissions'); end if;
  -- sorteio: só entre receitas aprovadas
  if public.campaign_feat(f, 'draw') and not public.campaign_feat(f, 'approval') then bad := array_append(bad, 'draw'); end if;
  if f ? 'draw_winners' then
    if jsonb_typeof(f->'draw_winners') <> 'number' then
      bad := array_append(bad, 'draw_winners');
    else
      w := (f->>'draw_winners')::numeric;
      if w <> trunc(w) or w < 1 or w > 10 then bad := array_append(bad, 'draw_winners'); end if;
    end if;
  end if;
  if array_length(bad, 1) is not null then
    perform public.campaign_raise('INVALID_CONFIG', array_to_string(bad, ','));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Atualizar campanha: draw/draw_winners ficam livres mesmo publicada com receitas, MAS não mudam depois
--    que o sorteio foi feito (DRAW_LOCKED). O restante segue como na migração 8.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_update(p_actor jsonb, p_campaign uuid, p_fields jsonb, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  before jsonb;
  n integer;
  after_row public.campaigns;
  feats jsonb;
  changed boolean := false;
  nf jsonb;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if p_expected_version is not null and c.version <> p_expected_version then
    perform public.campaign_raise('VERSION_CONFLICT');
  end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  before := to_jsonb(c);

  -- depois do sorteio feito, ligar/desligar o sorteio ou mudar a quantidade de ganhadores não vale mais
  nf := p_fields->'features';
  if jsonb_typeof(nf) = 'object' and exists (select 1 from public.campaign_draws d where d.campaign_id = p_campaign) then
    if (nf ? 'draw' and coalesce((nf->>'draw')::boolean, false) is distinct from public.campaign_feat(c.features, 'draw'))
       or (nf ? 'draw_winners' and (nf->>'draw_winners') is distinct from (c.features->>'draw_winners')) then
      perform public.campaign_raise('DRAW_LOCKED');
    end if;
  end if;

  if c.status in ('draft', 'in_review') then
    if p_fields ? 'name' then
      if length(btrim(coalesce(p_fields->>'name', ''))) not between 3 and 120 then
        perform public.campaign_raise('INVALID_FIELDS', 'name');
      end if;
      update public.campaigns set name = btrim(p_fields->>'name') where id = p_campaign;
    end if;
  else
    -- publicada: não muda funcionalidades/limites se já há receitas (tour, "várias receitas" e sorteio ficam de fora)
    if jsonb_typeof(p_fields->'media_limits') = 'object'
       and (c.media_limits || (p_fields->'media_limits')) is distinct from c.media_limits then
      changed := true;
    end if;
    if jsonb_typeof(p_fields->'features') = 'object' then
      feats := (p_fields->'features') - 'tour' - 'multiple_submissions' - 'draw' - 'draw_winners';
      if exists (select 1 from jsonb_each(feats) e where c.features->e.key is distinct from e.value) then
        changed := true;
      end if;
    end if;
    if changed then
      select count(*) into n from public.campaign_submissions where campaign_id = p_campaign;
      if n > 0 then perform public.campaign_raise('CAMPAIGN_HAS_RECORDS'); end if;
    end if;
  end if;

  perform public.campaign_apply_config(p_campaign, p_fields);
  update public.campaigns
     set updated_by = (p_actor->>'id')::uuid, version = version + 1
   where id = p_campaign;

  select * into after_row from public.campaigns where id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'UPDATE_CAMPAIGN', 'campaign', p_campaign::text, before, to_jsonb(after_row), null);
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Proteção: com sorteio já feito, o conjunto de receitas aprovadas não muda
--    (nem entra receita nova, nem aprovada/reprovada vira outra coisa). Descartar o sorteio libera de novo.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_draw_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.campaign_draws d where d.campaign_id = new.campaign_id) then
      perform public.campaign_raise('DRAW_LOCKED');
    end if;
  elsif old.status is distinct from new.status and (old.status = 'approved' or new.status = 'approved') then
    if exists (select 1 from public.campaign_draws d where d.campaign_id = new.campaign_id) then
      perform public.campaign_raise('DRAW_LOCKED');
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists campaign_draw_guard_ins on public.campaign_submissions;
create trigger campaign_draw_guard_ins before insert on public.campaign_submissions
  for each row execute function public.campaign_draw_guard();
drop trigger if exists campaign_draw_guard_upd on public.campaign_submissions;
create trigger campaign_draw_guard_upd before update of status on public.campaign_submissions
  for each row execute function public.campaign_draw_guard();

-- ---------------------------------------------------------------------------
-- 5) Elegíveis: PESSOAS com receita aprovada (uma chance por pessoa), ainda ativas no sistema
-- ---------------------------------------------------------------------------
create or replace function public.campaign_draw_eligible(p_campaign uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(x.j order by x.pname, x.uid), '[]'::jsonb)
    from (
      select s.user_id as uid,
             min(s.user_name) as pname,
             jsonb_build_object(
               'user_id', s.user_id, 'name', min(s.user_name),
               'department', coalesce(min(s.user_department), ''), 'unit', coalesce(min(s.user_unit), ''),
               'recipes', jsonb_agg(jsonb_build_object('id', s.id, 'dish_name', s.dish_name) order by s.slot)) as j
        from public.campaign_submissions s
       where s.campaign_id = p_campaign and s.status = 'approved'
         and exists (select 1 from auth.users au
                      where au.id = s.user_id and au.deleted_at is null
                        and (au.banned_until is null or au.banned_until <= now()))
       group by s.user_id
    ) x
$$;

-- Estado do sorteio para o painel (formato AdminDraw da API)
create or replace function public.campaign_draw_state(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  d public.campaign_draws;
  el jsonb;
  n_el integer;
  pend integer;
  reg text;
  closed boolean;
  en boolean;
  wc integer;
  reason text;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  en := public.campaign_feat(c.features, 'draw');
  wc := case when jsonb_typeof(c.features->'draw_winners') = 'number'
             then least(10, greatest(1, (c.features->>'draw_winners')::numeric::integer)) else 1 end;
  select * into d from public.campaign_draws where campaign_id = p_campaign;
  el := public.campaign_draw_eligible(p_campaign);
  n_el := jsonb_array_length(el);
  select count(*)::integer into pend from public.campaign_submissions
   where campaign_id = p_campaign and status in ('submitted', 'in_review');
  reg := public.campaign_stage_state(p_campaign, 'registration');
  closed := reg = 'closed';
  reason := case
    when not en then 'Esta campanha não tem sorteio.'
    when d.campaign_id is not null then 'O sorteio já foi realizado.'
    when not closed then 'O sorteio só pode ser feito depois do encerramento da participação.'
    when pend = 1 then 'Há 1 receita aguardando análise. Analise antes de sortear.'
    when pend > 1 then 'Há ' || pend || ' receitas aguardando análise. Analise antes de sortear.'
    when n_el = 0 then 'Nenhuma pessoa com receita aprovada.'
    else null end;
  return jsonb_build_object(
    'enabled', en, 'status', coalesce(d.status, 'none'), 'winners_count', wc,
    'eligible_count', n_el, 'eligible', el, 'pending_review', pend,
    'registration_open', not closed, 'can_run', reason is null, 'reason', reason,
    'draw', case when d.campaign_id is null then null else jsonb_build_object(
      'drawn_at', d.drawn_at, 'drawn_by_name', d.drawn_by_name, 'winners', d.winners,
      'confirmed_at', d.confirmed_at, 'confirmed_by_name', d.confirmed_by_name,
      'announced_at', d.announced_at, 'announce_at', d.announce_at,
      'announce_scheduled_by_name', d.announce_scheduled_by_name, 'announce_scheduled_at', d.announce_scheduled_at) end);
end
$$;

-- ---------------------------------------------------------------------------
-- 6) Sortear (UMA vez), descartar (antes de confirmar), confirmar
-- ---------------------------------------------------------------------------
create or replace function public.campaign_draw_run(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  el jsonb;
  n_el integer;
  v_n integer;
  pend integer;
  r record;
  i integer := 0;
  winners jsonb := '[]'::jsonb;
begin
  -- serializa: dois cliques/abas não sorteiam duas vezes
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status not in ('authorized', 'closed') then perform public.campaign_raise('CAMPAIGN_UNAVAILABLE'); end if;
  if not public.campaign_feat(c.features, 'draw') then perform public.campaign_raise('DRAW_DISABLED'); end if;
  if exists (select 1 from public.campaign_draws where campaign_id = p_campaign) then perform public.campaign_raise('DRAW_ALREADY_RUN'); end if;
  if public.campaign_stage_state(p_campaign, 'registration') <> 'closed' then perform public.campaign_raise('DRAW_REGISTRATION_OPEN'); end if;
  select count(*)::integer into pend from public.campaign_submissions
   where campaign_id = p_campaign and status in ('submitted', 'in_review');
  if pend > 0 then perform public.campaign_raise('DRAW_PENDING_REVIEW', pend::text); end if;
  el := public.campaign_draw_eligible(p_campaign);
  n_el := jsonb_array_length(el);
  if n_el = 0 then perform public.campaign_raise('DRAW_NO_ELIGIBLE'); end if;
  v_n := case when jsonb_typeof(c.features->'draw_winners') = 'number'
              then least(10, greatest(1, (c.features->>'draw_winners')::numeric::integer)) else 1 end;
  v_n := least(v_n, n_el);

  -- aleatoriedade segura do banco (uuid v4 de fonte criptográfica); cada pessoa entra uma vez
  for r in select e.value as person from jsonb_array_elements(el) e order by gen_random_uuid() limit v_n loop
    i := i + 1;
    winners := winners || jsonb_build_array(jsonb_build_object(
      'position', i, 'user_id', r.person->>'user_id', 'name', r.person->>'name',
      'department', r.person->>'department', 'unit', r.person->>'unit',
      'submission_id', r.person->'recipes'->0->>'id', 'dish_name', r.person->'recipes'->0->>'dish_name'));
  end loop;

  insert into public.campaign_draws (campaign_id, status, drawn_by, drawn_by_name, winners_count, eligible_snapshot, winners)
  values (p_campaign, 'drawn', nullif(p_actor->>'id', '')::uuid, coalesce(p_actor->>'name', ''), v_n, el, winners);
  perform public.campaign_audit(p_campaign, p_actor, 'RUN_DRAW', 'draw', p_campaign::text, null,
    jsonb_build_object('winners', winners, 'eligible_count', n_el, 'winners_count', v_n), null);
  return jsonb_build_object('winners', winners, 'eligible_count', n_el);
end
$$;

-- Descartar o sorteio (só antes de confirmar), com justificativa. O histórico fica na auditoria.
create or replace function public.campaign_draw_discard(p_actor jsonb, p_campaign uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare d public.campaign_draws;
begin
  if length(btrim(coalesce(p_reason, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
  select * into d from public.campaign_draws where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('DRAW_NOT_DRAWN'); end if;
  if d.status <> 'drawn' then perform public.campaign_raise('DRAW_LOCKED'); end if;
  delete from public.campaign_draws where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'DISCARD_DRAW', 'draw', p_campaign::text,
    jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at, 'drawn_by_name', d.drawn_by_name), null, btrim(p_reason));
end
$$;

create or replace function public.campaign_draw_confirm(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare d public.campaign_draws;
begin
  select * into d from public.campaign_draws where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('DRAW_NOT_DRAWN'); end if;
  if d.status <> 'drawn' then perform public.campaign_raise('DRAW_ALREADY_CONFIRMED'); end if;
  update public.campaign_draws
     set status = 'confirmed', confirmed_at = now(),
         confirmed_by = nullif(p_actor->>'id', '')::uuid, confirmed_by_name = coalesce(p_actor->>'name', '')
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'CONFIRM_DRAW', 'draw', p_campaign::text, null,
    jsonb_build_object('winners', d.winners), null);
  return jsonb_build_object('winners', d.winners);
end
$$;

-- ---------------------------------------------------------------------------
-- 7) Divulgar (agora ou agendado) e notificar UMA vez por pessoa, dentro da mesma transação
--    Ganhadores: draw_won. Participantes (enviaram receita finalizada): draw_announced.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_draw_notify(p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  d public.campaign_draws;
  u record;
  has_kv boolean;
  v_event text;
  v_title text;
  v_msg text;
  v_claim integer;
  n_win integer := 0;
  n_part integer := 0;
  n_err integer := 0;
begin
  select * into c from public.campaigns where id = p_campaign;
  select * into d from public.campaign_draws where campaign_id = p_campaign;
  has_kv := to_regprocedure('public.kv_append_to_array(text,jsonb)') is not null;

  for u in
    select x.user_id from (
      select s.user_id from public.campaign_submissions s where s.campaign_id = p_campaign and s.status <> 'pending_media'
      union
      select (w.value->>'user_id')::uuid from jsonb_array_elements(d.winners) w
    ) x
    where x.user_id is not null and exists (select 1 from auth.users au where au.id = x.user_id)
  loop
    if exists (select 1 from jsonb_array_elements(d.winners) w where (w.value->>'user_id')::uuid = u.user_id) then
      v_event := 'draw_won';
      v_title := 'Você foi sorteado!';
      v_msg := 'Parabéns! Você está entre os ganhadores do sorteio da campanha ' || c.name || '.';
    else
      v_event := 'draw_announced';
      v_title := 'Resultado do sorteio';
      v_msg := 'O resultado do sorteio da campanha ' || c.name || ' já está disponível em Campanhas.';
    end if;

    insert into public.campaign_notification_log (campaign_id, user_id, event_key, entity_id)
    values (p_campaign, u.user_id, v_event, '')
    on conflict (campaign_id, user_id, event_key, entity_id) do nothing;
    get diagnostics v_claim = row_count;
    if v_claim = 1 then
      begin
        if not has_kv then raise exception 'kv_append_to_array indisponível'; end if;
        perform public.kv_append_to_array('notifications:user:' || u.user_id::text, jsonb_build_object(
          'id', gen_random_uuid()::text, 'title', v_title, 'message', v_msg, 'type', 'info',
          'sentAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sentByName', 'Campanhas', 'targetUserId', u.user_id::text));
        update public.campaign_notification_log set inbox_ok = true, push_ok = false
         where campaign_id = p_campaign and user_id = u.user_id and event_key = v_event and entity_id = '';
        if v_event = 'draw_won' then n_win := n_win + 1; else n_part := n_part + 1; end if;
      exception when others then
        n_err := n_err + 1;
        update public.campaign_notification_log set inbox_ok = false, push_ok = false, error = left(sqlerrm, 300)
         where campaign_id = p_campaign and user_id = u.user_id and event_key = v_event and entity_id = '';
      end;
    end if;
  end loop;
  return jsonb_build_object('winners', n_win, 'participants', n_part, 'errors', n_err);
end
$$;

-- Divulgar AGORA: só vale uma vez (ALREADY_ANNOUNCED depois); limpa qualquer agendamento.
create or replace function public.campaign_draw_announce(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  d public.campaign_draws;
  n jsonb;
begin
  select * into d from public.campaign_draws where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('DRAW_NOT_DRAWN'); end if;
  if d.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if d.status <> 'confirmed' then perform public.campaign_raise('DRAW_NOT_CONFIRMED'); end if;

  update public.campaign_draws
     set status = 'announced', announced_at = now(), announced_by = nullif(p_actor->>'id', '')::uuid,
         announce_at = null, announce_scheduled_by = null, announce_scheduled_by_name = null, announce_scheduled_at = null
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'ANNOUNCE_DRAW', 'draw', p_campaign::text,
    jsonb_build_object('announce_at', d.announce_at),
    jsonb_build_object('winners', d.winners,
                       'via', case when coalesce(p_actor->>'role', '') = 'system' then 'schedule' else 'manual' end), null);
  n := public.campaign_draw_notify(p_campaign);
  return jsonb_build_object('winners', d.winners, 'notified', n);
end
$$;

-- Agendar (data + hora); o último agendamento substitui o anterior; nunca no passado.
create or replace function public.campaign_draw_schedule(p_actor jsonb, p_campaign uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare d public.campaign_draws;
begin
  select * into d from public.campaign_draws where campaign_id = p_campaign for update;
  if not found then perform public.campaign_raise('DRAW_NOT_DRAWN'); end if;
  if d.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if d.status <> 'confirmed' then perform public.campaign_raise('DRAW_NOT_CONFIRMED'); end if;
  if p_at is null or p_at < now() + interval '30 seconds' then perform public.campaign_raise('ANNOUNCE_IN_PAST'); end if;
  update public.campaign_draws
     set announce_at = p_at, announce_scheduled_by = nullif(p_actor->>'id', '')::uuid,
         announce_scheduled_by_name = coalesce(p_actor->>'name', ''), announce_scheduled_at = now()
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'SCHEDULE_DRAW_ANNOUNCEMENT', 'draw', p_campaign::text,
    jsonb_build_object('announce_at', d.announce_at), jsonb_build_object('announce_at', p_at), null);
  return jsonb_build_object('announce_at', p_at);
end
$$;

create or replace function public.campaign_draw_cancel_schedule(p_actor jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare d public.campaign_draws;
begin
  select * into d from public.campaign_draws where campaign_id = p_campaign for update;
  if not found then return jsonb_build_object('cancelled', false); end if;
  if d.status = 'announced' then perform public.campaign_raise('ALREADY_ANNOUNCED'); end if;
  if d.announce_at is null then return jsonb_build_object('cancelled', false); end if;
  update public.campaign_draws
     set announce_at = null, announce_scheduled_by = null, announce_scheduled_by_name = null, announce_scheduled_at = null
   where campaign_id = p_campaign;
  perform public.campaign_audit(p_campaign, p_actor, 'CANCEL_DRAW_ANNOUNCEMENT', 'draw', p_campaign::text,
    jsonb_build_object('announce_at', d.announce_at), jsonb_build_object('announce_at', null), null);
  return jsonb_build_object('cancelled', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 8) Executor das divulgações vencidas: resultado de votação (migração 8) + sorteio
-- ---------------------------------------------------------------------------
create or replace function public.campaign_run_due_announcements()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rec record;
  n integer := 0;
  sys jsonb := jsonb_build_object('name', 'Agendamento automático', 'role', 'system');
begin
  for rec in
    select r.campaign_id
      from public.campaign_results r
     where r.status = 'confirmed' and r.announce_at is not null and r.announce_at <= now()
       and public.campaign_is_released(r.campaign_id)
     order by r.announce_at
       for update of r skip locked
  loop
    begin
      perform public.campaign_announce(sys, rec.campaign_id);
      n := n + 1;
    exception when others then
      raise warning 'campaign_run_due_announcements(%): %', rec.campaign_id, sqlerrm;
    end;
  end loop;

  for rec in
    select d.campaign_id
      from public.campaign_draws d
     where d.status = 'confirmed' and d.announce_at is not null and d.announce_at <= now()
       and public.campaign_is_released(d.campaign_id)
     order by d.announce_at
       for update of d skip locked
  loop
    begin
      perform public.campaign_draw_announce(sys, rec.campaign_id);
      n := n + 1;
    exception when others then
      raise warning 'campaign_run_due_announcements/draw(%): %', rec.campaign_id, sqlerrm;
    end;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 9) Estado do colaborador: + draw_visible (só após divulgar) e i_won
-- ---------------------------------------------------------------------------
create or replace function public.campaign_collab_state(p_campaign uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.campaigns;
  r public.campaign_results;
  s public.campaign_submissions;
  v public.campaign_votes;
  dr public.campaign_draws;
  released boolean;
  visible boolean;
  elig boolean;
  reg text;
  vot text;
  locked boolean;
  stage text;
  res_vis boolean;
  draw_vis boolean;
  won boolean := false;
  can_submit boolean;
  can_edit boolean;
  can_vote boolean;
  n_sub integer;
  n_editable integer;
  max_sub integer;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then return jsonb_build_object('visible', false); end if;
  visible := public.campaign_is_visible(p_campaign);
  released := public.campaign_is_released(p_campaign);
  elig := public.campaign_user_eligible(p_campaign, p_user);
  if not visible or not elig then
    return jsonb_build_object('visible', false, 'eligible', elig);
  end if;
  select * into r from public.campaign_results where campaign_id = p_campaign;
  select * into dr from public.campaign_draws where campaign_id = p_campaign;
  select * into s from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user order by slot limit 1;
  select count(*)::integer, count(*) filter (where status <> 'approved')::integer
    into n_sub, n_editable
    from public.campaign_submissions where campaign_id = p_campaign and user_id = p_user;
  select * into v from public.campaign_votes where campaign_id = p_campaign and voter_id = p_user;
  reg := public.campaign_stage_state(p_campaign, 'registration');
  vot := public.campaign_stage_state(p_campaign, 'voting');
  max_sub := case when public.campaign_feat(c.features, 'multiple_submissions') then 10 else 1 end;
  locked := n_sub > 0 and n_editable = 0;
  res_vis := public.campaign_results_visible(p_campaign);
  -- sorteio: só aparece depois da divulgação oficial; nunca antes (nem o horário agendado)
  draw_vis := public.campaign_feat(c.features, 'draw') and dr.campaign_id is not null and dr.status = 'announced';
  if draw_vis then
    won := exists (select 1 from jsonb_array_elements(dr.winners) w where (w.value->>'user_id')::uuid = p_user);
  end if;

  stage := case
    when res_vis or draw_vis then 'results'
    when c.status = 'closed' then 'closed'
    when not released then 'upcoming'
    when reg = 'open' and vot = 'open' then 'open'
    when vot = 'paused' then 'voting_paused'
    when vot = 'open' then 'voting'
    when vot = 'closed' then 'voting_closed'
    when reg = 'open' then 'registration'
    when reg = 'paused' then 'registration_paused'
    when reg = 'upcoming' then 'upcoming'
    when reg = 'closed' then 'review'
    else 'upcoming' end;

  can_submit := coalesce(released and public.campaign_feat(c.features, 'submission') and n_sub < max_sub
                and reg = 'open' and c.status = 'authorized', false);
  can_edit := coalesce(released and n_editable > 0
                and reg = 'open' and c.status = 'authorized', false);
  can_vote := coalesce(released and public.campaign_feat(c.features, 'voting') and vot = 'open'
              and v.id is null and c.status = 'authorized', false);

  return jsonb_build_object(
    'visible', true, 'released', released, 'eligible', true, 'stage', stage,
    'registration', reg, 'voting', vot, 'locked', locked,
    'can_submit', can_submit, 'can_edit', can_edit, 'can_vote', can_vote,
    'my_submission_id', s.id, 'my_submission_status', s.status,
    'my_submissions_count', n_sub, 'max_submissions', max_sub,
    'has_voted', v.id is not null and v.invalidated_at is null,
    'voted_at', v.created_at, 'voted_submission_id', v.submission_id,
    'gallery_visible', released and public.campaign_gallery_visible(p_campaign),
    'ranking_visible', released and public.campaign_ranking_visible(p_campaign),
    'results_visible', res_vis,
    'draw_visible', draw_vis, 'i_won', won,
    'tour', coalesce(c.features->'tour', '{"enabled":false,"version":1}'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 10) Privilégios (mesma regra das migrações anteriores)
-- ---------------------------------------------------------------------------
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

notify pgrst, 'reload schema';
