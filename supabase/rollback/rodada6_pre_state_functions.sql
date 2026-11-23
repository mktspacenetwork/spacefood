-- Snapshot das funções ANTES da rodada 6 (produção, 2026-11-23). Para rollback: reaplicar cada função, uma por chamada.
--
-- Projeto Supabase: revxdizgphrntekspvkm
-- Hashes vivos antes da rodada 6 = md5(replace(prosrc, chr(13), '')):
--   campaign_late_window(uuid)                          bd3beb2e7dfacf0ee4c481213beb7e4b
--   campaign_review(jsonb,uuid,uuid,text,text)          e9407384ad569b5a162e29ffe4319c77
--   recipe_book_set_settings(jsonb,boolean,boolean)     031a526f729880bce93af8b063aa70f0
--   recipe_book_state()                                 f17da64e0e841fc7fa46a4dc02b3b86b
--   recipe_book_view(uuid)                              b69f4396a7f8fc75ea83daf0a76b3344
-- Baseline de dados antes: subs=8, votes=0, camps=10, entries=3, published=false.

CREATE OR REPLACE FUNCTION public.campaign_late_window(p_campaign uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce((
    select public.campaign_feat(c.features, 'voting')
       and public.campaign_stage_state(c.id, 'registration') = 'closed'
       and public.campaign_is_released(c.id)
       and coalesce((select r.status from public.campaign_results r where r.campaign_id = c.id), 'none') <> 'announced'
      from public.campaigns c
     where c.id = p_campaign
  ), false)
$function$;

CREATE OR REPLACE FUNCTION public.campaign_review(p_actor jsonb, p_campaign uuid, p_submission uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c public.campaigns;
  s public.campaign_submissions;
  r public.campaign_results;
  new_status text;
  s_found boolean;
  late_exempt boolean;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then perform public.campaign_raise('CAMPAIGN_NOT_FOUND'); end if;
  if c.status in ('closed', 'archived') then perform public.campaign_raise('CAMPAIGN_CLOSED'); end if;
  select * into s from public.campaign_submissions where id = p_submission and campaign_id = p_campaign for update;
  s_found := found;
  -- Receita FORA DO PRAZO pode ser analisada mesmo com a votação encerrada ou o resultado confirmado, enquanto o
  -- resultado não for divulgado (campaign_late_window; campanha encerrada/arquivada já foi barrada acima).
  -- Ela não concorre: aprovar ou reprovar não altera votação, ranking nem resultado. Receita no prazo: bloqueios de sempre.
  late_exempt := s_found and s.is_late and public.campaign_late_window(p_campaign);
  select * into r from public.campaign_results where campaign_id = p_campaign;
  if not late_exempt then
    if found and r.status in ('confirmed', 'announced') then perform public.campaign_raise('RESULTS_CONFIRMED'); end if;
    if public.campaign_feat(c.features, 'voting') and public.campaign_stage_state(p_campaign, 'voting') = 'closed' then
      perform public.campaign_raise('VOTING_CLOSED');
    end if;
  end if;
  if p_decision not in ('approve', 'reject') then perform public.campaign_raise('INVALID_FIELDS', 'decision'); end if;
  if not s_found then perform public.campaign_raise('SUBMISSION_NOT_FOUND'); end if;
  if s.status = 'pending_media' then perform public.campaign_raise('SUBMISSION_INCOMPLETE'); end if;

  -- Receita aprovada que já recebeu votos válidos não pode ser reprovada: os votos sumiriam da
  -- contagem e quem votou não teria como votar de novo. (Para isso, invalide os votos antes.)
  if p_decision = 'reject' and s.status = 'approved' then
    perform 1 from public.campaign_votes where submission_id = p_submission and invalidated_at is null;
    if found then perform public.campaign_raise('HAS_VOTES'); end if;
  end if;

  if p_decision = 'reject' then
    if length(btrim(coalesce(p_reason, ''))) < 10 then perform public.campaign_raise('REASON_TOO_SHORT'); end if;
    new_status := 'rejected';
  else
    new_status := 'approved';
  end if;

  update public.campaign_submissions set
    status = new_status,
    rejection_reason = case when new_status = 'rejected' then btrim(p_reason) else null end,
    reviewed_by = (p_actor->>'id')::uuid, reviewed_by_name = coalesce(p_actor->>'name', ''),
    reviewed_at = now(), updated_at = now()
  where id = p_submission;

  perform public.campaign_audit(p_campaign, p_actor,
    case when new_status = 'approved' then 'APPROVE_SUBMISSION' else 'REJECT_SUBMISSION' end,
    'submission', p_submission::text,
    jsonb_build_object('status', s.status, 'rejection_reason', s.rejection_reason),
    jsonb_build_object('status', new_status, 'rejection_reason', case when new_status = 'rejected' then btrim(p_reason) else null end),
    case when new_status = 'rejected' then btrim(p_reason) else null end);
  return jsonb_build_object('status', new_status, 'user_id', s.user_id, 'dish_name', s.dish_name);
end
$function$;

CREATE OR REPLACE FUNCTION public.recipe_book_set_settings(p_actor jsonb, p_published boolean, p_auto_include boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare b public.recipe_book_settings;
begin
  select * into b from public.recipe_book_settings where id = 1 for update;
  update public.recipe_book_settings
     set published = coalesce(p_published, published), auto_include = coalesce(p_auto_include, auto_include),
         updated_by = nullif(p_actor->>'id', '')::uuid, updated_by_name = coalesce(p_actor->>'name', ''), updated_at = now()
   where id = 1;
  if (p_published is not null and p_published is distinct from b.published)
     or (p_auto_include is not null and p_auto_include is distinct from b.auto_include) then
    perform public.campaign_audit(null, p_actor, 'BOOK_SETTINGS', 'book', 'settings',
      jsonb_build_object('published', b.published, 'auto_include', b.auto_include),
      jsonb_build_object('published', coalesce(p_published, b.published), 'auto_include', coalesce(p_auto_include, b.auto_include)), null);
  end if;
  return jsonb_build_object('published', coalesce(p_published, b.published), 'auto_include', coalesce(p_auto_include, b.auto_include));
end
$function$;

CREATE OR REPLACE FUNCTION public.recipe_book_state()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'settings', jsonb_build_object('published', s.published, 'auto_include', s.auto_include),
    'counts', jsonb_build_object(
      'in_book', count(r.ref) filter (where r.status = 'included'),
      'removed', count(r.ref) filter (where r.status = 'removed'),
      'manual', count(r.ref) filter (where r.source = 'manual' and r.status = 'included'),
      'from_campaigns', count(r.ref) filter (where r.source = 'campaign' and r.status = 'included')))
  from public.recipe_book_settings s
  left join public.recipe_book_rows() r on true
  where s.id = 1
  group by s.published, s.auto_include
$function$;

CREATE OR REPLACE FUNCTION public.recipe_book_view(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  pub boolean;
begin
  select published into pub from public.recipe_book_settings where id = 1;
  if not coalesce(pub, false) or p_user is null
     or not exists (select 1 from auth.users u where u.id = p_user and u.deleted_at is null
                      and (u.banned_until is null or u.banned_until <= now())) then
    perform public.campaign_raise('BOOK_UNAVAILABLE');
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.ref, 'position', t.pos, 'dish_name', t.dish_name, 'author', t.author,
               'story', t.story, 'ingredients', t.ingredients, 'preparation', t.preparation,
               'photos', t.photos, 'campaign_name', t.campaign_name) order by t.pos)
        from (select r.*, row_number() over (order by lower(r.dish_name), r.ref) as pos
                from public.recipe_book_rows() r where r.status = 'included') t), '[]'::jsonb));
end
$function$;
