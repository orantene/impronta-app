# Phase 5/6 — M0 migration apply runbook

**Scope.** Applying the four `20260625*` M0 migrations (org kind + hub
seed, agency_domains hub-rebind, agency_memberships role CHECK,
`talent_profiles.phone_e164`) to a Supabase DB. Idempotent and additive
by design, but the hub-seed step UPDATEs an existing row in place
(`ON CONFLICT (id) DO UPDATE`) and must be audited per §2 before first
apply.

**Do not run this runbook without explicit user approval once a safe
target environment is identified.** See `m0-blockers.md` for the
reasoning behind the current (3) decision.

## 0. Target environment safety classification

Before apply, answer these three questions in the PR or commit message
where the green light is given:

1. Is the target DB **the shared production-style DB** that holds real
   tenant data? If yes, you need operator + customer-communication
   window. Everything below still applies but also plan a comms update.
2. Is the target DB **a throwaway preview** that can be reset if
   anything goes sideways? If yes, the hub-rebind audit (§2) is
   informational; re-seeding is cheap.
3. Is the target DB **already populated with seeded QA fixtures** that
   assume the pre-M0 shape (`agencies.kind` absent, hub UUID occupied
   by Tenant B, etc.)? If yes, figure out what tests will break before
   apply.

## 1. Pre-flight: confirm migration source

```bash
git checkout saas/phase-5-6-m0-foundations
ls supabase/migrations/2026062[56]*
# Expect exactly these four files:
#   20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql
#   20260625110000_saas_p56_m0_agency_domains_hub_rebind.sql
#   20260625120000_saas_p56_m0_membership_role_check.sql
#   20260625130000_saas_p56_m0_talent_phone_e164.sql
```

Confirm no uncommitted edits to any of them — these should match the
reviewed content from commit `a0fef8f` (feat: Phase 5/6 M0 foundations)
and `7925a56` (fix: reorder hub-rebind).

## 2. Hub UUID occupancy audit — **read before apply**

On the current linked DB (as of 2026-04-21), the hub UUID
`00000000-0000-0000-0000-000000000002` is **already occupied** by:

```
id          = 00000000-0000-0000-0000-000000000002
slug        = tenant-b
display_name= Tenant B (Verification)
status      = active
```

The M0 hub-seed migration contains:

```sql
INSERT INTO public.agencies (id, slug, display_name, status, kind, …)
VALUES ('00000000-…-000000000002', 'hub', 'Impronta Hub', 'active', 'hub', …)
ON CONFLICT (id) DO UPDATE
  SET slug = 'hub',
      display_name = 'Impronta Hub',
      kind = 'hub',
      …
```

**Applying M0 will rewrite that row in place.** Tenant B's slug and
display_name disappear; any data keyed by that `tenant_id` becomes
attributed to the hub. Before approving apply to a shared DB, confirm:

- [ ] No test/demo data is attached to Tenant B that must be preserved.
  Check `SELECT count(*) FROM public.talent_profiles WHERE tenant_id =
  '00000000-…-000000000002';` (and the same for inquiries, bookings,
  cms_*, agency_talent_roster). Expected on the current DB: **0 or very
  small, since Tenant B is only a verification fixture**.
- [ ] Nothing in the browser session cookies / localStorage /
  impersonation helpers references `tenant-b` as a slug. (It does not
  today — only `impronta` is referenced — but re-check if this runbook
  is used later.)
- [ ] Tenant B's `agency_domains`, `agency_memberships`,
  `agency_branding` rows are acceptable to migrate under the hub. The
  hub-rebind migration handles `agency_domains` explicitly; everything
  else follows the row via FK.

If any of the above is a concern, **rename Tenant B first** by
re-assigning it a fresh UUID (or ignoring — it's labelled
"verification" for a reason), then apply M0.

## 3. Dry run

If the Supabase project is on Pro plan (supports branches):

```bash
npx supabase branches create saas-p56-m0-dryrun
npx supabase db push --branch saas-p56-m0-dryrun
# run the verifier against the branch, expect 0 SKIPs in Tier 2
node web/scripts/verify-phase56-readonly.mjs
npx supabase branches delete saas-p56-m0-dryrun
```

Otherwise, if a Docker-local Supabase is available:

```bash
npx supabase start
npx supabase db reset                 # applies all migrations locally
node web/scripts/verify-phase56-readonly.mjs --local   # (flag not yet implemented — see §7)
npx supabase stop
```

On a Free-plan linked DB with no Docker, **the dry run cannot be
performed without writing to the shared DB**. Do not skip this step —
instead raise the tooling question to the user before apply.

## 4. Apply

Order matters. The hub-rebind migration (step 110000) depends on the
hub row existing (step 100000). Supabase's migration machinery runs
files in lexicographic order — the four files interleave correctly.

```bash
# Commit on branch where the code expecting M0 is ready to ship:
git checkout saas/phase-5-6-m0-foundations
npx supabase db push                 # applies pending migrations in order
```

Expected output includes each of the four migration filenames with a
`…ok` status. If any step fails mid-way, migrations that have been
applied stay applied — see §6 for recovery.

## 5. Post-apply verification

Re-run the verifier:

```bash
node web/scripts/verify-phase56-readonly.mjs
```

Expected:

```
Phase 1–4: 21 pass, 0 FAIL, 2 info  (analytics_events info persists —
                                     pre-existing, out of M0 scope)
M0 probes: ≥ 10 pass, 0 SKIP, 0 FAIL
```

Specifically the skips that must become passes:

- `organization_kind ENUM present`
- `agencies.kind column present`
- `hub UUID already holds slug='hub'` (formerly "non-hub tenant — will
  rewrite" info)
- `agency_memberships role CHECK matches M0 expected shape`
- `talent_profiles.phone_e164 column present`

Plus one that requires a separate, targeted query to confirm success of
the hub-rebind migration — the verifier currently does not cover it:

```sql
-- Every agency_domains row that previously belonged to the hub (slug='hub')
-- now points at the canonical hub tenant.
SELECT count(*) FROM public.agency_domains
WHERE tenant_id <> '00000000-0000-0000-0000-000000000002'
  AND host IN (SELECT host FROM public.agency_domains
               WHERE tenant_id = '00000000-0000-0000-0000-000000000002');
-- Expect 0.
```

Finally, smoke test M4 hub approval end-to-end:

1. As a super_admin in the app, create a test rep request with
   `target_type='hub'` (note: insert this through the UI, not raw SQL,
   so CHECK + RLS + trigger all fire).
2. Approve it via the admin workspace.
3. Verify `agency_talent_roster` now has a row with
   `tenant_id='00000000-…-000000000002'` and
   `hub_visibility_status='approved'`.
4. Visit the hub landing page on the app host — the approved talent
   should appear.

## 6. Rollback contract

The migrations are additive (L18 label in `docs/saas/phase-1/migration-
plan.md` rules); they have no DROP in the forward direction. Rollback
approaches, in order of preference:

1. **Don't.** If post-apply verification fails, the forward SQL is
   almost certainly idempotent and a rerun is safe. Preferred path.
2. **Fix forward.** Write a `20260625140000_saas_p56_m0_fix_*.sql`
   patch migration and apply it. Same rules as any other migration.
3. **Surgical revert** via a hand-rolled down migration: drop
   `agencies.kind`, drop the hub row, drop `phone_e164`, restore the
   previous `agency_memberships` CHECK, re-attribute `agency_domains`
   back to their original tenants. **This is destructive and the
   reverse of every rollback-unfriendly rule in the project.** Only do
   this if the alternative is corrupting customer data; get user
   approval first.

The four migrations themselves print preflight errors if they detect
an inconsistent state (e.g. `slug='hub'` already held by a different
UUID, `agency_memberships` rows with unmapped roles) and abort before
making changes. Trust the preflights.

## 7. Known verifier gaps

The verifier (`scripts/verify-phase56-readonly.mjs`) intentionally
does not cover:

- Content of `agency_domains` after rebind — not a column/constraint
  change, only an `UPDATE tenant_id = …`.
- The CMS rows seeded alongside the hub (`cms_pages`, `cms_sections`,
  `cms_navigation_menus` for the hub tenant) — can be confirmed with
  `SELECT count(*) FROM public.cms_pages WHERE tenant_id =
  '00000000-…-000000000002';` (expected ≥ 1).
- Whether the pre-apply Tenant B data was meaningful (see §2).

A future improvement: add a `--post-m0` flag that promotes the current
Tier-2 SKIPs into hard PASS requirements and adds the `agency_domains`
rebind + hub CMS seed checks. Not implemented now because the script's
single-pass tiered report is enough to gate the current decision.

## 8. Out-of-scope but adjacent: `analytics_events` table missing

The linked DB has **no `analytics_events` table**; service-role inserts
from `logAnalyticsEventServer` silently fail. This is unrelated to M0
but will cause the `invite_link_clicked` and `invite_converted` events
from the M5 invite-accept flow to drop on the floor in production.

Remediation options (out of M0 scope; track as a separate slice):

1. Create the table in a standalone migration with the expected shape
   (`name text, payload jsonb, session_id text nullable, user_id uuid
   nullable, talent_id uuid nullable, path text nullable, locale text
   nullable, created_at timestamptz default now()`), plus RLS.
2. Remove the `logAnalyticsEventServer` writer and rely exclusively on
   GA4 browser pings (but lose server-originated events).
3. Relocate the writes to an existing table with similar shape
   (e.g. `talent_workflow_events` if event semantics match — they do
   not currently).

Recommended: (1) with a dedicated migration and RLS policies matching
the rest of the tenantised surface. Not implemented in this branch.
