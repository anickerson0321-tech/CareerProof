-- Insert the jobs and facts from one resume import in a single transaction, so
-- a failure never leaves half an import behind. Runs as the calling user
-- (security invoker), so Row Level Security still applies to every insert.
--
-- p_jobs:  [{ key, employer, title, location, start_date, end_date, dates_uncertain }]
-- p_facts: [{ type, text, normalized_text, source_passage, note, job_key | job_id }]
--          job_key refers to a job in p_jobs; job_id to an existing job.

create function public.import_vault_items(p_source_document_id uuid, p_jobs jsonb, p_facts jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  job jsonb;
  item jsonb;
  new_id uuid;
  job_ids jsonb := '{}'::jsonb;
  fact_ids uuid[] := '{}';
  resolved_job uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  for job in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
    insert into public.jobs (user_id, employer, title, location, start_date, end_date, dates_uncertain, status, source_document_id)
    values (
      uid,
      coalesce(job ->> 'employer', ''),
      coalesce(job ->> 'title', ''),
      job ->> 'location',
      job ->> 'start_date',
      job ->> 'end_date',
      coalesce((job ->> 'dates_uncertain')::boolean, false),
      'pending',
      p_source_document_id
    )
    returning id into new_id;
    job_ids := job_ids || jsonb_build_object(job ->> 'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_facts, '[]'::jsonb)) loop
    resolved_job := null;
    if item ? 'job_key' and item ->> 'job_key' is not null then
      resolved_job := (job_ids ->> (item ->> 'job_key'))::uuid;
    elsif item ? 'job_id' and item ->> 'job_id' is not null then
      resolved_job := (item ->> 'job_id')::uuid;
    end if;

    insert into public.facts (
      user_id, type, job_id, text, normalized_text, source_passage, source_document_id,
      origin, explicit, note, status
    )
    values (
      uid,
      (item ->> 'type')::public.fact_type,
      resolved_job,
      item ->> 'text',
      coalesce(item ->> 'normalized_text', ''),
      item ->> 'source_passage',
      p_source_document_id,
      'resume',
      true,
      item ->> 'note',
      'pending'
    )
    returning id into new_id;
    fact_ids := fact_ids || new_id;
  end loop;

  return jsonb_build_object('job_ids', job_ids, 'fact_ids', to_jsonb(fact_ids));
end;
$$;

revoke all on function public.import_vault_items(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_vault_items(uuid, jsonb, jsonb) to authenticated;

-- Counts a completed import for plan limits. Server (service role) only.
create function public.record_import(p_user uuid) returns integer
language sql
security definer
set search_path = ''
as $$
  update public.profiles set imports_used = imports_used + 1 where user_id = p_user returning imports_used;
$$;

revoke all on function public.record_import(uuid) from public, anon, authenticated;
grant execute on function public.record_import(uuid) to service_role;
