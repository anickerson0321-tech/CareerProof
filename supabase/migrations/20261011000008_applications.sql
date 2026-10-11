-- Create an application with its requirements and evidence in one transaction.
-- Runs as the calling user (security invoker), so RLS and the same-user foreign
-- keys still apply: evidence can only point at the caller's own facts.
--
-- p_requirements: [{ code, position, text, kind, logic, parts[], ai_status, explanation,
--                    question, years_required, relevant_job_ids[], evidence_fact_ids[] }]

create function public.create_application(
  p_title text,
  p_employer text,
  p_posting_text text,
  p_posting_url text,
  p_ignored_note text,
  p_requirements jsonb
) returns uuid
language plpgsql
security invoker
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

  insert into public.applications (user_id, title, employer, posting_text, posting_url, ignored_note)
  values (uid, coalesce(p_title, ''), coalesce(p_employer, ''), p_posting_text, p_posting_url, p_ignored_note)
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

-- Counts applications ever created, for the free plan limit. Server only.
create function public.record_application(p_user uuid) returns integer
language sql
security definer
set search_path = ''
as $$
  update public.profiles set applications_created = applications_created + 1 where user_id = p_user
  returning applications_created;
$$;

revoke all on function public.record_application(uuid) from public, anon, authenticated;
grant execute on function public.record_application(uuid) to service_role;
