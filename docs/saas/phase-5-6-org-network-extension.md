# Phase 5–6: Organization & Network Extension Plan

**Status:** Revised 2026-04-20 — five gating decisions locked; UX plan and
ten production-minded additions (migration safety, identity/dedupe,
URL ownership, media, perf/SEO, entitlements, analytics, QA fixtures,
per-milestone acceptance, UI state inventory) integrated.
**Date:** 2026-04-20
**Supersedes:** `docs/saas/phase-5/future-roadmap.md`.
**Charter:** Amends but does not replace the locked plan at
`/Users/oranpersonal/.cursor/plans/multi-tenant_saas_architecture_bb191713.plan.md`.
All Decision Log references (L*, O*, D*) refer to that file.

---

## 0. What this doc is — and isn't

The architectural + product bridge between (a) the in-flight Phase 5
site-admin CMS and (b) the freelancer-driven talent-network vision the user
articulated on 2026-04-20.

**Extension, not rewrite.** The inquiry/booking engine, the canonical+overlay
talent model, the Phase 5 CMS tables, and the unified `agency_domains` host
registry are preserved. What it adds: (1) organization abstraction so "hub"
and "agency" share the same physical tables, (2) first-class freelancer share
surface at `/t/[profileCode]`, (3) explicit cross-surface visibility resolver,
(4) revised Phase 5→6 sequencing that proves the org abstraction before
shipping agency-only, (5) UX + product-quality plan, (6) production-readiness
layer (migration safety, identity policy, perf/SEO, entitlements, analytics,
QA fixtures, UI state inventory).

**Not:** a billing plan (D1 deferred), a table rename (L1–L44 stays), a hub
extraction (D15 deferred), or a new inquiry workflow (L21, L26, L27 stand).

---

## 1. Non-negotiables

1. **Extend, do not replace.** Inquiry/booking engine (L21, L26, L31),
   canonical+overlay talent model (L6, L7), Phase 5 CMS schema — all preserved.
2. **One user system.** No duplicate identity per domain. One `profiles` row
   can participate across many orgs (O7: yes, with guardrails).
3. **One canonical talent record.** `talent_profiles` stays global and
   tenant-less (L6); per-org presentation in `agency_talent_roster` +
   `agency_talent_overlays` (L7).
4. **Agency and hub share the same abstraction.** Both are rows in
   `agencies`, distinguished by `kind`.
5. **Phase 5 site-admin is the Organization CMS.** Same tables/RPCs serve
   both kinds; no per-kind forks in CMS logic.
6. **Tenant resolution stays fail-hard** (L37, §22.7). No fallback to tenant #1.
7. **No new logic in DB triggers** (L38, §22.8). Visibility lives in engine code.
8. **Additive migrations only** (L18). No renames, no drops.
9. **Cookie is UX convenience, not authorization.** Every server action
   resolves capabilities from `agency_memberships`.
10. **Every public surface has all five UI states.** Empty, loading, locked,
    success, error — design before build (see §19).
11. **Every migration ships with backfill, validation, and rollback.** No
    migration merges without all three (§6).

---

## 2. Product truth

- **Freelancer / talent-network growth layer is first-class in V1.** `/t/[code]`
  is a primary distribution surface.
- **Agency SaaS sits on top of the network model.** Agencies are one kind of
  organization; the abstraction scales.
- **Hub is an organization, not a singleton.** V1 seeds one; schema supports
  N (D15 defers infra extraction).
- **Coordinator, moderator, reviewer are capabilities** (L10), not signup
  universes. Role enum extensions go in `agency_memberships.role`.
- **Entry points are surface-scoped.** Agency-owner signup on SaaS marketing;
  talent signup on hub + agency talent-facing; admin on app host (L2, L34).

---

## 3. Charter alignment

### 3.1 Preserved (no amendment)

L1, L2, L6, L7, L10, L14, L17, L18, L21, L22–L33, L34, L35, L36, L37, L41–L44.

### 3.2 Amended

- **L4** (agency storefront on `{slug}.*`): preserved; default template now
  diverges by `agencies.kind`.
- **L9** (hub approval separate from agency publication): reinforced in §11.
- **L19** (hub is a real product surface): implemented as hub-as-org-row.
- **L40** (marketing hostname): **amended 2026-04-20** — marketing apex is
  `pdcvacations.com`, not `studiobooking.io`. DNS family already seeded
  (migration 20260605100000).

### 3.3 New locks (L45–L48)

- **L45:** Organization abstraction via `agencies.kind` (values `agency | hub`).
  No rename. `agencies.kind` is distinct from `agency_domains.kind`; always
  qualify by table.
- **L46:** `/t/[profileCode]` on the app host (`app.pdcvacations.com`) is the
  canonical cross-surface talent URL.
- **L47:** Phase 5 site-admin CMS is a single Organization CMS — no per-kind
  forks in CMS write paths.
- **L48:** Platform hub org UUID =
  `00000000-0000-0000-0000-000000000002` (mirrors the L13 convention for
  tenant #1). Slug = `'hub'`. Display name = `'Impronta Hub'`.

### 3.4 Closed 2026-04-20

- **O1:** DNS family locked — `pdcvacations.com` (marketing),
  `app.pdcvacations.com` (app), `pitiriasisversicolor.com` (hub),
  `improntamodels.com` (agency tenant #1 custom), `impronta.local` + family (dev).
- **O5:** Cookie-based `/admin` with active-org selector; authorization
  server-side via `agency_memberships`.
- **O6:** Canonical+overlay client model final (already implemented).
- **O7:** Person may be talent + client + coordinator + staff + owner;
  capabilities are per-org, never self-approval.

### 3.5 Still open (non-blocking for M0)

O2 (tenant #1 slug), O3 (deployment platform confirm), O4 (`agency_staff` enum
migration).

### 3.6 Deferred (unchanged)

D1, D2, D3, D6, D9, D10, D13, D14, D15.

### 3.7 Deferred by M0 — email ownership & canonicalization

The doc's original §5.6 proposed `email_canonical` columns on `profiles`
and `talent_profiles`. **Neither table has an `email` column today**
(email lives on `auth.users`), so the generated-column SQL can't compile.
Rather than quietly introduce an `auth.users → profiles` mirror trigger
inside org-foundation work, the canonical-email strategy is deferred to a
focused follow-up:

- **Open question to resolve before the follow-up:** does `profiles`
  mirror `auth.users.email` (we own the sync + a canonical column) or do
  canonical-email checks execute against `auth.users.email` at query time
  via a helper function?
- **M0 does not add:** any email column, any email mirror trigger, any
  `email_canonical` generated column.
- **§A.3 consequence:** rows 3, 7, 8 of the dedupe precedence table
  (email-involved cases) continue to work at the resolver level against
  `auth.users.email` without a unique index until the follow-up ships.
  Phone-based rows (1, 2, 4, 5, 6, 9, 10) are fully supported by M0.

---

## 4. Current state — what's already built

- `agencies` (tenant root, tenant #1 = `00000000-0000-0000-0000-000000000001`).
- `agency_memberships` (owner/admin/coordinator/editor/viewer + invite
  lifecycle).
- `talent_profiles` global (no `tenant_id`); `agency_talent_roster` with
  `status` × `agency_visibility` × `hub_visibility_status` dimensions.
- `client_profiles` global; `agency_client_relationships` per-org overlay.
- `agency_domains` unified registry; fail-hard 404 on unregistered hosts
  (verified at [web/src/middleware.ts:50](web/src/middleware.ts:50)).
- `inquiries.tenant_id` + `source_type ∈ (agency, hub)` already wired.
- Phase 5 site-admin tables all tenant-scoped (identity, branding, pages,
  sections, page_sections, navigation items+menus).
- Surface allow-list at
  [web/src/lib/saas/surface-allow-list.ts](web/src/lib/saas/surface-allow-list.ts).
- Route `/t/[profileCode]` exists at
  [web/src/app/t/[profileCode]/page.tsx](web/src/app/t/[profileCode]/page.tsx).
- `talent_representation_requests` scaffolded (L44).

**What this means:** the extension is one column (`agencies.kind`), one hub
seed, one domain rebind, plus surface logic for `/t/[code]`. Everything else
is capability + template layering on existing bones.

---

## 5. Target schema

### 5.1 Org abstraction

```sql
CREATE TYPE organization_kind AS ENUM ('agency', 'hub');

ALTER TABLE agencies
  ADD COLUMN kind organization_kind NOT NULL DEFAULT 'agency';
```

**Naming doctrine:** table stays `agencies`; concept in docs/new code is
`organization`; helpers are `resolveOrganization()`; existing `agency_*`
prefixed tables keep names; `agencies.kind` ≠ `agency_domains.kind` — always
qualify.

### 5.2 Hub-org seed

```sql
INSERT INTO agencies (id, slug, kind, status, display_name, ...)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'hub', 'hub', 'active', 'Impronta Hub', ...
);
```

**Hub canonical UUID (locked 2026-04-20):**
`00000000-0000-0000-0000-000000000002`.

Mirrors the tenant-#1 convention (`...000000000001`, charter L13): tenant
#1 is the first agency; the hub reserves the next sequential slot. All
other orgs use `gen_random_uuid()`. Only these two slots are reserved.

Plus paired rows: `agency_business_identity`, `agency_branding`, `cms_pages`
(hub homepage with `system_template_key='homepage'` — same key as agency
homes; runtime resolves kind), `cms_sections`, `cms_navigation_menus`.

### 5.3 Domain rebind

| `agency_domains.kind` | `agency_domains.tenant_id` | Example |
|---|---|---|
| `subdomain` | agency-kind org id | `{slug}.pdcvacations.com` |
| `custom` | either kind | `improntamodels.com` |
| `hub` | hub-kind org id | `pitiriasisversicolor.com` |
| `marketing` | NULL | `pdcvacations.com` |
| `app` | NULL | `app.pdcvacations.com` |

### 5.4 Roster extension (no schema change)

`agency_talent_roster.tenant_id` may now reference a hub-kind row. For hub
orgs, `hub_visibility_status` is the primary visibility dimension;
`agency_visibility` unused.

### 5.5 Membership enum addition

```sql
ALTER TYPE agency_membership_role ADD VALUE IF NOT EXISTS 'hub_moderator';
ALTER TYPE agency_membership_role ADD VALUE IF NOT EXISTS 'platform_reviewer';
```

### 5.6 Identity normalization columns (M0 scope — phone only)

**M0 scope (Option A — locked 2026-04-20):** only
`talent_profiles.phone_e164` ships in M0.

```sql
ALTER TABLE public.talent_profiles
  ADD COLUMN phone_e164 TEXT;  -- populated by backfill + app via libphonenumber
CREATE UNIQUE INDEX IF NOT EXISTS talent_profiles_phone_e164_uk
  ON public.talent_profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
```

**Why this is the only identity-normalization column in M0:**

- `profiles` has no `email` or `phone` column (email lives on `auth.users`
  only). Adding `email_canonical` to `profiles` would require first deciding
  whether `profiles` should mirror `auth.users.email` (with a sync trigger)
  or whether canonical-email lookups should query `auth.users` at read
  time. That is an **email-ownership decision** worth its own short
  follow-up, not a silent choice inside M0.
- `talent_profiles` has no `email` column either (talent emails are on the
  linked `auth.users` row via `user_id`, or absent entirely for
  agency-created placeholders).
- `talent_profiles.phone` already exists and is the V1 dedupe key for all
  §A.3 phone-based rules (rows 1, 2, 4, 5, 6, 9, 10). That's the 80% of
  the dedupe contract we need on day one.

**Explicitly deferred (NOT in M0):**

- `profiles.email_canonical` + `profiles.phone_e164` — defer until email
  ownership is decided.
- `talent_profiles.email_canonical` — same.
- Any `auth.users → profiles` email-mirror trigger — do **not** introduce
  in M0. Silent sync surfaces are expensive to debug; they deserve a
  dedicated design pass.
- Email-based dedupe rules in §A.3 (rows 3, 7, 8): the resolver may still
  execute these against `auth.users.email` at query time, but there is
  no canonical-email unique index until the follow-up lands.

**Phone-eligibility for dedupe** (applies to both backfill and runtime writes):

- A raw `talent_profiles.phone` is **phone-eligible** when `libphonenumber`
  parses it to a valid E.164 with a resolved country. Country resolution
  order:
  1. `talent_profiles.residence_country_id` → country `iso2`.
  2. Raw phone starts with `+` → parse as international, country from parse.
  3. Otherwise → **NOT eligible**; `phone_e164` stays `NULL`, flagged as
     "needs review" in admin.
- Rows with `phone IS NULL` or failing normalization have `phone_e164 = NULL`.
  The unique partial index ignores NULLs, so these never collide.
- Post-backfill, the write path enforces normalization: the server action
  computes E.164 on save; a value that fails to normalize is rejected with
  a typed error, never silently stored.

**Backfill collision handling** (when two legacy rows normalize to the same E.164):

- Backfill runs in dry-run mode first, computing E.164 per row without
  writing. Rows that share a computed value are grouped as a **collision
  set**.
- Collision sets are **not auto-resolved.** Every row in a collision set
  has its `phone_e164` **left NULL** on apply. The group is written to a
  new table `phone_e164_backfill_collisions (row_id, raw_phone, computed_e164, resolved_at, resolver_id, resolution_action)`
  for super-admin review.
- Super-admin review options per group:
  - **`claim`** — pick one row as the owner; server action updates its
    `phone_e164` and marks others `resolution_action='deferred'`.
  - **`distinct`** — mark them as different people who legitimately share
    no phone; leave all NULL; suppress repeat flags for 180 days.
  - **`merge_candidate`** — link the group into the §A.3 human-review
    queue (V1.5 merge tooling; D10).
- The unique partial index permits this pattern because it ignores NULL.
  Zero writes are required for the migration to complete; the index is
  valid on day one with all collided rows NULL.
- The collision table is operational data (not audit); the underlying
  decisions still write to `platform_audit_log` via the resolver.

### 5.7 Visibility fields — already in place

`talent_profiles.visibility`, `talent_profiles.workflow_status`,
`agency_talent_roster.agency_visibility`,
`agency_talent_roster.hub_visibility_status`. No new columns; resolver in §11.

### 5.8 Phase 5 CMS — no schema change

Runtime-only: resolve `agencies.kind`, pick template pack, gate by
capability. Same code path for both kinds.

---

## 6. Migration plan (production-minded)

### 6.1 Per-step contract

Every step below ships with four artifacts: **forward SQL**, **backfill**,
**validation query**, **rollback**. No step merges without all four green.

### 6.2 Steps

#### Step 1 — `organization_kind` enum + `agencies.kind` column

- **Forward:** `CREATE TYPE organization_kind ...; ALTER TABLE agencies ADD
  COLUMN kind ... DEFAULT 'agency';`
- **Backfill:** implicit via `DEFAULT 'agency'`. All existing rows become
  `agency`.
- **Validation:** `SELECT COUNT(*) FROM agencies WHERE kind IS NULL = 0;
  SELECT COUNT(DISTINCT kind) FROM agencies = 1;` (only `agency`).
- **Rollback:** `ALTER TABLE agencies DROP COLUMN kind; DROP TYPE
  organization_kind;`
- **Production risk:** none. Additive with default.

#### Step 2 — Hub-org seed row

- **Forward:** `INSERT INTO agencies (id, slug, kind, status, display_name)
  VALUES ('<platform_hub_uuid>', 'hub', 'hub', 'active', 'Impronta Hub');`
- **Backfill:** N/A.
- **Validation:** `SELECT COUNT(*) FROM agencies WHERE kind='hub' = 1;
  SELECT slug, status FROM agencies WHERE kind='hub';`
- **Rollback:** `DELETE FROM agencies WHERE id='<platform_hub_uuid>';` (safe
  because FKs only populate in later steps).
- **Production risk:** `slug='hub'` collision if a tenant ever used it —
  check `platform_reserved_slugs` first. `hub` should already be reserved.

#### Step 3 — Hub paired rows (identity, branding, pages, sections, nav menus)

- **Forward:** seed `agency_business_identity`, `agency_branding`, `cms_pages`
  (homepage with `is_system_owned=true, system_template_key='homepage'`
  — identical key to agency homes; runtime resolver branches on
  `agencies.kind` to pick the template pack, keeping write paths identical),
  `cms_sections`, `cms_navigation_menus` for `<platform_hub_uuid>`.
- **Backfill:** N/A.
- **Validation:** five tables, each one row for `tenant_id='<platform_hub_uuid>'`.
- **Rollback:** `DELETE FROM ... WHERE tenant_id='<platform_hub_uuid>';`
  (cascades on org delete).
- **Production risk:** `cms_pages` `is_system_owned` guard — ensure the hub
  homepage is created with the system-template path to enable rollback.

#### Step 4 — Relax `agency_domains` constraint for `kind='hub'`

- **Forward:** drop the existing cross-column CHECK, re-add with the updated
  rule (see §5.3).
- **Backfill:** N/A (no row changes yet).
- **Validation:** `\d+ agency_domains` shows new constraint.
- **Rollback:** revert CHECK to original.
- **Production risk:** **medium.** Dropping + re-adding a CHECK is non-atomic
  in Postgres without explicit transaction. Wrap in single migration file
  with BEGIN/COMMIT. Check existing `agency_domains` rows don't violate new
  rule before re-adding.
- **Preflight query:** `SELECT * FROM agency_domains WHERE kind='hub' AND
  tenant_id IS NOT NULL;` — must return zero before this migration.

#### Step 5 — Rebind hub domains

- **Forward:** `UPDATE agency_domains SET tenant_id='<platform_hub_uuid>'
  WHERE kind='hub';`
- **Backfill:** implicit in forward.
- **Validation:** `SELECT COUNT(*) FROM agency_domains WHERE kind='hub' AND
  tenant_id IS NULL = 0;`
- **Rollback:** `UPDATE agency_domains SET tenant_id=NULL WHERE kind='hub';`
  (before dropping hub org).
- **Production risk:** **medium** — if middleware is hot and a request lands
  mid-migration, domain resolution could temporarily fail. Mitigation: wrap
  steps 4+5 in a single transaction; edge cache has 60s TTL so brief
  inconsistency is acceptable. Optional: deploy with a maintenance banner
  for hub host only.

#### Step 6 — `agency_memberships.role` CHECK-constraint extension

Note (schema correction 2026-04-20): `agency_memberships.role` is a
`TEXT` column with a `CHECK` constraint, **not** a PostgreSQL `ENUM` type
— see [20260601100100_saas_p1_agency_memberships.sql:19-20](supabase/migrations/20260601100100_saas_p1_agency_memberships.sql:19).
So this is a constraint swap, not an `ALTER TYPE ... ADD VALUE`. Rollback
is symmetric (unlike enum add-value, which Postgres can't cleanly drop).

- **Forward:**
  ```sql
  ALTER TABLE public.agency_memberships
    DROP CONSTRAINT IF EXISTS agency_memberships_role_check;
  ALTER TABLE public.agency_memberships
    ADD CONSTRAINT agency_memberships_role_check
    CHECK (role IN ('owner','admin','coordinator','editor','viewer',
                    'hub_moderator','platform_reviewer'));
  ```
- **Backfill:** N/A.
- **Validation:** `\d+ public.agency_memberships` shows the new constraint
  text; `SELECT conname FROM pg_constraint WHERE conname =
  'agency_memberships_role_check';` returns one row.
- **Rollback:** drop + re-add with the original five-value list. Safe as
  long as no row has yet been written with one of the two new values;
  preflight: `SELECT COUNT(*) FROM agency_memberships WHERE role IN
  ('hub_moderator','platform_reviewer') = 0`.
- **Production risk:** low. Additive to the allow-list; no existing row
  becomes invalid.

#### Step 7 — `talent_profiles.phone_e164` column (M0 scope, Option A)

Scope (locked 2026-04-20): only `talent_profiles.phone_e164` ships in
M0. `profiles.email_canonical`, `profiles.phone_e164`, and
`talent_profiles.email_canonical` are deferred (see §5.6 for rationale
and what "phone-eligible" means).

- **Forward:**
  ```sql
  ALTER TABLE public.talent_profiles
    ADD COLUMN phone_e164 TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS talent_profiles_phone_e164_uk
    ON public.talent_profiles (phone_e164)
    WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
  CREATE TABLE IF NOT EXISTS public.phone_e164_backfill_collisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    row_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
    raw_phone TEXT NOT NULL,
    computed_e164 TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolver_id UUID REFERENCES public.profiles(id),
    resolution_action TEXT CHECK (resolution_action IN
      ('claim','distinct','merge_candidate','deferred'))
  );
  CREATE INDEX phone_e164_backfill_collisions_computed_idx
    ON public.phone_e164_backfill_collisions (computed_e164)
    WHERE resolved_at IS NULL;
  ```
- **Backfill:** Node script `web/scripts/backfill-talent-phone-e164.mjs`
  runs via `libphonenumber-js`. Two-phase:
  1. **Dry-run** — iterate all `talent_profiles` rows, compute candidate
     E.164 using the residence-country-then-`+` rule (§5.6). Group by
     candidate; flag any group with ≥2 members as a collision set.
  2. **Apply** — for each row not in a collision set whose candidate is
     non-null, `UPDATE talent_profiles SET phone_e164 = ... WHERE id = ...`.
     For collision-set rows, INSERT into
     `phone_e164_backfill_collisions`. `talent_profiles.phone_e164`
     remains NULL for these rows (the partial index ignores them).
  Idempotent. Re-runnable after operator fixes raw phones or manually
  claims a collision.
- **Validation:**
  ```sql
  -- No collision groups left unresolved > 14 days
  SELECT COUNT(*) FROM phone_e164_backfill_collisions
    WHERE resolved_at IS NULL AND detected_at < now() - interval '14 days'; -- expect 0
  -- No rows where computed would succeed but phone_e164 is NULL without being a known collision
  SELECT COUNT(*) FROM talent_profiles tp
    WHERE tp.phone IS NOT NULL
      AND tp.phone_e164 IS NULL
      AND tp.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM phone_e164_backfill_collisions c WHERE c.row_id = tp.id
      ); -- review manually; treat >0 as "needs review" queue depth
  -- Partial unique index is present and valid
  SELECT indexname FROM pg_indexes
    WHERE tablename = 'talent_profiles'
      AND indexname = 'talent_profiles_phone_e164_uk';
  ```
- **Rollback:**
  ```sql
  DROP INDEX IF EXISTS talent_profiles_phone_e164_uk;
  ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS phone_e164;
  DROP TABLE IF EXISTS public.phone_e164_backfill_collisions;
  ```
- **Production risk:** low. Additive column, partial unique index that
  ignores NULL, collisions routed to a manual review table instead of
  blocking the migration. Live writes continue succeeding throughout
  (new app-side writes compute E.164 only after Step 7 is deployed AND
  the write-path code change lands in a subsequent PR; M0 ships schema
  only).

#### Step 8 — Surface allow-list update

- **Forward:** code change to
  [web/src/lib/saas/surface-allow-list.ts](web/src/lib/saas/surface-allow-list.ts)
  adding `/t/*` to app host kind.
- **Backfill:** N/A.
- **Validation:** unit test for allow-list.
- **Rollback:** revert code.
- **Production risk:** low. Server-side check; no client cache.

### 6.3 Ordering & atomicity

- Steps 1–3 in one migration file (schema + seed).
- Steps 4–5 in a separate file (constraint + rebind, single transaction).
- Step 6 in its own file (CHECK-constraint swap on `agency_memberships.role`).
- Step 7 in its own file (`talent_profiles.phone_e164` + collisions table) +
  a separate backfill job (`web/scripts/backfill-talent-phone-e164.mjs`).
- Step 8 is code, ships in the same PR as M2.

### 6.4 Production-risk summary

| Step | Risk | Mitigation |
|---|---|---|
| 1 | none | additive |
| 2 | slug collision | verify reserved first |
| 3 | none | additive |
| 4 | non-atomic CHECK | single transaction |
| 5 | hub 60s outage window | transactional with 4; edge cache limits blast |
| 6 | none | CHECK constraint swap; preflight asserts no row uses new values yet |
| 7 | malformed phone → NULL; collisions | accept NULLs; collisions routed to `phone_e164_backfill_collisions` for super-admin review (not auto-merged) |
| 8 | none | code |

### 6.5 What does not change

No table renames, no FK changes, no drops, no inquiry engine changes, no
`talent_profiles` restructuring, no existing `agency_memberships` row migration,
no `tenant_id` backfill on CMS rows.

---

## 7. Subdomain / domain routing

| Host kind | Hostname | `tenant_id` | `agencies.kind` | Admin? |
|---|---|---|---|---|
| marketing | `pdcvacations.com` | NULL | — | no |
| app | `app.pdcvacations.com` | NULL | — | yes (cookie-selected) |
| hub | `pitiriasisversicolor.com` | `<platform_hub_uuid>` | `hub` | no |
| agency-subdomain | `{slug}.pdcvacations.com` | agency id | `agency` | no |
| agency-custom | `improntamodels.com` | agency id | `agency` | no |
| local-dev | `impronta.local` / `marketing.local` / `app.local` / `hub.local` | per mapping | per mapping | app only |

`/t/[code]` allow-listed on app host only. Agency hosts serve overlay-scoped
`/t/`. Hub never serves `/t/[code]`; uses its own hub-governed directory paths.

---

## 8. Slug / URL ownership & redirects

### 8.1 Ownership table

| Asset | Owner | Mutable? | Redirect stored |
|---|---|---|---|
| Agency subdomain slug | Agency owner | Yes; rate-limited 1× / 90 days | `cms_redirects` auto-entry |
| Agency custom domain | Platform (via `agency_domains`) | Via Phase 5 charter flow | No (DNS-level) |
| Hub slug / domain | Platform | No (immutable) | N/A |
| Talent `profile_code` (`TAL-XXXXX`) | Platform | No (immutable forever) | N/A |
| Talent slug-part (`sofia-m`) | Talent | Yes; 90-day redirect kept | `cms_redirects` |
| Talent `/t/[profileCode]` URL | Platform | No (immutable) | N/A |
| Page slug (per page, per locale) | Org admin | Yes | `cms_redirects` per tenant |
| Reserved platform slugs | Platform | No | Enforced by `platform_reserved_slugs` + DB trigger + middleware |

### 8.2 Redirect storage

`cms_redirects` already referenced in `tryCmsRedirectResponse` (middleware.ts
line 197). Schema should support: `tenant_id NULL`able (for platform-level
redirects), `from_path`, `to_path`, `status_code` (301 default), `created_at`,
`expires_at` (90-day default for slug changes).

### 8.3 Rules

- `profile_code` is the **permalink key** for talent — never changes once
  issued. `/t/[profileCode]` is stable for the life of the profile.
- Slug changes (agency subdomain, talent slug-part, page slug) auto-create a
  301 redirect entry expiring in 90 days.
- Agency storefronts also accept `/t/[profileCode]/[slug]` form; slug is
  optional; canonical is `/t/[profileCode]` with slug appended for SEO.
- Custom domain changes (agency add/remove custom domain) preserve the
  subdomain URL as a fallback; both coexist until owner decides.

---

## 9. Identity & dedupe policy

### 9.1 Normalization (enforced at write, indexed for uniqueness)

- **Email:** `lower(trim(email))`. Stored in `email_canonical` (generated
  column). Unique index.
- **Phone:** E.164 via `libphonenumber` at the app layer. Stored in
  `phone_e164` (nullable; unique WHERE NOT NULL). Original user-facing input
  preserved in `phone` for display.
- **Display values:** `email` and `phone` keep what the user typed.

### 9.2 Uniqueness constraints

- `profiles.email_canonical` — unique (matches `auth.users` guarantee).
- `profiles.phone_e164` — unique where not null.
- `talent_profiles.phone_e164` — unique where not null AND `deleted_at IS NULL`
  (soft-delete semantics).
- `talent_profiles.email_canonical` — NOT unique (a talent may share contact
  email with the claiming user; auth uniqueness lives on `profiles`).

### 9.3 Verified vs unverified

- "Verified" = OTP-confirmed via phone or email.
- Verified profile **always wins** a conflict with an unverified one.
- Unverified + unclaimed placeholder can be overwritten by a claim flow
  (§9.5).
- Dual verification (both email AND phone) is best-quality but not required
  for V1.

### 9.4 Duplicate detection

At every entry point that creates a `profiles` or `talent_profiles`:

1. Normalize email and phone.
2. Check `phone_e164` and `email_canonical` against existing rows.
3. **Hard match** (verified + equal): refuse creation; route to claim or
   reject flow.
4. **Soft match** (unverified + equal, or partial match): warn, let the
   operator proceed with moderation flag set.
5. Log all match events to `platform_audit_log`
   (`action='identity.match_detected'`).

### 9.5 Invite / claim merge behavior

**Scenario A — agency places a new talent with phone X:**
- If `talent_profiles.phone_e164 = X` exists and is verified: agency UI
  suggests "Invite {existing_name} to your roster" instead of creating new.
  Agency may override (creates roster row referencing existing profile; no
  new talent_profile).
- If exists and is unverified (never claimed): attach — agency is now an
  additional roster row, talent_profile unchanged.
- If no match: create new `talent_profiles` row with `source='agency_created'`,
  phone_e164 populated, `user_id NULL`.

**Scenario B — talent signs up, provides phone X, already has a placeholder:**
- Claim flow: system shows "We found a placeholder profile for you at
  {agency}. Is this you?" → OTP verify → on confirm, set
  `talent_profiles.user_id`, status='claimed', all agency overlays preserved.
- If multiple placeholders exist with phone X (edge case): user picks one;
  others archived (`deleted_at` set, `claim_rejection_reason` noted), with
  audit.

**Scenario C — talent signs up and an existing **verified** user has
conflicting phone:**
- Refuse signup with clear message: "A verified account already uses this
  phone. Sign in or recover your password."

### 9.6 Merge tooling

V1 = **detect, do not merge**. Flagged matches surface in a super-admin
queue; manual link/merge is D10 (deferred V1.5).

---

## 10. Inquiry linkage (unchanged engine)

- `inquiries.tenant_id` = owning org. Hub-originated inquiries get
  `tenant_id` = receiving agency after routing (L14 single-agency in V1).
- `inquiries.source_type` ∈ (`agency`, `hub`) — origin.
- `inquiry_participants.talent_profile_id` points at global `talent_profiles`.
- Engine untouched. Zero risk to L21–L33.

---

## 11. Visibility / exposure resolver

### 11.1 Signature

```ts
type Surface = 'freelancer' | 'agency' | 'hub' | 'admin';

function resolveTalentVisibility(
  talent: TalentProfile,
  surface: Surface,
  orgId?: string,
): { visible: boolean; view: Surface; overlays?: AgencyTalentOverlay };
```

### 11.2 Rules

| Surface | Visible iff |
|---|---|
| `freelancer` (`/t/[code]` on app host) | `workflow_status='approved' AND visibility='public' AND deleted_at IS NULL` |
| `agency` | freelancer rules AND roster row (`tenant_id=orgId AND status='active' AND agency_visibility IN ('site_visible','featured')`) |
| `hub` | freelancer rules AND roster row (`tenant_id=orgId AND hub_visibility_status='approved'`) |
| `admin` | `is_staff_of_tenant(orgId)` or `super_admin` |

### 11.3 Serialization (Gate 3)

- Freelancer view: canonical fields + public media only. **Never** overlays.
- Agency view: canonical + requesting org's overlay.
- Hub view: canonical + hub-governed fields. **Never** agency overlays.
- Admin: full scope.

### 11.4 Premium hook

`talent_profiles.membership_tier` already exists. A future `freelancer-private`
surface fits without signature change.

---

## 12. Media pipeline & moderation

### 12.1 Upload flow

1. Client requests signed upload URL from server action (gated by auth +
   capability).
2. Client uploads directly to Supabase Storage (original bucket).
3. Server creates `media_assets` row with `approval_state = 'pending'`
   (talent upload) or `'approved'` (staff upload).
4. Server enqueues variant-generation job (card, gallery, banner, lightbox,
   public_watermarked).
5. Client SSE / poll for variants-ready; surface in admin when all variants
   present.

### 12.2 Limits

- Per-file: 15 MB max.
- MIME: JPG, PNG, WebP, HEIC (HEIC auto-converted server-side).
- Video: deferred post-V1.
- Client pre-validates size and MIME before upload.

### 12.3 Variants (Phase 5 M0 already defines)

| Variant | Dimensions | Use |
|---|---|---|
| `original` | native | stored; never served publicly |
| `card` | 480×720 | directory grid / card |
| `gallery` | 960×1440 | gallery view |
| `banner` | 1920×640 | homepage hero banners |
| `lightbox` | full-res, watermarked | lightbox view |
| `public_watermarked` | composite | public surfaces |

Watermark applied to **public variants only**, never to originals.

### 12.4 Cover image & ordering

- `talent_profiles.cover_media_asset_id` — exactly one per profile.
- `media_assets.order_index` per `owner_talent_profile_id` — ordering inside
  gallery.
- Default: first approved image becomes cover if unset.

### 12.5 Moderation

- `approval_state`: `pending | approved | rejected | flagged`.
- Talent-submitted → `pending`; admin acts.
- Staff-uploaded → `approved` immediately.
- Rejected → hidden from public; visible in admin audit trail.
- Flagged → moderator attention (V1 = surface in queue; auto-merge tooling
  D10).

### 12.6 Cleanup

- Soft delete via `deleted_at`.
- Storage purge job (cron, future): rows with `deleted_at < NOW() - 30d`
  have storage objects removed.
- Orphan detection: media whose `owner_talent_profile_id` references a
  deleted talent → flagged weekly; bulk-archive after admin review.

### 12.7 Props-embedded media (CMS)

Phase 5 M0 already enforces via `cms_sections_props_media_ref_check` trigger:
UUIDs under `mediaAssetId` keys in `cms_sections.props_jsonb` must reference
live `media_assets` rows. Do not break on extension.

---

## 13. Public-surface performance & SEO

### 13.1 Rendering mode (per surface)

| Surface | Mode | Cache strategy |
|---|---|---|
| `/t/[code]` app host | Server-rendered (RSC) | `unstable_cache` tagged `tagFor('talent', code)`; invalidated on talent edit |
| Agency storefront homepage | RSC | tagged `tagFor(tenantId, 'homepage')`; invalidated on homepage publish (reads frozen snapshot) |
| Hub directory | RSC | tagged `tagFor(hubId, 'directory')`; invalidated on hub-visibility change |
| Hub homepage | RSC | tagged `tagFor(hubId, 'homepage')` |
| CMS-driven pages (any org) | RSC | tagged per page_id; invalidated on page publish |
| Admin (/admin/**) | Client + RSC hybrid behind auth | no public cache |

Baseline TTL: 1 hour. Tag invalidation preempts TTL.

### 13.2 Image optimization

- All public images via Next.js `<Image>`.
- Pre-generated variants (§12.3) — no on-the-fly resize.
- Formats: AVIF primary, WebP fallback, JPG for HEIC origin.
- LQIP (blurhash) stored on each `media_asset` row for hero/card use.
- `loading="lazy"` default; hero + above-fold explicitly `priority`.

### 13.3 SEO rules

- **Canonical URLs:** `/t/[profileCode]` on app host is canonical for a
  talent. Agency-host `/t/[profileCode]` sets `<link rel="canonical"
  href="https://app.pdcvacations.com/t/[profileCode]" />` to avoid duplicate
  content penalties.
- **OG images:** auto-generated per entity via serverless function. Cache
  immutable on CDN; regenerate on entity change with cache-busting query.
- **Sitemap:** per host — already present for marketing/hub/agency
  (sitemap.xml route). Hub sitemap includes only `hub_visibility_status=approved`
  talents. Agency sitemaps include only active roster + site_visible/featured.
- **Robots:** `noindex` per-page setting already on `cms_pages`. Defaults:
  marketing + hub indexed; unverified agencies noindexed until owner
  explicitly opts in. Talent `/t/[code]` indexed iff `visibility='public'
  AND workflow_status='approved'`.
- **Structured data:** JSON-LD — Person for talent, Organization for agency
  and hub, BreadcrumbList where applicable.

### 13.4 Metadata ownership

| Entity | Meta source |
|---|---|
| Talent | `talent_profiles.meta_title`, `meta_description` (add if missing); OG from auto-gen |
| Page | `cms_pages.meta_title`, `meta_description`, `og_image_media_asset_id` |
| Org | `agency_business_identity.seo_default_*` |
| Hub | hub org's `agency_business_identity` (platform-curated) |

### 13.5 Performance budget (p75 on 4G mobile)

- LCP < 2.0s
- INP < 200ms
- CLS < 0.1
- TBT < 300ms

Measure via Vercel Analytics or equivalent. Regressions block PRs
once the budget is instrumented.

---

## 14. Entitlements / feature-gating layer

Build now. Stripe plugs in later (D1).

### 14.1 Principle

- Every feature lock reads from `agency_entitlements`.
- Lock decisions live in a single `checkEntitlement()` function + a UI
  `<LockedChip />` component.
- No Stripe calls in V1. Plan state settable by super_admin.

### 14.2 API

```ts
type EntitlementKey =
  | 'talent_cap'
  | 'team_members_cap'
  | 'page_count_cap'
  | 'custom_domain'
  | 'advanced_design'
  | 'analytics'
  | 'hub_listing'
  | 'remove_branding';

function checkEntitlement(
  orgId: string,
  key: EntitlementKey,
): { allowed: boolean; limit?: number; used?: number; reason?: string };

async function withEntitlement<T>(
  orgId: string,
  key: EntitlementKey,
  fn: () => Promise<T>,
): Promise<T>;  // throws EntitlementDenied with reason for telemetry
```

### 14.3 UI

- `<LockedChip entitlementKey orgId />` — renders gold "Pro" chip + opens
  feature-specific upgrade modal.
- `<QuotaBanner entitlementKey orgId />` — shows "X of Y used; N remaining"
  above list pages approaching quota.
- Upgrade modal names the **specific** feature being unlocked, not a
  generic pricing page.

### 14.4 Plan definitions (V1 placeholder; D1 revisits)

| Plan | talent_cap | team_cap | custom_domain | advanced_design | analytics |
|---|---|---|---|---|---|
| Free | 10 | 1 | no | no | basic |
| Pro | 50 | 3 | yes | yes | standard |
| Growth | 200 | 10 | yes | yes | full |
| Elite | ∞ | ∞ | yes + white-label | yes | full |

### 14.5 Rules

- Dropping a tier preserves existing data; only new adds are gated.
- Lock surfaces never 404 — always show the upgrade path.
- All entitlement denials logged to `platform_audit_log`
  (`action='entitlement.denied'`).

---

## 15. Product analytics & activation events

### 15.1 Principle

Instrument adoption funnels now so the product tells us where it breaks.

### 15.2 Event registry (V1 minimum)

| Event | Actor | Properties |
|---|---|---|
| `user.signed_up` | user | role, entry_vector |
| `agency.created` | owner | template, subdomain |
| `agency.onboarding.step_completed` | owner | step_name, duration |
| `agency.onboarding.completed` | owner | total_duration, talents_added |
| `talent.profile.created` | talent | source (direct/invite/claim) |
| `talent.profile.claim_completed` | talent | placeholder_age_days |
| `talent.share_link.copied` | talent | medium (copy/whatsapp/qr) |
| `agency.invite.sent` | agency staff | channel, count |
| `agency.invite.opened` | invitee | token_age |
| `agency.invite.accepted` | invitee | token_age |
| `talent.representation_request.submitted` | talent | target_type |
| `talent.representation_request.decided` | reviewer | outcome (approved/rejected) |
| `inquiry.submitted` | client | source_type, org_id, talents_count |
| `inquiry.coordinator_assigned` | system | inquiry_id, coordinator_id |
| `inquiry.offer_sent` | coordinator | inquiry_id, participants_count |
| `inquiry.booking_confirmed` | system | inquiry_id, booking_id |
| `entitlement.denied` | user | key, org_id |

### 15.3 Storage

- `activity_log` (tenant-scoped) — user-visible timeline events.
- `platform_audit_log` (cross-tenant) — super-admin / compliance events.
- Add **`analytics_events`** table: `id`, `event_name`, `actor_id NULL`,
  `tenant_id NULL`, `properties JSONB`, `created_at`. Append-only. No RLS on
  write (server-only). Read restricted to platform_admin.
- Integration with PostHog/Amplitude optional — deferred.

### 15.4 Funnel reports (post-launch)

- **Talent onboarding:** signup → profile_created → share_link_copied.
- **Agency onboarding:** signup → agency_created → first_talent_added →
  first_share → first_inquiry.
- **Freelancer → hub:** share_link_copied → representation_request_submitted
  → decided (approved) → first_hub_inquiry.

Reports build on `analytics_events`; tooling is later.

---

## 16. MVP rollout — per-milestone acceptance criteria

Each milestone is its own branch, PR, acceptance gate (charter §6). Each
ships with: **routes working**, **data shape**, **demoable UI**,
**non-regression guard**.

### M0 — Foundations (1 week, schema-only)

- **Forward:** steps 1–7 in §6.2. No UI. No route changes.
- **Routes working:** none new; existing routes unaffected.
- **Data shape (post-M0):**
  - `agencies` has `kind` column; exactly one `kind='hub'` row.
  - Hub org has 5 paired rows (identity, branding, 1 page, 1 section, 1
    nav menu).
  - `agency_domains` entries for `pitiriasisversicolor.com` and `hub.local`
    have `tenant_id = <platform_hub_uuid>`.
  - `agency_memberships.role` CHECK allows 2 new values (`hub_moderator`,
    `platform_reviewer`).
  - `talent_profiles.phone_e164` column + partial unique index + backfill
    applied (non-collision rows). Collision sets, if any, are routed to
    `phone_e164_backfill_collisions` for super-admin review. Email
    canonicalization is explicitly out of M0 scope (see §5.6).
- **Demoable UI:** none (schema-only milestone).
- **Non-regression guard:**
  - All existing tenant #1 surfaces render unchanged at
    `improntamodels.com` + local dev.
  - All RLS policies continue to enforce tenant #1 scope.
  - Inquiry engine still functions (existing test suite green).
  - No user-visible change.
- **Exit:** validation queries (§6.2) all pass; rollback scripts tested in
  staging.

### M1 — Site-admin CMS serves hub (abstraction-gate, 1–2 weeks)

- **Routes working:**
  - `pitiriasisversicolor.com/` → hub homepage (CMS-driven).
  - `app.pdcvacations.com/admin` (authenticated super_admin) → org selector
    includes hub.
  - `app.pdcvacations.com/admin/site-settings` with hub org selected → all
    Phase 5 surfaces load (identity, branding, design, nav, pages, sections,
    structure).
- **Data shape:** hub org's CMS data matches the QA fixture dataset (§18).
- **Demoable UI:** super_admin logs in → switches active org → edits hub
  branding → publishes → hub homepage reflects change within 60s.
- **Non-regression guard:**
  - **No branching on `agencies.kind` inside any CMS RPC or server action.**
    `if (org.kind === 'hub')` in the CMS write-path is a review-block.
  - Agency-org CMS flows produce identical before/after data via the same
    RPCs (parity test: run the same RPC sequence against an agency fixture
    and the hub org; serialize both outputs; diff must only show tenant_id
    + the 5 seeded identity/branding/page/section/nav rows' distinct values).
  - Existing agency storefront (`improntamodels.com`) renders unchanged.
- **Exit:** 4 acceptance criteria met (§16 M1 detail); abstraction-parity
  test green.

### M2 — Freelancer `/t/[code]` canonical surface (1 week)

- **Routes working:**
  - `app.pdcvacations.com/t/[profileCode]` → canonical global view for any
    approved + public talent.
  - `improntamodels.com/t/[profileCode]` → agency-overlay view (unchanged
    behavior + canonical link header).
  - `pitiriasisversicolor.com/t/[profileCode]` → 404.
- **Data shape:**
  - Surface allow-list includes `/t/*` on app host kind.
  - Visibility resolver (§11) deployed as `resolveTalentVisibility()` in
    [web/src/lib/talent/visibility.ts](web/src/lib/talent/visibility.ts).
- **Demoable UI:**
  - Talent copies share link from dashboard → paste in WhatsApp → preview
    shows OG image + name + tagline.
  - Click through on mobile → hero + gallery + CTA visible above the fold.
  - Agency overlay link on app-host page redirects to agency storefront.
- **Non-regression guard:**
  - Agency-host `/t/[code]` serialization unchanged (no overlay fields
    leaking; no canonical field missing).
  - Hidden / private talents still 404 on all public surfaces.
- **Exit:** cross-surface serialization test (Gate 3 partial) green;
  WhatsApp preview verified manually.

### M3 — Org selector + admin workspace refit (1–2 weeks)

- **Routes working:**
  - `app.pdcvacations.com/admin` — cookie-based active-org selector,
    authorization server-side via `agency_memberships`.
  - All `/admin/*` routes scope to cookie-selected org.
- **Data shape:** `agency_memberships` row presence gates access.
- **Demoable UI:**
  - User with membership in agency + hub switches via selector; CMS + roster
    + inquiries + settings scope to the chosen org; no re-login.
  - Tampered cookie (manually edited to an org the user doesn't belong to)
    is rejected server-side with audit log entry.
- **Non-regression guard:**
  - Existing admin flows for tenant #1 unchanged (same cookie default).
  - RLS still denies cross-tenant access regardless of cookie.
- **Exit:** cookie-tamper test green; multi-org staff UX verified.

### M4 — Hub approval workflow (2–3 weeks, charter Phase 7 scope)

- **Routes working:**
  - Talent dashboard → apply-to-hub flow writes
    `talent_representation_requests` row (`target_type='hub'`).
  - Hub-org admin: reviewer queue at `app.pdcvacations.com/admin/hub/queue`.
  - Approval effectuation: updates
    `agency_talent_roster.hub_visibility_status='approved'`.
- **Data shape:** approved talent appears in hub directory within 60s.
- **Demoable UI:**
  - Talent clicks "Apply to hub" → sees pending status → reviewer approves →
    talent sees "Approved" status → talent card appears on hub directory.
  - Rejected path: rejection reason visible to talent.
- **Non-regression guard:**
  - Agency-only talents (not submitted to hub) do not appear on hub
    directory.
  - Hub-approval does not leak agency overlays to hub view (Gate 3 full).
- **Exit:** Gate Test 2 (charter §22.9) green for hub visibility.

### M5 — Growth hooks (1–2 weeks, can interleave)

- **Routes working:**
  - Copy / WhatsApp / QR share widget on talent dashboard.
  - OG image endpoint for talent.
  - Invite accept flow: link → register → roster membership.
- **Data shape:** `analytics_events` logs share + invite events.
- **Demoable UI:** talent taps "Share" on mobile → share sheet opens → OG
  card lands in WhatsApp clean. Agency sends invite via WhatsApp deep
  link → talent accepts → appears in agency roster.
- **Non-regression guard:** no impact on existing inquiry / media flows.
- **Exit:** activation funnel data flowing in `analytics_events`.

### Gate to launch (charter §22.9 Gate 2, final)

- Tenant isolation tests pass with both org kinds.
- Hub visibility workflow operational.
- All four logs wired for hub + agency scenarios.
- Cross-surface serialization review complete.
- Performance budget met (§13.5).

---

## 17. QA fixtures / demo dataset

Required to prove the abstraction, not just run migrations. Extend
`web/scripts/seed-phase5-qa.mjs` + `supabase/seed_phase5_qa.sql`.

### 17.1 Orgs

- 1 agency org (existing QA tenant `22222222-2222-2222-2222-222222222222`).
- 1 hub org (new, seeded in M0 at `<platform_hub_uuid>`).

### 17.2 Users + memberships

| Role | On org | Phone (E.164) | Email |
|---|---|---|---|
| super_admin | — | +52... | `platform@qa.local` |
| hub_moderator | hub | +52... | `hub-mod@qa.local` |
| agency owner | agency | +52... | `owner@qa.local` |
| agency coordinator | agency | +52... | `coord@qa.local` |
| client user | — | +52... | `client@qa.local` |
| talent — invited (placeholder) | — | +52... | `talent-a@qa.local` |
| talent — claimed (verified) | — | +52... | `talent-b@qa.local` |
| talent — hub-approved | — | +52... | `talent-c@qa.local` |

### 17.3 Content

- Hub homepage + directory + apply page (CMS-driven).
- Agency homepage + directory + about page (CMS-driven; existing QA seed).
- 1 new inquiry (status=`new`, coordinator unassigned).
- 1 in-progress inquiry (offer sent, approval pending).
- 1 completed booking.
- 1 hidden talent (`workflow_status='hidden'`).
- 1 private talent (`visibility='private'`).
- 1 rejected `talent_representation_requests` row.

### 17.4 Visibility matrix proofs

| Talent | App host `/t/[code]` | Agency storefront | Hub directory |
|---|---|---|---|
| B (claimed, approved, public) | visible | visible | invisible (no hub request) |
| C (hub-approved) | visible | visible | visible |
| A (invited placeholder) | 404 until approved | 404 (roster pending) | 404 |
| Hidden | 404 | 404 | 404 |
| Private | 404 | 404 | 404 |

These are the regression tests for every future milestone.

### 17.5 Idempotence

Seed script must be idempotent. Re-running does not duplicate data. All IDs
deterministic via namespacing convention (`22222222-xxxx-...` for agency QA;
`aaaaaaaa-xxxx-...` for hub QA).

---

## 18. UX & product quality plan

### 18.1 Guiding principles

1. Mobile-first, desktop-strong.
2. WhatsApp-readable share surfaces.
3. Linktree simplicity / Instagram browsing feel.
4. Premium tone, utilitarian density.
5. No dead ends — every state has a next step.

### 18.2 Onboarding flows

#### Agency owner (on `pdcvacations.com`)

Landing → Sign up (email/Google OTP) → Create agency (name + subdomain +
city) → Pick template → Brand basics (logo + color, skippable) → Add first
talents (quick-add + free-cap banner) → Share success screen (Copy / WhatsApp
/ QR) → Workspace with guided checklist.

Target: time-to-first-share < 3 min desktop / 4 min mobile.

#### Talent (three vectors → one flow)

- **Direct** (hub): "Join as talent."
- **Agency invite**: link with invite token.
- **Claim**: link with `profile_code`; matches on OTP.

Trunk: Entry → Sign up (phone OR email OTP) → Basic profile (display name,
city, bio — 3 fields max) → Media (1 photo, skip allowed) → Context step
(hub/agency/join/confirm) → Your public link → Dashboard.

#### Client (preserved)

Guest browse → Save → Inquire → Optional register on inquiry submit.

### 18.3 Invite / claim flow

Agency invite: placeholder profile + pending roster + WhatsApp-first deep
link (email fallback). Talent claim: match on canonical phone/email → OTP
verify → merge overlays preserved. Soft-match dup prevention per §9.

### 18.4 Dashboard IA

All on `app.pdcvacations.com`. Cookie-scoped to active org.

**Admin:** Overview / Inquiries / Bookings / Talents / Clients / Site (CMS) /
Team / Analytics / Settings. Mobile bottom nav: Overview · Inquiries ·
Talents · More.

**Talent:** Overview (completeness + public link prominent) / My Profile /
Inquiries / Portfolio / Orgs I'm in / Account. Mobile bottom nav: Home ·
Profile · Inquiries · Link.

**Client:** Overview / Saved / Inquiries / Bookings / Account (existing).

### 18.5 Public talent page (`/t/[code]`)

Hero (one large photo + name + city + bio) · Media gallery · Fast-facts
chips · Primary CTA "Send inquiry" (guest-capable) · Share + Save · Small
"Listed on Impronta" footer (no agency branding leak).

WhatsApp-readiness: OG image auto-generated per talent, short URL,
Twitter-card.

### 18.6 Hub discovery & apply

Landing (value prop, filter chips, directory grid) · Card tap →
hub-projection profile · "Join the hub" CTA → talent onboarding (direct
vector) → optional `talent_representation_requests` with `target_type='hub'`.

### 18.7 Free vs paid locks

See §14.3. In-line lock chips, quota banners, right-pane upgrade modals.
No dark patterns. `/admin/settings/billing` stub pre-D1.

### 18.8 Mobile vs desktop quality bar

Mobile: ≥ 44pt touch targets, bottom sheets, sticky CTAs, Web Share API.
Desktop: side-by-side, keyboard shortcuts, dense data views.
Shared: 12/14/16/20/24/32 type scale, 150–250ms animations, reduced-motion
honored.

### 18.9 Design tone

Agency: black + gold luxury (Impronta blueprint). Hub: premium neutral
(off-white / ink / accent). Marketing: product-first, low ornament. App:
utility first, org brand as sidebar accent only.

---

## 19. UI contract & state inventory

Every page ships with five designed states: **empty · loading · locked ·
success · error**. PR merge gate: a page without all five documented is
review-blocked.

### 19.1 State rules

| State | Rule |
|---|---|
| **empty** | Primary CTA visible to create first record; no blank page. |
| **loading** | Skeleton matching final layout; no spinners without text. |
| **locked** | `<LockedChip />` on disabled controls + upgrade entry point (§14.3). Never hidden. |
| **success** | Toast or inline confirmation. Next action suggested. |
| **error** | Plain-language error + retry affordance. No stack traces in UI. |

### 19.2 Starter inventory (extend per milestone)

**Public (per host kind):**

| Page | Empty | Loading | Locked | Success | Error |
|---|---|---|---|---|---|
| Marketing landing | n/a | skeleton hero | n/a | "Signed up!" toast | retry banner |
| Hub homepage | "Discover talent" default | skeleton sections | n/a | — | retry |
| Hub directory | "No results — try fewer filters" | skeleton grid | filter cap chip | — | retry |
| Agency storefront homepage | publish prompt (staff only) | skeleton | — | — | retry |
| `/t/[code]` | n/a (404 if invisible) | skeleton hero + gallery | n/a | — | retry |
| Inquiry submit form | — | submit spinner | — | success screen | field errors + retry |

**Admin (per tab):**

| Page | Empty | Loading | Locked | Success | Error |
|---|---|---|---|---|---|
| Overview | "Welcome — add your first talent" | skeleton cards | — | — | retry |
| Inquiries list | "No inquiries yet" | skeleton rows | — | row-level toast | error banner |
| Inquiry detail | "Start by assigning a coordinator" | skeleton workspace | lock chips on gated actions | inline confirmation | error banner |
| Talents list | "Add your first talent" | skeleton rows | "At plan cap" banner | add toast | error banner |
| Talent add (modal) | — | submit spinner | cap-reached modal | created toast | field errors |
| Site / identity | — | skeleton form | — | saved toast | field errors |
| Site / branding | — | skeleton | — | saved toast | validation errors |
| Site / pages | "Create your first page" | skeleton rows | page-cap chip | published toast | conflict banner |
| Site / sections | "Create reusable sections" | skeleton | — | — | — |
| Site / nav | "Add items to your menu" | skeleton tree | — | publish toast | — |
| Site / structure | — | skeleton slots | — | publish toast | — |
| Site / design | — | skeleton | locked design options | publish toast | — |
| Team | "Invite your team" | skeleton rows | seat-cap chip | invite sent toast | — |
| Settings / billing | — | skeleton | — | plan change confirmation | — |

**Talent dashboard:**

| Page | Empty | Loading | Locked | Success | Error |
|---|---|---|---|---|---|
| Overview | completeness meter + share CTA | skeleton | — | — | retry |
| My Profile | "Complete your profile" | skeleton form | gated sections chip | saved toast | field errors |
| Inquiries | "No inquiries yet" | skeleton | — | — | retry |
| Portfolio | "Upload your first photo" | skeleton grid | media-cap chip | upload toast | upload errors |
| Orgs I'm in | "You're not in any orgs yet" | skeleton | — | — | retry |
| Account | — | skeleton | — | saved toast | field errors |

### 19.3 Modals / drawers

| Surface | Used for | States |
|---|---|---|
| Upgrade modal | entitlement denial | loading/success/error |
| Invite composer | agency → talent | loading/success/error |
| Claim confirmation | talent → placeholder match | loading/success/error |
| Inquiry drill drawer | workspace V3 | loading/success/error |
| Media lightbox | gallery view | loading/error |
| Theme editor | design tab | loading/draft-vs-live/success/error |

### 19.4 Review checklist (per PR that touches UI)

- [ ] All five states shown in Storybook or design doc.
- [ ] Mobile layout tested (360 + 640 widths).
- [ ] Keyboard navigation works on desktop.
- [ ] Screen-reader labels present.
- [ ] Reduced-motion variant exists for animations.
- [ ] OG meta present for shareable pages.

---

## 20. Future-safe hooks

- Multiple hubs (add `kind='hub'` rows).
- Talent in multi-org (roster rows, D3 defers UX).
- Premium/private talent (`membership_tier` hook; new surface enum value).
- Agency↔agency federation (D9 deferred; schema allows).
- White-label / custom domains for hub orgs (`agency_domains.kind='custom'`
  works for any kind; D6 deferred).
- Platform marketplace / multi-hub competition (D2;
  `talent_representation_requests.target_id` already accommodates).

---

## 21. What this plan explicitly does not do

- No table renames.
- No inquiry/booking engine changes.
- No new auth system.
- No billing scope (D1).
- No Phase 5 code refit that blocks on this work — but Phase 5 should **not
  merge agency-only** until M1 proves the abstraction.

---

## 22. Decisions locked 2026-04-20

1. `agencies.kind` (values `agency | hub`). No rename. (L45)
2. Cookie-based `/admin` with active-org selector; authorization via
   `agency_memberships`. (O5)
3. Canonical+overlay client model final; person may hold multiple
   roles; capability-not-universe for coordinator/moderator/reviewer.
   (O6, O7)
4. DNS family locked (`pdcvacations.com` / `app.pdcvacations.com` /
   `pitiriasisversicolor.com` / `improntamodels.com` / `impronta.local`);
   L40 amended.
5. M1 is the abstraction gate; no agency-only Phase 5 merges to main before
   M1 passes.
6. M0 identity normalization is phone-only (`talent_profiles.phone_e164`);
   email ownership + canonicalization is a deferred follow-up (§3.7, §5.6).
   No `auth.users → profiles` mirror trigger ships in M0.
7. `agency_memberships.role` is a `TEXT` + `CHECK` column, not a Postgres
   `ENUM`; migrations extend it via `DROP/ADD CONSTRAINT` (§6.2 Step 6).

**Still open (non-blocking for M0):** O2, O3, O4.

---

## 23. Relationship to existing Phase 5 docs

- `docs/saas/phase-5/00-guardrails.md` — authoritative for CMS guardrails;
  unchanged.
- `docs/saas/phase-5/m0-readiness-checklist.md` — still valid; this plan
  adds M0 (org foundation) as a prior step.
- `docs/saas/phase-5/future-roadmap.md` — superseded by §16.
- `docs/saas/open-decisions.md` — update per §3.4 closures.
- `docs/saas/transitional-debt.md` — unchanged; this plan adds no debt.

---

## 24. One-page summary

- Schema already ~80% of the way to the network vision.
- Missing 20%: `agencies.kind`, hub org row, hub domain rebind, hub CMS
  seed — one enum, one column, a handful of seeds.
- `/t/[code]` route already exists; add app-host allow-listing + resolver
  branching.
- Phase 5 CMS does not need a code refit — it needs a hub org. M1 proves
  that.
- Production-mindedness: every migration has backfill + validation + rollback;
  every page has five designed states; every activation moment is logged;
  every public surface has a caching + SEO plan.
- UX: mobile-first, WhatsApp-readable, Linktree-simple sharing, premium
  tone.
- Engine, bookings, taxonomy, field system, media pipeline all untouched
  structurally; media pipeline gets moderation + cleanup rules.

Not a rebuild. A four-to-six-week architectural pivot, delivered with
production-level discipline, that reframes what's already built into the
network-first story.

---

## 25. Appendix A — Execution risk playbook

Six high-leverage areas where a silent mistake becomes expensive. Each has a
contract explicit enough that a reviewer can flag drift without ambiguity.

### A.1 Context model — surface × active org × acting capability

Three orthogonal inputs. Every server request resolves all three before
authorizing anything.

| Input | Source | User-controlled? | Scope |
|---|---|---|---|
| **Surface context** | middleware from host header → `agency_domains` | no | which product surface the request hits: `marketing | app | hub | agency | freelancer_on_app` |
| **Active org** | signed cookie (`active_org_id`) or default | yes, within memberships | which org the user is currently acting as in `/admin` |
| **Acting capability** | `capabilities_for(user, active_org, action)` | no | computed set of allowed actions (`manage_site`, `moderate_hub`, `coordinate_inquiry`, etc.) |

**Switching rules:**

- A user may switch **active org** only to orgs where `agency_memberships`
  has an active row for that user.
- Switching sets the `active_org_id` cookie (signed, HttpOnly, 90-day TTL)
  and triggers a per-user cache-tag invalidation.
- The server **never trusts the cookie alone** — every request re-checks
  membership against `agency_memberships` and recomputes capabilities.
- On any role/membership change, the cookie is invalidated server-side on
  the next request (version stamp mismatch).
- A user cannot switch **surface context** — that is decided by the host.
  Navigating from `app.pdcvacations.com` to `improntamodels.com` is a
  cross-surface navigation, not a context switch.

**UI labeling contract:**

- Admin shell header (persistent): `{OrgDisplayName}  [kind badge]  [role chip]`
  — e.g. `Impronta Models  [Agency]  [Owner]` vs `Impronta Hub  [Hub]  [Moderator]`.
- When the user holds memberships in more than one org, the org name is a
  dropdown with the full list.
- Below the header a thin contextual strip appears **only when the selected
  org is a hub**: "Hub moderation context — actions affect directory-wide
  visibility." Subtle, neutral tone, never alarmist.
- Talent dashboard (no org context) shows `Talent` mode in the header chip;
  no active-org selector.
- Super-admin on another org shows a red `Super-admin override` banner —
  non-dismissible while active.

### A.2 Visibility precedence matrix

Explicit truth table. Source of truth for the §11 resolver. Top-down
precedence: first matching row that resolves to `hidden/410/404` wins; the
remaining rows only apply if prior gates pass.

| # | Gate | Condition | Freelancer `/t/[code]` (app host) | Agency host `/t/[code]` | Hub listing + `/t/[code]` | Admin view |
|---|---|---|---|---|---|---|
| 1 | **Org suspended** | `agencies.suspended_at IS NOT NULL` for owning/roster org | canonical still served **if talent itself is not suspended** | **410 Gone** (tenant-host-wide) | removed | super-admin only |
| 2 | **Talent suspended** | `talent_profiles.suspended_at IS NOT NULL` | **410 Gone** | 410 Gone | removed | super-admin only |
| 3 | **Soft-deleted** | `talent_profiles.deleted_at IS NOT NULL` | **410 Gone** (30d) → 404 | 410 → 404 | removed | super-admin only (archived) |
| 4 | **Moderation hold** | `workflow_status != 'approved'` | **404** | 404 | not listed | visible with `needs_review` banner |
| 5 | **Privacy-hidden** | `visibility != 'public'` | **404** | 404 | not listed | visible with `private` banner |
| 6 | **Roster-scoped hide (agency)** | `roster.agency_visibility = 'hidden'` | canonical served (not agency-governed) | **404** on that tenant | unaffected unless also hub-hidden | visible in that org's admin |
| 7 | **Hub visibility** | `roster.hub_visibility_status != 'approved'` | canonical served | unaffected (agency-governed) | **not listed + 404** on hub host | visible in hub admin queue |
| 8 | **Default (all gates pass)** | — | ✓ canonical (no overlays) | ✓ canonical + requesting-org overlays | ✓ canonical + hub-governed fields | ✓ full |

**Notes:**

- Rows 1–3 are **super-admin kill-switches** (A.5). They preempt everything,
  including talent's own privacy settings, and write to
  `platform_audit_log`.
- Row 6 is org-local: if Org A hides a talent from *its* site, Org B's site
  and the freelancer canonical page are unaffected.
- A talent can be simultaneously visible on the freelancer surface and
  hidden on a specific agency site — this is a supported state, not a bug.
- Overlay application is a **view-time merge**, never a write to the
  canonical. Serializers enforce which overlay applies per surface (Gate 3).

### A.3 Claim / dedupe / merge rules

Draft profiles created by agencies and later-signing-up humans must merge
cleanly or fail loudly. No silent data joins.

**Decision table** (first match wins):

| Trigger | Match strength | Action | Human review? |
|---|---|---|---|
| Agency creates draft; phone matches an already-**verified** talent profile | exact verified `phone_e164` | Agency UI offers "Invite existing talent to your roster"; agency may override with "Attach without inviting" → creates roster row against existing canonical; no new profile | no |
| Agency creates draft; phone matches an **unverified** placeholder in any org | exact unverified `phone_e164` | Attach: new roster row against the existing placeholder; `source` remains `agency_created` on the canonical | no |
| Agency creates draft; email matches verified but phone differs | canonical email match only | Warn: "A verified account exists with this email. Is this the same person?" Agency must confirm `different_person=true` to proceed; decision logged | flag for review if `different_person=true` set |
| Talent signup; phone matches exactly one placeholder | exact unverified `phone_e164` | Claim flow: OTP → on success, set `user_id`, `claimed_at`, status `claimed`. All overlays preserved. | no |
| Talent signup; phone matches **multiple** placeholders | exact, ambiguous | User picks one during claim; losers archived with `deleted_at` + `claim_rejection_reason='user_disowned'` | **yes — always queue for super-admin review**, regardless of outcome |
| Talent signup; phone matches a **verified** user | exact verified | Refuse: "A verified account already uses this phone. Sign in or reset password." | no |
| Talent signup; phone + email match **different** profiles | cross-field collision | **Block signup**; enqueue to super-admin review queue with side-by-side diff | **yes — hard block** |
| Invite by email to X; X already on platform under a different email but matching phone | canonical phone match at OTP step | Offer: "You already have an account — accept this invite into your existing profile?" | no |
| Invite collision — two orgs invite same phone within overlap window | race | First OTP-verified claim wins the canonical; the other org receives "already claimed" and may request a roster attach | no |
| Agency creates draft; phone is already verified on another agency's roster | exact verified `phone_e164` | Allowed (multi-roster model); UI warns "Represented by {other_org}" — no merge, just a new roster row | no |

**Human review queue:**

- Super-admin role only in V1 (D10 defers full merge tooling to V1.5).
- Queue row: both profiles' canonical fields + activity log links + flag
  reason. Side-by-side diff.
- Permitted actions in V1: `archive_one`, `confirm_distinct` (90-day
  warning suppression), `defer`. Merge action is V1.5.
- Every decision writes `platform_audit_log` with actor, reason, and both
  profile IDs.

**Guardrails:**

- **No automatic merges in V1.** Detection is the contract; linking is
  human-gated.
- Claim tokens (`talent_claim_tokens`): 7-day TTL, single-use, rotate on
  resend, bound to `phone_e164` at issue time.
- A claim can only be initiated by a phone that is currently attached to at
  least one placeholder; `claim_rejection_reason` is required on any decline.

### A.4 Public caching / privacy invalidation — privacy-first default

**Cache policy:**

- Public pages set `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`.
- Authenticated pages: `private, no-store`.
- ISR is **opt-in per page**; default is SSR with short `s-maxage`.
- Cached HTML **never embeds** `contact_email` or `phone_e164`; those are
  hydrated client-side via authenticated RPC so a revocation never leaves
  PII in a cached response.

**Cache tag taxonomy:**

| Tag | Scope |
|---|---|
| `tenant:{orgId}:site` | full org site (storefront + nav) |
| `tenant:{orgId}:talent:{profileCode}` | agency-host overlay page |
| `talent:{profileCode}:canonical` | app-host freelancer page |
| `hub:global:listings` | hub directory listings |
| `hub:global:talent:{profileCode}` | hub-host talent card |
| `user:{userId}:session` | per-user (context switch, membership change) |

**Invalidation fan-out** (every write path MUST emit the listed tags):

| Mutation | Tags invalidated |
|---|---|
| talent sets `visibility='private'` | `talent:{code}:canonical`, every `tenant:{rosterOrg}:talent:{code}`, `hub:global:talent:{code}`, `hub:global:listings` |
| talent sets `workflow_status!='approved'` | same as above |
| org admin sets `roster.agency_visibility='hidden'` | `tenant:{orgId}:talent:{code}`, `tenant:{orgId}:site` |
| hub moderator sets `hub_visibility_status='rejected'` | `hub:global:talent:{code}`, `hub:global:listings` |
| super-admin sets `talent_suspended_at` | **all of the above** + `user:{userId}:session` + CDN purge of media variants |
| super-admin sets `org_suspended_at` | `tenant:{orgId}:*` (wildcard) + hub tags for any talent on that roster |
| `deleted_at` set on talent | all talent-scoped tags + serve 410 with 30-day TTL before 404 |

**Delivery contract:**

- Invalidation is **synchronous** with the DB write via a transactional
  outbox (`cache_invalidations` table). Processor aims for <5s p95, <30s p99;
  queue backlog >30s fires a platform alert.
- Every revocation path ships with an integration test asserting: (a) DB
  state changed, (b) expected tags emitted, (c) a fetched HTML response
  within 10s reflects the new state.
- `X-Robots-Tag: noindex` is applied at render time whenever `visibility !=
  'public'` OR `workflow_status != 'approved'` — defense in depth against a
  cache race leaking a now-private page to a crawler.

**Privacy-first default:** when in doubt, prefer shorter TTL. Operators may
extend for public-only, non-PII surfaces (hub listing) with explicit review.

### A.5 Moderation / kill-switch capabilities

Six switches, layered from surface-local to platform-global. All audited.
All reversible except hard-delete.

| # | Switch | Who | Storage | Blast radius | Reversible? | Audit |
|---|---|---|---|---|---|---|
| 1 | **Hide from hub** | hub moderator | `roster.hub_visibility_status='hidden'` | hub host + hub listings only | yes (set `approved`) | `hub_moderation_action`, `platform_audit_log` |
| 2 | **Hide globally (privacy)** | talent self-serve | `talent_profiles.visibility='private'` | all public surfaces 404; admin views retain | yes | `activity_log`, `platform_audit_log` |
| 3 | **Suspend org** | super-admin | `agencies.suspended_at`, `suspension_reason` | entire tenant host → 410 on public; admin read-only with banner; inquiry engine locks new actions; scheduled bookings honored + flagged | yes (clear timestamp) | `platform_audit_log` + persistent admin banner |
| 4 | **Suspend talent** | super-admin | `talent_profiles.suspended_at`, `suspension_reason` | all public surfaces → 410; removed from all hub listings; inquiry participation blocked | yes | `platform_audit_log` |
| 5 | **Freeze publishing** | super-admin or org owner self-opt | `agencies.publishing_frozen_at` | CMS write paths denied with explanatory message; read/admin still works; public pages serve last-published version | yes | `platform_audit_log` |
| 6 | **Soft-delete** | super-admin; self-serve for talent | `deleted_at` | 410 for 30 days → 404; slug reserved for 180 days; media retained for 30d in private bucket | restore within 30d | `platform_audit_log` |

**Enforcement layering** (kill-switches check at both):

1. **Middleware** — suspended org hosts short-circuit to 410 before any
   route renders. Uses the same `agency_domains` resolver output plus an
   `agencies.suspended_at` lookup (cached 60s; invalidated on toggle).
2. **Resolver / RLS** — even on cache miss, the visibility resolver
   (§11 + A.2) rechecks kill-switch columns server-side, so stale state
   can't leak.

**Media cleanup on suspension/deletion:**

- Variants: CDN purge via cache-tag fan-out (A.4).
- Originals: retained in private bucket for 30 days for reversibility;
  purged on hard-delete (D11 defers the hard-delete workflow).

**Audit trail requirements:**

- Every kill-switch toggle logs: `actor`, `target`, `prior_state`,
  `new_state`, `reason` (**required**, freeform min 10 chars), `user_agent`,
  `ip`, `timestamp`.
- Reversals are first-class audit entries, not mutations of the prior one.
- Talent-initiated privacy toggles (#2, #6-self-serve) don't require a
  textual reason, but still log the event.

### A.6 Canonical-share / SEO / branding for `/t/[profileCode]`

The freelancer profile renders on three host kinds; SEO and branding rules
differ per kind. The app host is the canonical authority.

**URL authority:**

- **Canonical URL:** `https://app.pdcvacations.com/t/{profileCode}`.
  - The only URL submitted to `sitemap.xml`.
  - The default `Share` button target in talent dashboards.
  - `og:url`, `twitter:url`, and `rel="canonical"` on all three host variants.
- **Agency-host variant:** `https://{agency-host}/t/{profileCode}`.
  - Renders if the talent has a roster row on that org with
    `agency_visibility ∈ ('site_visible','featured')`.
  - `<link rel="canonical" href="https://app.pdcvacations.com/t/{code}">`.
  - `<meta name="robots" content="noindex, follow">` — agency overlay
    variants do not compete with the canonical in SERPs.
  - Internal agency-site CTAs ("View full profile") link here for brand
    continuity; the `Share` button on this page still copies canonical.
- **Hub-host variant:** `https://pitiriasisversicolor.com/t/{profileCode}`.
  - Renders if `hub_visibility_status='approved'`.
  - `<link rel="canonical" href="https://app.pdcvacations.com/t/{code}">`.
  - **Indexable** (`index, follow`) — the hub is a product surface we want
    discoverable.
  - `Share` from a hub listing copies the hub-host URL (preserves hub
    social signal); `og:url` still points to canonical so previews
    consolidate.
- **Marketing host** (`improntamodels.com`): `/t/*` rejected by surface
  allow-list. No render.

**SERP authority:** only the canonical URL is meant to rank. Internal links
from agency and hub sites contribute to canonical page authority without
splitting it.

**OG / social metadata** (uniform across all three variants):

| Property | Value |
|---|---|
| `og:type` | `profile` |
| `og:title` | `{talent.display_name} — {role or headline}` |
| `og:description` | talent tagline (fallback: first 160 chars of bio) |
| `og:image` | `cover_image.public_watermarked` variant (1200×630) |
| `og:url` | canonical (app host) |
| `twitter:card` | `summary_large_image` |
| `twitter:url` | canonical |

**Branding rules per surface:**

| Surface | Header / nav | Footer | Color + type | Talent data |
|---|---|---|---|---|
| App host (canonical) | Impronta platform header | Impronta footer | platform theme | canonical only |
| Agency host | agency `cms_navigation_menus` + agency logo from `agency_branding` | agency footer nav + required "Powered by Impronta" micro-mark | agency theme from `agency_branding` | canonical + requesting-org overlays |
| Hub host | hub `cms_navigation_menus` + hub logo | hub footer | hub theme | canonical + hub-governed fields; no agency overlays |

**Share-intent UX:**

- Talent dashboard `Share` button: uses `navigator.share` on mobile with
  canonical URL; clipboard copy on desktop with a "Copied!" toast.
- Agency site talent page: `Share` button copies canonical (not agency-host).
- Hub site listing: `Share` button copies hub-host URL (hub gets social
  signal; `og:url` still canonical so previews consolidate).
- QR code in dashboard encodes the canonical URL.

**Search Console:**

- App host is the property of record for canonical URLs.
- Agency sites have their own Search Console properties for their
  marketing pages; their `/t/*` pages are intentionally noindex and not
  submitted.
- Hub site has its own property; `/t/*` and listings pages are both
  indexable and submitted.

**Review-block rules** (any PR touching `/t/[code]` rendering):

- Every variant includes a canonical link pointing at app host.
- Only the app-host variant is in `sitemap.xml`.
- Agency variant ships `noindex`; hub variant ships `index`.
- `og:url` is always canonical regardless of host.
- No overlay fields are serialized on app-host responses.
- No agency overlays are serialized on hub-host responses.
