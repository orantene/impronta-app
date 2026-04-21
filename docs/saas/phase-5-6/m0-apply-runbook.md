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
# Expect exactly these five files:
#   20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql
#   20260625110000_saas_p56_m0_agency_domains_hub_rebind.sql
#   20260625120000_saas_p56_m0_membership_role_check.sql
#   20260625130000_saas_p56_m0_talent_phone_e164.sql
#   20260625140000_saas_p56_m0_analytics_events_bootstrap.sql
```

Files 100000–130000 are the core M0 set (commits `a0fef8f` +
`7925a56`). File 140000 is the adjacent `analytics_events` bootstrap
covered in §8 — applied alongside M0 so the silent-drop is closed in
the same window.

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

Re-run the verifier in **--post-m0 mode** so every M0 probe is
promoted from SKIP to FAIL:

```bash
node web/scripts/verify-phase56-readonly.mjs --post-m0
```

Expected:

```
Phase 1–4: 21 pass, 0 FAIL, 0–2 info (analytics_events info flips to
                                      PASS once migration 140000 lands)
M0 probes: ≥ 13 pass, 0 SKIP, 0 FAIL
POST-M0  : hub-rebind complete, hub agency row shape correct,
           hub CMS pages present, analytics_events bootstrapped
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

## 8. Adjacent: `analytics_events` table bootstrap (now in-branch)

The linked DB has **no `analytics_events` table**; service-role inserts
from `logAnalyticsEventServer` silently fail. Closed by migration
`20260625140000_saas_p56_m0_analytics_events_bootstrap.sql` (in this
branch), which:

- Creates `public.analytics_events` with the columns the writer emits
  plus `tenant_id UUID NOT NULL DEFAULT '00000000-…-000000000001'`
  (the demo tenant UUID, matching the Phase-1 backfill default used
  by `20260601200300`).
- Adds 5 indexes (created_at, name+created_at, talent+created_at,
  tenant+created_at, tenant+name+created_at).
- Enables RLS with two policies: anon+authenticated INSERT (matching
  the original `20260413120000` policy), staff SELECT via
  `public.is_agency_staff()` (confirmed present on linked DB).

**Deliberately narrow scope.** Only `analytics_events` is created.
The other tables from the original `20260413120000` migration
(daily_rollups, funnel_steps, search_sessions, kpi_snapshots,
api_cache) remain absent because no production caller depends on
them today. Adding them is a separate slice if GA4/GSC cache reads
activate.

**Follow-up (out of M0 scope).** `logAnalyticsEventServer` does not
yet set `tenant_id` on writes — they all default to the demo tenant.
A later slice should thread the request-context tenant through to
the writer so per-tenant analytics dashboards reflect reality.
