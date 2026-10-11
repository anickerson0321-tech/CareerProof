-- Earlier employer + title pairs of a job the person edited, normalized the
-- same way as at import, so re-importing the original resume recognizes the
-- job instead of adding it again.
alter table public.jobs add column previous_identities text[] not null default '{}';
