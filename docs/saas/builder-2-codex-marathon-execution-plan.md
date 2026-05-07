# Builder 2.0 Codex Marathon Execution Plan

Date: 2026-05-06

Primary product plan:

- `docs/saas/page-builder-premium-2026-final-product-plan.md`
- `docs/saas/builder-2-product-architecture-plan.md`
- `docs/saas/page-builder-package-audit-2026-05-06.md`
- `docs/saas/builder-ownership-snapshot-qa-checklist.md`

This document is the execution runbook for a long Codex implementation pass.
It is designed so an implementation agent can complete Phase 1 through Phase 3
without stopping after every small decision.

## Recommended Codex Setup

Use a strong Codex coding model for the marathon:

- Preferred: GPT-5.3 Codex or newer coding-optimized Codex model.
- Reasoning: high for architecture and tenant/package work.
- Do not use a mini model for schema, package gates, snapshot publishing,
  tenant routing, or builder tree work.
- Mini models are acceptable only for mechanical cleanup after the main model
  defines the pattern.

The agent should work locally first. Do not push to Vercel unless local gates
are clean enough and the task specifically reaches a QA/deploy checkpoint.

## Marathon Rules

The agent should continue through the phase sequence without asking the user
for micro-approval.

Stop only for:

- A real architectural contradiction with `AGENTS.md`, `OPERATING.md`, or
  `docs/decision-log.md`.
- Missing credentials that block local verification.
- A destructive migration or production deploy decision.
- A failing test that points to possible data loss, tenant leakage, or broken
  public routing.

Do not stop for:

- Naming a small helper.
- Choosing a conservative local abstraction.
- Adding focused tests.
- Updating docs that describe the implemented behavior.

## Preflight Reading

Before editing, read:

- `AGENTS.md`
- `OPERATING.md`
- `docs/decision-log.md`
- `web/AGENTS.md`
- `docs/saas/builder-2-product-architecture-plan.md`
- `docs/saas/page-builder-package-audit-2026-05-06.md`
- `web/src/middleware.ts`
- `web/src/lib/saas/scope.ts`
- `web/src/lib/saas/admin-scope.ts`
- `web/src/lib/saas/surface-allow-list.ts`
- `web/src/lib/saas/host-context.ts`
- Existing tests next to touched files.

Tenant-touching changes must run:

- `npm run test:tenant-isolation`

Normal gate:

- Focused tests for touched modules.
- `npm run typecheck`
- Focused lint on touched files.
- Full `npm run lint` / `npm run ci` when the repo-wide lint debt is not the
  blocker; otherwise record unrelated lint blockers clearly.

## Phase 1 - Builder Package Capability Matrix

### Goal

Create one canonical source of truth for what Free, Studio, Agency, and Network
can do in the builder.

This phase removes scattered package interpretation and gives later builder
work a stable policy layer.

### Product Rules

Free:

- One public landing page.
- One starter template.
- Up to five roster people.
- Body sections editable.
- Header/footer/site shell locked or minimal.
- Directory card family locked.
- Profile layout family locked.
- No custom domain.

Studio:

- Branded subdomain.
- More templates.
- More pages/sections.
- Richer body style controls.
- Basic shell choices.

Agency:

- Branded subdomain and custom domain.
- Multi-page builder.
- Full shell editing.
- Directory/profile families.
- Reusable blocks.
- Advanced publish workflow.

Network:

- Shared templates/blocks across workspaces.
- Inheritance/locks.
- Multi-workspace permissions and analytics.

### Likely Files

Add:

- `web/src/lib/site-admin/builder-capabilities.ts`
- `web/src/lib/site-admin/builder-capabilities.test.ts`

Update callers discovered by search:

- `web/src/lib/site-admin/edit-mode/starter-action.ts`
- `web/src/lib/site-admin/edit-mode/workspace-templates-action.ts`
- `web/src/lib/site-admin/server/pages.ts`
- `web/src/app/(dashboard)/admin/site-settings/pages/actions.ts`
- `web/src/app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts`
- `web/src/lib/saas/roster-seat-limit.ts`
- Relevant edit-chrome shell/header controls.

### API Shape

Suggested contract:

```ts
export type BuilderPlan = "free" | "studio" | "agency" | "network";

export type BuilderCapabilityKey =
  | "builder.page.create"
  | "builder.page.multi"
  | "builder.template.choose"
  | "builder.section.body.edit"
  | "builder.shell.header.edit"
  | "builder.shell.footer.edit"
  | "builder.directory.style.edit"
  | "builder.profile.style.edit"
  | "builder.block.reusable"
  | "builder.domain.subdomain"
  | "builder.domain.custom"
  | "builder.ai.patch";

export function normalizeBuilderPlan(value: string | null): BuilderPlan;
export function getBuilderPlanPolicy(plan: string | null): BuilderPlanPolicy;
export function builderPlanAllows(plan: string | null, key: BuilderCapabilityKey): boolean;
```

Policy should include numeric limits:

```ts
{
  maxPublicPages: number | null;
  maxVisibleRosterProfiles: number | null;
  allowedStarterSlugs: string[] | "all";
  allowedSectionKinds: string[] | "all";
  shellEditMode: "locked" | "basic" | "full";
}
```

### Tests

Add tests for:

- Free has one page, five visible profiles, shell locked.
- Studio allows subdomain but not custom domain.
- Agency allows custom domain and shell full edit.
- Network has unlimited/shared behavior.
- Unknown/null plan normalizes conservatively.

### Exit Gate

- The capability matrix exists and is covered by tests.
- At least two existing scattered checks use it.
- No behavior regression on Free starter access or roster cap.

## Phase 2 - Free Product Journey + Body-Only Builder Guardrails

### Goal

Make the Free journey reliable:

Signup/workspace owner can create, invite, or connect up to five people, then
publish a one-page body-editable site connected to those real roster profiles.

This phase does not need the full component tree yet. It makes the current
builder behave like the intended Free product.

### Product Rules

Free users can edit:

- Hero/body copy.
- Body section order.
- CTA copy/link.
- Featured roster source.
- Body section visibility.

Free users cannot edit:

- Header layout/style.
- Footer layout/style.
- Directory card family.
- Profile layout family.
- Multi-page structure.
- Reusable blocks.

### Likely Files

Roster/admin:

- `web/src/app/(workspace)/[tenantSlug]/admin/roster/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/RosterClientShell.tsx`
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/new/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/new/actions.ts`
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/new/NewRosterTalentForm.tsx`
- `web/src/lib/saas/roster-seat-limit.ts`

Builder/edit chrome:

- `web/src/components/edit-chrome/edit-shell.tsx`
- `web/src/components/edit-chrome/navigator-panel.tsx`
- `web/src/components/edit-chrome/inspector-dock.tsx`
- `web/src/components/edit-chrome/inspectors/site-header/*`
- `web/src/lib/site-admin/edit-mode/publish-preflight-action.ts`
- `web/src/lib/site-admin/sections/featured_talent/*`

### Implementation Tasks

1. Show Free roster count clearly:

   - `0/5 people used`
   - `5/5 people used`
   - upgrade prompt on the sixth attempt.

2. Make create-profile path explain visibility:

   - Draft profile can exist in roster.
   - Public page only shows approved/public/site-visible or featured profiles.
   - Provide a clear admin path to make a profile storefront-ready.

3. Ensure Free template profile block has a useful empty state:

   - Not "broken."
   - Tell owner to add or publish people.
   - Link to roster add path.

4. Lock shell controls on Free:

   - Hide or disable header/footer style inspector.
   - Keep global site shell from being accidentally edited on Free.
   - Allow body sections to remain editable.

5. Add publish preflight:

   - If a visible `featured_talent` section exists and source resolves to zero
     cards, show actionable warning.
   - If CTA has no valid inquiry/contact path, block publish.

### Tests

Add or update tests for:

- Sixth roster profile blocked on Free.
- Free plan shell edit capability false.
- Free body section edit capability true.
- Publish preflight flags empty featured roster when section promises profiles.

### Browser QA

Run locally:

1. Login as admin.
2. Open `/freeflow-760905`.
3. Open edit mode.
4. Confirm body sections editable.
5. Confirm header/footer controls locked or hidden for Free.
6. Publish.
7. Public page shows real roster profiles when visible profiles exist.
8. Public page shows actionable empty state when none exist.

### Exit Gate

- Free can publish one body-editable page connected to real roster data.
- Free cannot access full shell/site-style controls.
- Roster cap is visible and enforced.

## Phase 3 - Builder Ownership + Snapshot Consistency

### Goal

Make it clear which public pages are builder-owned and ensure builder-owned
pages publish through snapshots consistently.

This phase prevents the product from saying "page builder" while some pages are
silently legacy-rendered.

### Ownership Categories

Builder-owned:

- Tenant homepage.
- Tenant standard CMS pages.
- Future landing pages.

Non-builder public surfaces:

- Directory.
- Talent profile pages.
- Login/auth.
- Inquiry/workspace flows.

Hybrid/data-rendered surfaces:

- Directory and profile style can be token/template-controlled, but their core
  renderer is not a free-form page body.

### Likely Files

- `web/src/lib/site-admin/server/homepage-reads.ts`
- `web/src/lib/site-admin/server/page-reads.ts`
- `web/src/lib/site-admin/server/shell-reads.ts`
- `web/src/lib/site-admin/edit-mode/page-composer-action.ts`
- `web/src/lib/site-admin/edit-mode/composition-actions.ts`
- `web/src/components/edit-chrome/edit-chrome-mount.tsx`
- `web/src/components/edit-chrome/edit-path.ts`
- `web/src/app/(site)` or tenant storefront route files found by `rg`.
- `docs/saas/page-builder-package-audit-2026-05-06.md`

### Implementation Tasks

1. Add an explicit public-surface ownership helper:

```ts
type PublicSurfaceOwnership =
  | { kind: "builder_page"; pageSlug: string | null }
  | { kind: "site_shell" }
  | { kind: "directory" }
  | { kind: "profile" }
  | { kind: "platform_route" };
```

2. Use it in edit chrome routing so the builder does not mount on surfaces that
   should not be page-body edited.

3. Audit homepage and standard page reads:

   - Builder-owned pages should prefer published snapshots.
   - Legacy fallback should be documented, intentional, and scheduled for
     removal.

4. Add a small migration/backfill plan or script outline for pages missing
   snapshots.

5. Update docs with the current truth.

### Tests

Add tests for:

- Path-based Free homepage resolves as builder page.
- `/freeflow-760905/directory` is directory, not builder page.
- `/freeflow-760905/t/TAL-...` is profile, not builder page.
- `/freeflow-760905/p/about` is builder page slug `about`.
- Localized variants resolve correctly.

### Browser QA

Run locally:

1. Homepage edit opens builder.
2. Directory does not open body builder.
3. Profile page does not open body builder.
4. Standard page opens builder when it has a CMS page.
5. Publish homepage and standard page, then verify public SSR contains snapshot
   content.

### Exit Gate

- Public surface ownership is explicit.
- Builder does not mount ambiguously on non-builder surfaces.
- Snapshot rendering path is documented and tested.

## Phase 4 - BuilderNode Foundation

Do not start Phase 4 until Phases 1-3 are merged or at least locally stable.

Goal:

- Add the `BuilderNode` type and registry without replacing the current section
  renderer.

Deliverables:

- `BuilderNode` type.
- Component registry contract.
- Tree validation.
- Snapshot type extension.
- Current renderer bridge: validate/use `builderTree` when present, fall back
  to section slots, and expose stable node identity on existing section
  wrappers.

Exit gate:

- Existing section builder still works.
- No separate prototype route or duplicate builder surface is introduced.
- Current EditShell/Navigator/Inspector can read node identity from the live
  storefront DOM.

## Phase 5 - First Componentized Section

Goal:

- Convert one section to prove nested editing.

Recommended first section:

- Hero, because it has obvious slots: media, eyebrow, headline, copy, CTAs.

Deliverables:

- Hero represented as a section node with child component slots.
- Inspector can select/edit child heading/copy/button nodes.
- Padding/gap/width responsive controls for hero.
- Publish snapshot preserves child edits.

Exit gate:

- User can edit a child component inside Hero and publish it without breaking
  legacy sections.

## Marathon Batch Recommendation

For the first no-stop implementation marathon, do:

1. Phase 1
2. Phase 2
3. Phase 3

Do not include Phase 4/5 in the first marathon unless Phase 1-3 finish cleanly
and there is still time. Phase 4 starts the deeper engine and should not be
mixed with unresolved Free/package/page-ownership bugs.

## Verification Checklist For Marathon Batch

Required:

- Focused tests for new package matrix.
- Focused tests for path/surface ownership.
- `npm run typecheck`
- `npm run test:tenant-isolation`
- Focused lint on touched files.
- Browser QA on localhost.

Best effort:

- `npm run lint`
- `npm run ci`

If repo-wide lint fails on unrelated legacy/prototype files, record the first
unrelated blockers and continue to focused verification for touched files.

## Final Report Format

At the end of the marathon, report:

- Phases completed.
- Files changed.
- Behavior changed.
- Browser QA results.
- Tests run.
- Remaining blockers.
- Next recommended phase.

Keep the report factual. No marketing copy.
