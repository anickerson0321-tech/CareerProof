-- Keep trigger behavior independent of the caller's mutable search_path.
-- Both functions use NEW/OLD and pg_catalog builtins only; no data changes.
alter function public.set_updated_at() set search_path = '';
alter function public.stamp_fact_confirmed() set search_path = '';
