-- Talent Forge lead-generation database setup
-- Run this entire file in Supabase > SQL Editor > New query.
-- The backend uses the Supabase service-role key. Never put that key in browser code.

create extension if not exists pgcrypto;
create sequence if not exists public.talent_forge_lead_seq start 1;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  employee_id text,
  designation text,
  role text not null check (role in ('admin', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique,
  dedupe_key text not null unique,
  full_name text not null,
  email text not null,
  mobile text not null,
  professional_category text not null,
  primary_skills text not null,
  experience_level text not null,
  current_status text not null,
  preferred_membership_duration text,
  additional_questions text,
  privacy_consent boolean not null default false,
  assigned_employee_name text not null,
  employee_id text not null,
  employee_designation text not null,
  assigned_to uuid references public.user_profiles(user_id),
  funnel_url text,
  lead_source text,
  campaign_source text,
  visitor_id uuid,
  submission_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  submission_time time without time zone not null default ((now() at time zone 'Asia/Kolkata')::time),
  submitted_at timestamptz not null default now(),
  lead_status text not null default 'New Enquiry',
  enrolment_status text not null default 'Not Started',
  next_follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_status_check check (lead_status in (
    'New Enquiry','Contacted','Interested','Official Website Shared','Follow-Up Required',
    'Enrolment in Progress','Enrolled — Verified','Not Interested','Closed'
  )),
  constraint leads_consent_check check (privacy_consent = true)
);

create index if not exists leads_created_at_idx on public.leads(created_at desc);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to, created_at desc);
create index if not exists leads_status_idx on public.leads(lead_status);
create index if not exists leads_email_idx on public.leads(email);
create index if not exists leads_mobile_idx on public.leads(mobile);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  note text not null,
  next_follow_up_date date,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now()
);
create index if not exists lead_notes_lead_id_idx on public.lead_notes(lead_id, created_at desc);

create table if not exists public.lead_audit_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_user_id uuid references public.user_profiles(user_id),
  action text not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_audit_log_lead_id_idx on public.lead_audit_log(lead_id, created_at desc);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('page_view','section_view','plan_click','form_open','form_abandon','form_submit')),
  visitor_id uuid not null,
  page text not null,
  lead_source text,
  campaign_source text,
  employee_id text,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_visitor_idx on public.analytics_events(visitor_id);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  job_type text not null check (job_type in ('email_executive','email_employee','email_prospect','excel_sync')),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lead_id, job_type)
);
create index if not exists automation_jobs_due_idx on public.automation_jobs(status, next_attempt_at) where status = 'pending';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists automation_jobs_set_updated_at on public.automation_jobs;
create trigger automation_jobs_set_updated_at before update on public.automation_jobs
for each row execute function public.set_updated_at();

-- This function creates the lead AND its four automation jobs in one database transaction.
-- That prevents a saved enquiry from being left without notification/export jobs.
create or replace function public.create_membership_lead(
  p_lead jsonb,
  p_assigned_to uuid,
  p_dedupe_key text
)
returns table(lead_id text, lead_uuid uuid, is_duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_lead_id text;
  v_sequence bigint;
  v_inserted boolean := false;
  v_profile public.user_profiles%rowtype;
begin
  if p_assigned_to is null then
    raise exception 'Assigned employee account is required';
  end if;

  select * into v_profile
  from public.user_profiles
  where user_id = p_assigned_to and role = 'employee' and is_active = true;

  if not found then
    raise exception 'Assigned employee profile is missing, inactive, or not an employee';
  end if;

  select l.id, l.lead_id into v_id, v_lead_id
  from public.leads l
  where l.dedupe_key = p_dedupe_key;

  if found then
    return query select v_lead_id, v_id, true;
    return;
  end if;

  v_sequence := nextval('public.talent_forge_lead_seq');
  v_lead_id := 'TF-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(v_sequence::text, 6, '0');
  v_id := gen_random_uuid();

  insert into public.leads (
    id, lead_id, dedupe_key, full_name, email, mobile, professional_category,
    primary_skills, experience_level, current_status, preferred_membership_duration,
    additional_questions, privacy_consent, assigned_employee_name, employee_id,
    employee_designation, assigned_to, funnel_url, lead_source, campaign_source,
    visitor_id, submission_date, submission_time, submitted_at, lead_status, enrolment_status
  ) values (
    v_id, v_lead_id, p_dedupe_key,
    p_lead->>'full_name', lower(p_lead->>'email'), p_lead->>'mobile', p_lead->>'professional_category',
    p_lead->>'primary_skills', p_lead->>'experience_level', p_lead->>'current_status',
    nullif(p_lead->>'preferred_membership_duration',''), p_lead->>'additional_questions',
    coalesce((p_lead->>'privacy_consent')::boolean, false), p_lead->>'assigned_employee_name',
    p_lead->>'employee_id', p_lead->>'employee_designation', p_assigned_to,
    p_lead->>'funnel_url', p_lead->>'lead_source', p_lead->>'campaign_source',
    nullif(p_lead->>'visitor_id','')::uuid,
    (now() at time zone 'Asia/Kolkata')::date,
    (now() at time zone 'Asia/Kolkata')::time,
    now(), 'New Enquiry', 'Not Started'
  ) on conflict (dedupe_key) do nothing
  returning id, lead_id into v_id, v_lead_id;

  v_inserted := found;
  if not v_inserted then
    select l.id, l.lead_id into v_id, v_lead_id from public.leads l where l.dedupe_key = p_dedupe_key;
    return query select v_lead_id, v_id, true;
    return;
  end if;

  insert into public.automation_jobs(lead_id, job_type, idempotency_key)
  values
    (v_id, 'email_executive', v_lead_id || ':email_executive'),
    (v_id, 'email_employee', v_lead_id || ':email_employee'),
    (v_id, 'email_prospect', v_lead_id || ':email_prospect'),
    (v_id, 'excel_sync', v_lead_id || ':excel_sync');

  return query select v_lead_id, v_id, false;
end;
$$;

-- Claim due jobs safely so two application instances do not normally pick the same job.
create or replace function public.claim_automation_jobs(p_limit integer default 5)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select id
    from public.automation_jobs
    where status = 'pending' and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.automation_jobs j
     set status = 'processing', attempts = j.attempts + 1, updated_at = now()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$$;

-- All customer/lead data is accessed through the backend only.
-- RLS is enabled and direct browser access is revoked for anon/authenticated roles.
alter table public.user_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_audit_log enable row level security;
alter table public.analytics_events enable row level security;
alter table public.automation_jobs enable row level security;

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.leads from anon, authenticated;
revoke all on public.lead_notes from anon, authenticated;
revoke all on public.lead_audit_log from anon, authenticated;
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.automation_jobs from anon, authenticated;
revoke all on sequence public.talent_forge_lead_seq from anon, authenticated;

revoke all on function public.create_membership_lead(jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_automation_jobs(integer) from public, anon, authenticated;
grant execute on function public.create_membership_lead(jsonb, uuid, text) to service_role;
grant execute on function public.claim_automation_jobs(integer) to service_role;
grant usage, select on sequence public.talent_forge_lead_seq to service_role;
grant all on public.user_profiles, public.leads, public.lead_notes, public.lead_audit_log, public.analytics_events, public.automation_jobs to service_role;

-- IMPORTANT: After creating a user in Supabase Authentication > Users, add its profile:
-- insert into public.user_profiles(user_id, full_name, employee_id, designation, role)
-- values ('SUPABASE_AUTH_USER_UUID', 'Employee Name', 'COMPANY_EMPLOYEE_ID', 'Talent Forge Associate', 'employee');
-- Use role='admin' for an authorised administrator. Do not make every employee an admin.
