-- Human-readable codes (E1, E2… for facts; j1, j2… for jobs) are assigned by the
-- database, per user, and never reused. A document that cites E7 can never end up
-- pointing at a different fact after E7 is removed.

create function public.next_code(p_user uuid, p_kind text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_kind = 'fact' then
    update public.profiles set next_fact_no = next_fact_no + 1
      where user_id = p_user returning next_fact_no - 1 into n;
    if n is null then raise exception 'No profile for user %', p_user; end if;
    return 'E' || n;
  elsif p_kind = 'job' then
    update public.profiles set next_job_no = next_job_no + 1
      where user_id = p_user returning next_job_no - 1 into n;
    if n is null then raise exception 'No profile for user %', p_user; end if;
    return 'j' || n;
  end if;
  raise exception 'Unknown code kind %', p_kind;
end;
$$;

revoke all on function public.next_code(uuid, text) from public;

create function public.assign_fact_code() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.code := public.next_code(new.user_id, 'fact');
  else
    new.code := old.code;
  end if;
  return new;
end;
$$;

create function public.assign_job_code() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.code := public.next_code(new.user_id, 'job');
  else
    new.code := old.code;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_fact_code() from public;
revoke all on function public.assign_job_code() from public;

create trigger facts_assign_code before insert or update of code on public.facts
  for each row execute function public.assign_fact_code();
create trigger jobs_assign_code before insert or update of code on public.jobs
  for each row execute function public.assign_job_code();

-- Confirming a fact stamps confirmed_at; un-confirming clears it.
create function public.stamp_fact_confirmed() returns trigger
language plpgsql as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := now();
  elsif new.status <> 'confirmed' then
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

create trigger facts_stamp_confirmed before insert or update of status on public.facts
  for each row execute function public.stamp_fact_confirmed();

-- A profile row is created for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
