-- Row Level Security on every table: a user sees and changes only their own rows.
--
-- Users can reach Postgres directly with their own token (that's how Supabase
-- works), so table and column privileges also stop them from changing what only
-- the server may change: plan and billing fields, usage counters, fact codes,
-- and AI usage records (which back the monthly cost cap).

alter table public.profiles enable row level security;
alter table public.source_documents enable row level security;
alter table public.jobs enable row level security;
alter table public.facts enable row level security;
alter table public.fact_revisions enable row level security;
alter table public.applications enable row level security;
alter table public.requirements enable row level security;
alter table public.requirement_evidence enable row level security;
alter table public.documents enable row level security;
alter table public.ai_calls enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;

-- profiles: read own row; update only the personal details shown on documents.
grant select on public.profiles to authenticated;
grant update (full_name, email, phone, location, headline) on public.profiles to authenticated;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ai_calls: read own usage only. Written by the server with the service role.
grant select on public.ai_calls to authenticated;
create policy "ai_calls: read own" on public.ai_calls
  for select to authenticated using (user_id = (select auth.uid()));

-- Fully user-owned tables: the four standard policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'source_documents', 'jobs', 'facts', 'fact_revisions', 'applications',
    'requirements', 'requirement_evidence', 'documents'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "%s: read own" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format(
      'create policy "%s: insert own" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format(
      'create policy "%s: update own" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format(
      'create policy "%s: delete own" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end;
$$;

-- Revisions are history: users may add and read them, not rewrite them.
revoke update on public.fact_revisions from authenticated;

-- Fact and job codes can't be changed by users: the assign_*_code triggers
-- (previous migration) put the old code back on any update.

-- Tables created later get no automatic grants to anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
