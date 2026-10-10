-- CareerProof core schema.
-- Every user-owned table carries user_id, and child rows reference their parent
-- through (parent_id, user_id) so a row can never point at another user's data.

-- Enums ---------------------------------------------------------------------

create type public.fact_type as enum (
  'duty', 'accomplishment', 'skill', 'education', 'certification',
  'training', 'summary_claim', 'answer', 'other'
);
create type public.fact_origin as enum ('resume', 'answer', 'manual');
-- 'unsupported' = removed by the user; kept so a re-import doesn't bring it back.
create type public.fact_status as enum ('confirmed', 'pending', 'unsupported');
create type public.job_status as enum ('confirmed', 'pending');
create type public.app_status as enum ('draft', 'applied', 'interviewing', 'offer', 'closed');
create type public.req_kind as enum ('required', 'preferred');
create type public.req_logic as enum ('all', 'any');
create type public.ai_status as enum ('strong', 'partial', 'hidden', 'unknown');
create type public.doc_kind as enum ('resume', 'cover_letter');
create type public.page_target as enum ('strict_one', 'one_if_possible', 'up_to_two');
create type public.plan as enum ('free', 'pro');

-- updated_at ----------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tables --------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  location text,
  headline text,
  plan public.plan not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  next_fact_no integer not null default 1,
  next_job_no integer not null default 1,
  imports_used integer not null default 0,
  applications_created integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text,
  filename text,
  mime_type text,
  size_bytes integer,
  extracted_text text not null default '',
  extraction_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  employer text not null default '',
  title text not null default '',
  location text,
  start_date text,
  end_date text,
  dates_uncertain boolean not null default false,
  status public.job_status not null default 'pending',
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, code),
  foreign key (source_document_id, user_id)
    references public.source_documents (id, user_id) on delete set null (source_document_id),
  constraint jobs_start_date_format check (start_date is null or start_date ~ '^(\d{4}(-(0[1-9]|1[0-2]))?|present)$'),
  constraint jobs_end_date_format check (end_date is null or end_date ~ '^(\d{4}(-(0[1-9]|1[0-2]))?|present)$')
);

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  type public.fact_type not null,
  job_id uuid,
  text text not null check (length(text) between 1 and 1000),
  normalized_text text not null default '',
  source_passage text,
  source_document_id uuid,
  origin public.fact_origin not null,
  explicit boolean not null default true,
  note text,
  status public.fact_status not null default 'pending',
  -- How sure extraction was. Never used as, or confused with, status.
  extraction_confidence numeric check (extraction_confidence is null or extraction_confidence between 0 and 1),
  confirmed_at timestamptz,
  answered_requirement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, code),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete set null (job_id),
  foreign key (source_document_id, user_id)
    references public.source_documents (id, user_id) on delete set null (source_document_id)
);

create table public.fact_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fact_id uuid not null,
  previous_text text not null,
  new_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fact_id, user_id) references public.facts (id, user_id) on delete cascade
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  employer text not null default '',
  posting_text text not null check (length(posting_text) <= 40000),
  posting_url text,
  ignored_note text,
  status public.app_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null,
  code text not null,
  text text not null,
  kind public.req_kind not null,
  logic public.req_logic not null default 'all',
  parts text[] not null default '{}',
  ai_status public.ai_status not null,
  explanation text not null default '',
  question text,
  years_required numeric check (years_required is null or years_required > 0),
  relevant_job_ids uuid[] not null default '{}',
  user_gap boolean not null default false,
  answered boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (application_id, code),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);

alter table public.facts
  add foreign key (answered_requirement_id, user_id)
  references public.requirements (id, user_id) on delete set null (answered_requirement_id);

create table public.requirement_evidence (
  requirement_id uuid not null,
  fact_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requirement_id, fact_id),
  foreign key (requirement_id, user_id) references public.requirements (id, user_id) on delete cascade,
  foreign key (fact_id, user_id) references public.facts (id, user_id) on delete cascade
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null,
  kind public.doc_kind not null,
  version integer not null check (version >= 1),
  page_target public.page_target,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, kind, version),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);

-- Metadata only. Never store prompt or response content here.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer not null default 0,
  success boolean not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes -------------------------------------------------------------------

create index source_documents_user_idx on public.source_documents (user_id);
create index jobs_user_idx on public.jobs (user_id);
create index facts_user_idx on public.facts (user_id);
create index facts_job_idx on public.facts (job_id);
create index facts_normalized_idx on public.facts (user_id, normalized_text);
create index fact_revisions_fact_idx on public.fact_revisions (fact_id);
create index applications_user_idx on public.applications (user_id, created_at desc);
create index requirements_application_idx on public.requirements (application_id, position);
create index requirement_evidence_fact_idx on public.requirement_evidence (fact_id);
create index documents_application_idx on public.documents (application_id, kind, version desc);
create index ai_calls_user_time_idx on public.ai_calls (user_id, created_at desc);

-- updated_at triggers -------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger source_documents_updated_at before update on public.source_documents
  for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger facts_updated_at before update on public.facts
  for each row execute function public.set_updated_at();
create trigger fact_revisions_updated_at before update on public.fact_revisions
  for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger requirements_updated_at before update on public.requirements
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger ai_calls_updated_at before update on public.ai_calls
  for each row execute function public.set_updated_at();
