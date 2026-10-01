-- Legal plan items 2.1 / 2.2 / 2.4: versioned policy texts + acceptance records.
--
-- ADDITIVE ONLY. Code tolerates these objects being absent (42P01 / 42703) and
-- is gated by LEGAL_ACCEPTANCE_ENABLED, so it may ship before this is applied.
--
-- Writes: service role only (server code in web/src/lib/legal/policy-versions.ts).
-- No INSERT/UPDATE/DELETE policy exists for anon or authenticated on purpose
-- (see the 2026-09 "WITH CHECK (true)" anon-insert incident).

begin;

create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'talent', 'workspace')),
  talent_profile_id uuid null references public.talent_profiles(id) on delete restrict,
  tenant_id uuid null references public.agencies(id) on delete restrict,
  kind text not null check (kind in ('terms', 'privacy', 'cookies', 'booking')),
  version integer not null check (version > 0),
  content_hash text not null,
  rendered_text text not null,
  source_settings jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  constraint policy_versions_subject_matches_scope check (
    (scope = 'platform' and talent_profile_id is null and tenant_id is null)
    or (scope = 'talent' and talent_profile_id is not null)
    or (scope = 'workspace' and tenant_id is not null and talent_profile_id is null)
  )
);

-- One version number per (scope, subject, kind). NULL subjects are folded to a
-- sentinel so the platform scope is unique too.
create unique index if not exists policy_versions_scope_subject_kind_version_uq
  on public.policy_versions (
    scope,
    coalesce(talent_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    version
  );

create index if not exists policy_versions_talent_kind_idx
  on public.policy_versions (talent_profile_id, kind, version desc)
  where talent_profile_id is not null;
create index if not exists policy_versions_tenant_kind_idx
  on public.policy_versions (tenant_id, kind, version desc)
  where tenant_id is not null;

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null references public.policy_versions(id) on delete restrict,
  actor_user_id uuid null references auth.users(id) on delete set null,
  guest_session_id uuid null,
  -- Tenant the acceptance happened in (inquiry/booking home). Lets workspace
  -- staff read acceptances for their own contexts. Null for platform signup.
  tenant_id uuid null references public.agencies(id) on delete set null,
  context text not null check (context in ('signup', 'inquiry', 'offer_approval', 'payment')),
  context_id uuid null,
  accepted_at timestamptz not null default now(),
  ip_hash text null,
  user_agent text null,
  age_confirmed boolean not null default false
);

create index if not exists terms_acceptances_actor_idx
  on public.terms_acceptances (actor_user_id) where actor_user_id is not null;
create index if not exists terms_acceptances_context_idx
  on public.terms_acceptances (context, context_id);
create index if not exists terms_acceptances_tenant_idx
  on public.terms_acceptances (tenant_id) where tenant_id is not null;

alter table public.policy_versions enable row level security;
alter table public.terms_acceptances enable row level security;

revoke all on table public.policy_versions from anon, authenticated;
revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.policy_versions to anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

-- Policy texts are public documents: anyone may read published versions.
drop policy if exists policy_versions_public_read on public.policy_versions;
create policy policy_versions_public_read on public.policy_versions
  for select to anon, authenticated
  using (true);

drop policy if exists terms_acceptances_own_read on public.terms_acceptances;
create policy terms_acceptances_own_read on public.terms_acceptances
  for select to authenticated
  using (actor_user_id = auth.uid());

drop policy if exists terms_acceptances_staff_read on public.terms_acceptances;
create policy terms_acceptances_staff_read on public.terms_acceptances
  for select to authenticated
  using (tenant_id is not null and public.is_staff_of_tenant(tenant_id));

-- Stamp which booking-policy version governed the offer / booking.
alter table public.inquiry_offers
  add column if not exists policy_version_id uuid null
  references public.policy_versions(id) on delete set null;
alter table public.agency_bookings
  add column if not exists policy_version_id uuid null
  references public.policy_versions(id) on delete set null;

comment on table public.policy_versions is
  'Immutable rendered policy texts (terms/privacy/cookies/booking) per scope+subject. New row only when content_hash changes. Service-role writes only.';
comment on table public.terms_acceptances is
  'Who accepted which policy_version, in which context. Service-role writes only; users read own, workspace staff read their tenant.';

commit;
