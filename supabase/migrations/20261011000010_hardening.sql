-- Security hardening from review.

-- 1. AI calls: reserve a slot atomically BEFORE calling the model, so
--    parallel requests can't all pass the rate limits and cost cap. A per-user
--    advisory lock serializes the check and the insert. The reserved row holds
--    a worst-case cost estimate until the call finishes and the server writes
--    the real usage. Server only.
create function public.reserve_ai_call(
  p_user uuid,
  p_task text,
  p_model text,
  p_estimate numeric,
  p_per_minute integer,
  p_per_day integer,
  p_cap numeric
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minute integer;
  v_day integer;
  v_spent numeric;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_calls:' || p_user::text, 0));

  select count(*) filter (where created_at >= now() - interval '1 minute'), count(*)
    into v_minute, v_day
    from public.ai_calls
   where user_id = p_user and created_at >= now() - interval '1 day';
  if v_minute >= p_per_minute then
    raise exception 'rate_minute' using errcode = 'P0001';
  end if;
  if v_day >= p_per_day then
    raise exception 'rate_day' using errcode = 'P0001';
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from public.ai_calls
   where user_id = p_user
     and created_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
  if v_spent + p_estimate > p_cap then
    raise exception 'cost_cap' using errcode = 'P0001';
  end if;

  insert into public.ai_calls (user_id, task, model, cost_usd, success, error_code)
  values (p_user, p_task, p_model, p_estimate, false, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, text, text, numeric, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, text, numeric, integer, integer, numeric) to service_role;

-- 2. Plan limits, checked and counted in one statement so parallel requests
--    can't both pass. The free numbers mirror PLAN_LIMITS in lib/billing/plans.ts.

-- Imports: reserved before the AI reads the resume, released if it fails.
create function public.reserve_import(p_user uuid) returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.profiles set imports_used = imports_used + 1
     where user_id = p_user and (plan = 'pro' or imports_used < 1)
    returning 1
  )
  select exists (select 1 from updated);
$$;

create function public.release_import(p_user uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set imports_used = greatest(imports_used - 1, 0) where user_id = p_user;
$$;

revoke all on function public.reserve_import(uuid) from public, anon, authenticated;
revoke all on function public.release_import(uuid) from public, anon, authenticated;
grant execute on function public.reserve_import(uuid) to service_role;
grant execute on function public.release_import(uuid) to service_role;

drop function public.record_import(uuid);
drop function public.record_application(uuid);

-- Applications: users can no longer insert applications or requirements
-- directly; create_application is the only way in, and it counts against the
-- plan limit in the same transaction. It now runs as definer, so it scopes
-- every row to auth.uid() itself; the composite same-user foreign keys still
-- stop evidence from pointing at another user's facts.
revoke insert on public.applications from authenticated;
revoke insert on public.requirements from authenticated;

create or replace function public.create_application(
  p_title text,
  p_employer text,
  p_posting_text text,
  p_posting_url text,
  p_ignored_note text,
  p_requirements jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  app_id uuid;
  req jsonb;
  req_id uuid;
  fact_id text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) > 20 then
    raise exception 'Too many requirements';
  end if;

  update public.profiles set applications_created = applications_created + 1
   where user_id = uid and (plan = 'pro' or applications_created < 2);
  if not found then
    raise exception 'limit_applications' using errcode = 'P0001';
  end if;

  insert into public.applications (user_id, title, employer, posting_text, posting_url, ignored_note)
  values (uid, left(coalesce(p_title, ''), 200), left(coalesce(p_employer, ''), 200), p_posting_text, left(p_posting_url, 2000), left(p_ignored_note, 2000))
  returning id into app_id;

  for req in select * from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) loop
    insert into public.requirements (
      user_id, application_id, code, text, kind, logic, parts, ai_status, explanation,
      question, years_required, relevant_job_ids, position
    )
    values (
      uid,
      app_id,
      req ->> 'code',
      req ->> 'text',
      (req ->> 'kind')::public.req_kind,
      (req ->> 'logic')::public.req_logic,
      coalesce(array(select jsonb_array_elements_text(req -> 'parts')), '{}'),
      (req ->> 'ai_status')::public.ai_status,
      coalesce(req ->> 'explanation', ''),
      req ->> 'question',
      (req ->> 'years_required')::numeric,
      coalesce(array(select jsonb_array_elements_text(req -> 'relevant_job_ids'))::uuid[], '{}'),
      coalesce((req ->> 'position')::integer, 0)
    )
    returning id into req_id;

    for fact_id in select jsonb_array_elements_text(coalesce(req -> 'evidence_fact_ids', '[]'::jsonb)) loop
      insert into public.requirement_evidence (requirement_id, fact_id, user_id)
      values (req_id, fact_id::uuid, uid);
    end loop;
  end loop;

  return app_id;
end;
$$;

revoke all on function public.create_application(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_application(text, text, text, text, text, jsonb) to authenticated;

-- 3. Size limits on text that is sent to the AI, so a direct write can't
--    make prompts enormous.
alter table public.source_documents add constraint source_documents_text_size check (char_length(extracted_text) <= 60000);
alter table public.requirements add constraint requirements_text_size check (char_length(text) <= 1000);
alter table public.requirements add constraint requirements_explanation_size check (char_length(explanation) <= 2000);
alter table public.requirements add constraint requirements_question_size check (question is null or char_length(question) <= 1000);
alter table public.facts add constraint facts_source_passage_size check (source_passage is null or char_length(source_passage) <= 2000);
alter table public.facts add constraint facts_note_size check (note is null or char_length(note) <= 1000);
alter table public.jobs add constraint jobs_text_size check (
  char_length(employer) <= 200 and char_length(title) <= 200 and (location is null or char_length(location) <= 200)
);

-- 4. Internal functions: Supabase grants EXECUTE to anon and authenticated by
--    default, which "revoke ... from public" doesn't undo.
revoke all on function public.next_code(uuid, text) from anon, authenticated;
revoke all on function public.assign_fact_code() from anon, authenticated;
revoke all on function public.assign_job_code() from anon, authenticated;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.stamp_fact_confirmed() from anon, authenticated;
