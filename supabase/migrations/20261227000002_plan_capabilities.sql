-- Track C, at last: plan entitlements become DATA.
--
-- WHY
-- ───
-- `lib/access/plan-capabilities.ts` has granted ALL_CAPS to all nine plan keys
-- since Phase 1, under a header promising "Track C tightens the per-plan
-- subsets". Track C never landed, so as of 2026-09-02 the commercial position
-- is: a Free workspace and an Agency workspace differ by four counters (roster
-- seats, team seats, builder page count, custom-domain eligibility) and by
-- nothing else. Eighteen of the twenty-one features in the public catalog are
-- available on Free.
--
-- The blocker was never the SQL. It was that "what does each plan include" had
-- no home: it was asserted in twelve places (marketing copy, Stripe product
-- descriptions, a reference table nothing reads, four code tables, the public
-- compare table, the trial CTA) and enforced in four. This table is the home.
--
-- BEHAVIOUR ON DAY ONE: IDENTICAL, BY CONSTRUCTION
-- ───────────────────────────────────────────────
-- The table ships EMPTY, and a missing row means GRANTED. So on the day this
-- lands, every capability check resolves exactly as it does today, because
-- every check misses. Nothing is taken away from any tenant.
--
-- That is deliberate and load-bearing. Moving the decision out of code and
-- CHANGING the decision are two different changes; doing both at once would
-- make a packaging mistake and a plumbing mistake indistinguishable in
-- production. The packaging pass happens afterwards, as data edits through
-- Platform Admin, each audited and individually reversible.
--
-- A ROW MEANS A DECISION
-- ──────────────────────
-- Because absence means granted, the presence of a row is meaningful: somebody
-- deliberately packaged this capability for this plan. `included = false` is a
-- deliberate withhold; `included = true` is a deliberate grant recorded so the
-- matrix reads completely in the admin UI. `note` carries the reasoning so the
-- decision survives the person who made it.
--
-- FAIL-OPEN IS THE RIGHT DEFAULT *HERE*, AND ONLY HERE
-- ────────────────────────────────────────────────────
-- Fail-open is normally the wrong instinct in an authorization path. It is
-- correct at this specific layer for two reasons: (1) the plan check is the
-- LAST gate in `authorize()` — role, membership, tenant status and platform
-- role have all already passed, so a miss here cannot grant access to someone
-- who was not otherwise entitled; it can only fail to UPSELL them. (2) The
-- alternative, fail-closed, means a capability added to the registry but not
-- yet packaged instantly locks every tenant out of a shipped feature. That is a
-- production outage caused by paperwork.

create table if not exists public.plan_capabilities (
  plan_key        text        not null,
  capability_key  text        not null,
  included        boolean     not null,
  -- Operator-facing reason this cell is what it is. Surfaced in the admin
  -- matrix so a packaging decision carries its reasoning forward.
  note            text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid        references auth.users (id) on delete set null,
  primary key (plan_key, capability_key),
  constraint plan_capabilities_plan_key_known check (
    plan_key in (
      'free', 'website', 'studio', 'agency', 'network', 'legacy',
      'talent_basic', 'talent_pro', 'talent_portfolio'
    )
  )
);

comment on table public.plan_capabilities is
  'Plan x capability entitlement matrix. THE source of truth for what a plan '
  'includes. Read by lib/access/plan-capabilities.ts via a cached service-role '
  'loader; edited in Platform Admin > Commerce > Entitlements. Ships empty: a '
  'MISSING ROW MEANS GRANTED, so introducing this table changed no behaviour. '
  'Every write is audited to platform_audit_log.';

comment on column public.plan_capabilities.included is
  'FALSE = this plan does not grant this capability. TRUE = deliberate grant, '
  'recorded so the admin matrix reads completely. A missing row is GRANTED '
  '(fail-open) — see the migration header for why that is correct at this '
  'layer and nowhere else in authorize().';

comment on column public.plan_capabilities.note is
  'Why this cell is what it is. Shown to the operator in the admin matrix.';

create index if not exists plan_capabilities_plan_key_idx
  on public.plan_capabilities (plan_key);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read by the server-side authorization resolver using the service role, and
-- written only by platform admins through an audited server action. No anon or
-- authenticated client has any business touching it, so RLS is enabled with NO
-- permissive policy: the service role bypasses RLS, everyone else gets nothing.
--
-- Per incident_revoke_from_anon_noop_public_grant: `REVOKE ... FROM anon` is a
-- no-op against a PUBLIC grant, so PUBLIC is revoked explicitly and first.

alter table public.plan_capabilities enable row level security;
alter table public.plan_capabilities force row level security;

revoke all on public.plan_capabilities from public;
revoke all on public.plan_capabilities from anon;
revoke all on public.plan_capabilities from authenticated;

-- ── The seat-limit invariant (audit P1.1) ───────────────────────────────────
-- `agencies.plan_tier` and `agencies.talent_seat_limit` are two independently
-- written columns with no invariant tying them together, and nothing recomputes
-- the limit when the tier moves. On 2026-09-02 that had produced a live tenant
-- on the `agency` plan carrying a seat limit of 5 — it would have been refused
-- its sixth profile while paying for unlimited. The data was corrected in
-- 20261227000001; this stops it recurring.
--
-- Deliberately a CHECK on the unlimited tiers only, not a full plan->limit
-- mirror: Free and Studio limits are legitimately overridden downward for
-- individual tenants (trials, abuse throttling), so pinning every tier would
-- break real operations. What is never legitimate is a FINITE cap on a tier
-- sold as unlimited.

alter table public.agencies
  drop constraint if exists agencies_unlimited_tiers_have_no_seat_cap;

alter table public.agencies
  add constraint agencies_unlimited_tiers_have_no_seat_cap
  check (
    plan_tier not in ('agency', 'network', 'legacy')
    or talent_seat_limit is null
  )
  not valid;

-- `not valid` skips the full-table scan on add; validate separately so the
-- statement above cannot block on a large table, and so a pre-existing bad row
-- surfaces as a clear validation error rather than a failed migration.
alter table public.agencies
  validate constraint agencies_unlimited_tiers_have_no_seat_cap;
