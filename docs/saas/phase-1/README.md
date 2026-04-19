# SaaS Phase 1 — Multi-Tenant Schema Foundation

**Branch:** `saas/phase-1` (off `saas/phase-0`).
**Scope:** Additive migrations only (L18) — create tenant record + agency-scoped tables, add `tenant_id` to operational tables, backfill, index, enforce NOT NULL. **No RLS changes.** Phase 2 wires `withTenantScope()` + RLS.

**Non-goals (deferred to later phases).**

| Concern | Phase |
|---|---|
| RLS policies + `withTenantScope()` helper | Phase 2 |
| Capability guards, auth middleware, agency context cookie | Phase 2 |
| Admin UI honouring tenant context | Phase 3 |
| Storefront middleware + hostname resolution | Phase 4 |
| Custom domain provisioning | Phase 5 |
| Agency-local fields | Phase 6 |
| Hub visibility + moderation workflow | Phase 7 |
| Billing (Stripe) + plan enforcement | Phase 8 |

## Deliverables

| # | File | Purpose |
|---|---|---|
| 1 | [o1-o7-resolutions.md](./o1-o7-resolutions.md) | Proposed defaults for open decisions; what's blocking vs not |
| 2 | [migration-plan.md](./migration-plan.md) | Ordered migration sequence with rollback notes |
| 3 | Migration SQL files | See `supabase/migrations/20260601*` and later |

## Guiding constraints

- **Additive only (L18).** No column drops, no destructive renames. Existing M2–M8 engine contracts remain intact.
- **Fail-hard tenancy preparation (L37).** Every tenantised table gets a nullable `tenant_id` → backfill → NOT NULL → index. Phase 2's guards then assume NOT NULL.
- **Canonical profile preserved (L6, L7).** `talent_profiles` stays global; only provenance columns are added.
- **Four log layers preserved (L26).** No collapsing of `platform_audit_log` / `activity_log` / `inquiry_events` / `inquiry_action_log`.
- **Tenant #1 UUID fixed (L13).** `00000000-0000-0000-0000-000000000001` (matches existing `DEFAULT_AI_TENANT_ID`).

## Exit criteria (Phase 1 gate)

1. All tenantised tables have `tenant_id UUID NOT NULL` + btree index.
2. `agencies`, `agency_memberships`, `agency_domains`, `agency_branding`, `agency_entitlements`, `agency_usage_counters`, `agency_talent_roster`, `agency_talent_overlays`, `agency_client_relationships`, `platform_audit_log` exist.
3. `talent_profiles` has provenance columns (nullable OK in Phase 1).
4. Tenant #1 row seeded + its subdomain row seeded in `agency_domains`.
5. Validation queries in [../validation-queries.md](../validation-queries.md) pass: each tenantised table has 0 rows with `tenant_id IS NULL`.
6. `web/` app still builds; no runtime regressions in M2–M8 flows.
7. No RLS policy has been changed — that's Phase 2.

## Reading order

1. [o1-o7-resolutions.md](./o1-o7-resolutions.md) — decisions that shape the schema choices
2. [migration-plan.md](./migration-plan.md) — what lands, in what order, with what rollback
3. Migrations themselves (timestamped files under `supabase/migrations/`)
