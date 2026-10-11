-- Codes are always assigned by the assign_*_code triggers; the empty default only
-- tells clients they don't need to send one.
alter table public.facts alter column code set default '';
alter table public.jobs alter column code set default '';
