-- When the billing fields were last set from a Stripe event. Webhooks can
-- arrive out of order; an event older than this is ignored so a stale
-- "subscription updated" can't undo a newer cancellation (or the reverse).
-- Not in the authenticated update grant, so users can't change it.
alter table public.profiles add column billing_event_at timestamptz;
