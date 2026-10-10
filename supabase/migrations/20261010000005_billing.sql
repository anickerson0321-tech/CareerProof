-- Stripe webhook events we've already processed, so a retried delivery is a no-op.
-- Not user-owned: RLS is on with no policies, so only the service role can use it.

create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
grant all on public.stripe_events to service_role;
