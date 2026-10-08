-- Legal plan 2.2: platform policy versions + acceptance records.
--
-- ADDITIVE ONLY. Talent booking policies already live in
-- talent_policy_versions (20261231299590) and are stamped on inquiries / offers
-- / bookings / orders (20261231299610); this migration does NOT duplicate them.
-- platform_policy_versions holds only Tulala's own documents (Terms, Privacy,
-- Cookies). terms_acceptances records who accepted which version, where.
--
-- Code (web/src/lib/legal/acceptances.ts) tolerates these objects being absent
-- (42P01 / PGRST205) and is gated by LEGAL_ACCEPTANCE_ENABLED.
--
-- Writes: service role only. No INSERT/UPDATE/DELETE policy exists for anon or
-- authenticated on purpose (see the 2026-09 "WITH CHECK (true)" incident).

begin;

create table if not exists public.platform_policy_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('terms', 'privacy', 'cookies')),
  version integer not null check (version > 0),
  content_hash text not null,
  revision_tag text not null,
  url text not null,
  published_at timestamptz not null default now(),
  constraint platform_policy_versions_kind_version_uq unique (kind, version),
  constraint platform_policy_versions_kind_tag_uq unique (kind, revision_tag)
);

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  platform_policy_version_id uuid null
    references public.platform_policy_versions(id) on delete restrict,
  talent_policy_version_id uuid null
    references public.talent_policy_versions(id) on delete set null,
  tenant_id uuid null references public.agencies(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  guest_session_id uuid null,
  context text not null check (context in ('signup', 'inquiry', 'offer_approval', 'payment')),
  context_id uuid null,
  accepted_at timestamptz not null default now(),
  ip_hash text null,
  user_agent text null,
  age_confirmed boolean not null default false,
  constraint terms_acceptances_some_version check (
    platform_policy_version_id is not null or talent_policy_version_id is not null
  )
);

create index if not exists terms_acceptances_actor_idx
  on public.terms_acceptances (actor_user_id) where actor_user_id is not null;
create index if not exists terms_acceptances_context_idx
  on public.terms_acceptances (context, context_id);
create index if not exists terms_acceptances_tenant_idx
  on public.terms_acceptances (tenant_id) where tenant_id is not null;

alter table public.platform_policy_versions enable row level security;
alter table public.terms_acceptances enable row level security;

revoke all on table public.platform_policy_versions from anon, authenticated;
revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.platform_policy_versions to anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

-- Platform policy metadata is public (the documents themselves are public pages).
drop policy if exists platform_policy_versions_public_read on public.platform_policy_versions;
create policy platform_policy_versions_public_read on public.platform_policy_versions
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

comment on table public.platform_policy_versions is
  'Tulala platform documents (terms/privacy/cookies) by revision. New row only when the revision tag changes. Service-role writes only.';
comment on table public.terms_acceptances is
  'Who accepted which platform or talent policy version, in which context. Service-role writes only; users read own, workspace staff read their tenant.';

commit;
