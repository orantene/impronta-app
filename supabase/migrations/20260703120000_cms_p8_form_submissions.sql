-- Phase 8 — form submissions
--
-- Captures lead-form submissions from the CMS contact_form section.
-- Tenant-scoped, keyed by section_id so the operator can filter by
-- which form on the site the submission came from. The actual
-- payload is stored as JSONB so we don't have to evolve schema for
-- every form-shape change.
--
-- The contact_form section's `action` field can still point at
-- Formspree / mailto / etc — this table is the optional self-hosted
-- alternative. The /api/cms/forms/submit endpoint accepts POSTs that
-- include `__tulala_section` (the section uuid) as a hidden field;
-- that's how the section <form> is wired when `action=internal`.

create table if not exists public.cms_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  section_id uuid not null references public.cms_sections(id) on delete cascade,
  payload_jsonb jsonb not null default '{}'::jsonb,
  /* Lightweight metadata. Email + name are projected from payload to make
     admin list views cheap; payload stays the source of truth. */
  contact_email text null,
  contact_name text null,
  source_url text null,
  user_agent text null,
  ip_address inet null,
  /* Spam control. honeypot_tripped=TRUE means we DROP the submission
     server-side but still log it for analytics. */
  honeypot_tripped boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'read', 'archived', 'spam')),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  archived_at timestamptz null
);

create index if not exists cms_form_submissions_tenant_created_idx
  on public.cms_form_submissions (tenant_id, created_at desc);
create index if not exists cms_form_submissions_section_idx
  on public.cms_form_submissions (section_id);
create index if not exists cms_form_submissions_status_idx
  on public.cms_form_submissions (tenant_id, status, created_at desc);

alter table public.cms_form_submissions enable row level security;

-- Service-role does the inserts (anonymous submissions land via the
-- public POST endpoint; we never expose anon insert to RLS).
-- Staff reads via tenant scope.
create policy cms_form_submissions_staff_read on public.cms_form_submissions
  for select to authenticated
  using (
    public.is_staff_of_tenant(cms_form_submissions.tenant_id)
  );

create policy cms_form_submissions_staff_update on public.cms_form_submissions
  for update to authenticated
  using (
    public.is_staff_of_tenant(cms_form_submissions.tenant_id)
  );

comment on table public.cms_form_submissions is
  'Lead-form submissions from CMS contact_form sections. Anonymous inserts via /api/cms/forms/submit (service role); staff reads via tenant scope.';
