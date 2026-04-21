# Phase 5/6 — M6 scope when M0 is not yet applied

**Context.** Per decision (3), M0 migrations are not on the linked DB.
This note catalogs what M6 work can proceed *without* M0 schema, and
flags a latent-bug class in already-shipped M4/M5 code that should be
fixed first.

## 1. Latent bugs in committed code — read-first

Two commits on this branch reference `agencies.kind` (a column that
does not exist on the current linked DB). If those code paths hit
production before M0 lands, they return empty results / error from
PostgREST:

| File | Line | Query |
|---|---|---|
| `web/src/lib/invites/redeem.ts` (9e35451) | 61 | `.from("agencies").select("kind")` — used by `redeemInvitePayload` to derive `targetType` |
| `web/src/app/(dashboard)/talent/representations/page.tsx` (pre-M5) | 131 | `.from("agencies").select("id, display_name, kind").eq("kind", "agency")` |

**Neither path is user-reachable accidentally today**: `/invite/[token]`
requires a signed HMAC token, and the admin UI for generating those
does not yet exist. The talent representations page query returns
empty on error (`allAgencies = []`) so the UI degrades rather than
breaks — but the "browse agencies to request representation" affordance
shows zero rows until M0 applies.

**Proposed fix (tiny, pre-M6):** switch those two sites to the M5-style
`HUB_AGENCY_ID` constant short-circuit plus slug-based lookup. That
way the code works on any DB shape and M0 doesn't unlock them for the
first time — it only adds a hub row.

## 2. M6 candidate slices — pure code

None of the slices below INSERT new rows, add columns, or change
constraints. All are either tests, type tightening, or client-side
state machines over results that are already available.

### A. Tenant-surface branching — remove `agencies.kind` reads

- **Files:** `web/src/lib/invites/redeem.ts`,
  `web/src/app/(dashboard)/talent/representations/page.tsx`, possibly
  `web/src/lib/saas/tenant.ts` if the switcher query shares shape.
- **Change:** replace `.select("kind")` with an `id`-to-type
  resolution using the existing `HUB_AGENCY_ID` constant (from
  `web/src/lib/saas/tenant.ts`). Keeps code working on any DB shape.
- **Risk:** low. Unit-testable; no schema touch.

### B. `DirectoryFilterSection` kind tag (type narrowing only)

- **Files:** `web/src/lib/directory/directory-filter-catalog.ts`,
  `web/src/lib/directory/directory-filter-admin-eligibility.ts`,
  `web/src/lib/directory/field-driven-filters.ts`.
- **Change:** add a `surfaceKind: "agency" | "hub"` discriminator on
  filter sections. Wire up the catalog function to accept a kind
  parameter and return only sections valid for that kind. Hub =
  fewer sections than agency; wire it up at the type level before
  wiring at the render level.
- **Risk:** low. Pure TypeScript; the *runtime* already branches on
  `hostCtx.kind` (from `agency_domains.kind`, which exists pre-M0),
  so no behavior change — just typedness.

### C. Hub directory "empty states" inventory (UI only)

- **Files:** new `web/src/components/directory/directory-empty-states.tsx`,
  story under Storybook if the repo uses it (check first).
- **Change:** the five states for hub discovery: empty-no-approved,
  loading, locked-behind-signin, success, error. Pure presentational
  components receiving props; no data fetches.
- **Risk:** low. Dead code until wired; can ship independently.

### D. Filter cap UX — "Max N filters" chip

- **Files:** `web/src/components/directory/directory-filters-sidebar.tsx`
  (verify path; the agent's report is only a hint), plus the page that
  hosts it.
- **Change:** cap active filter chips at N; show a blocking chip when
  the user tries to add the N+1th. Client-side state only.
- **Risk:** low. Does not touch RPC or server logic.

### E. Visibility-resolver test coverage

- **Files:** `web/src/lib/talent/visibility.test.ts` (new).
- **Change:** unit tests for `resolveTalentVisibility` in
  `web/src/lib/talent/visibility.ts` covering the agency/hub/app
  surfaces and the combinations of workflow_status × visibility ×
  roster rows. Currently this resolver has no dedicated test file —
  it was added under M5 without coverage.
- **Risk:** zero. Tests only.

## 3. Slices that look OK but actually need M0

For reference, do NOT start these pre-M0:

- **Hub-scoped admin directory tab (`/admin/hub/directory`):** would
  query `agency_talent_roster WHERE tenant_id = HUB_AGENCY_ID` and
  display hub-approved talents. Today the hub UUID slot holds "Tenant
  B (Verification)"; roster rows under that tenant_id are test
  fixtures, not real hub data. Shipping the tab before M0 would ship a
  page with meaningless content.
- **Server action branching on `agencies.kind` for hub moderator
  gating:** cannot branch on a column that doesn't exist.
- **Hub CMS homepage rendering driven by `system_template_key='homepage'
  AND tenant_id=HUB_AGENCY_ID`:** the hub CMS rows are seeded by M0
  (step 100000). Without M0, the hub has no CMS anchor.

## 4. Recommended order

If we're starting M6 pre-M0, the lowest-regret sequence is:

1. **Fix the latent `agencies.kind` reads** (§1). Tiny PR, unblocks
   the talent representations page UI and removes the invite-accept
   production surprise.
2. **Add the visibility-resolver tests** (§2E). Retrofit coverage
   before anything else touches the resolver.
3. **Type-narrow `DirectoryFilterSection`** (§2B). Preparatory work
   for hub directory; no user-facing change yet.
4. Pause before §2C/D — those are customer-visible UX changes and
   warrant product review, not just technical review.
5. Hold §3 items until M0 is approved per
   `docs/saas/phase-5-6/m0-apply-runbook.md`.

This ordering keeps every step reversible, tested, and free of new
schema.
