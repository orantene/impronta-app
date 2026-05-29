# Workspace × Talent Hybrid Flow — QA Pass (F26)

**Date:** 2026-05-28
**Scope:** Phase F / F26 — "workspace owner wants to take bookings themselves" hybrid flow.
**Method:** Static / data-layer QA (code + schema read-through). A live browser
confirmation is listed as the remaining step under *Follow-ups*.

## The flow under test

1. Workspace admin opens **Settings → Account** accordion.
2. When the admin has **no** talent profile in this workspace
   (`bridgeTalentSelfProfile === null && isAdmin && tenantSlug`), a CTA row
   appears: **"Want to take bookings yourself? — Create your talent page —
   becomes visible on your workspace roster"** with a **"Create"** affordance.
   - `web/src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx:283-295`
3. Clicking opens `CreateMyTalentProfileDialog`
   (`web/src/components/talent/create-my-talent-profile-dialog.tsx`).
4. Submitting calls server action `provisionTalentProfileSelf`
   (`web/src/lib/server-actions/talent-self-provision.ts`).
5. On success the dialog routes to `/<tenantSlug>/talent` (the talent dashboard
   within the same workspace — the hybrid "talent mode" surface).

## Acceptance criteria — results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Created with the workspace owner as the linked profile | ✅ PASS | `talent_profiles.user_id = userId` (the calling admin) — `talent-self-provision.ts:177`. Self-edit gate (`talent.profile.edit_self`) keys off this. |
| 2 | Appears in the workspace's own `/[tenant]/admin/roster` | ✅ PASS | Action inserts an `agency_talent_roster` row with `tenant_id = tenantId` (`:196`). The roster page query filters `agency_talent_roster.eq("tenant_id", tenantId).neq("status","removed")` (`web/src/app/(workspace)/[tenantSlug]/_data-bridge/roster.ts:200-206`). Profile shows as `draft`/`claimed` (has `user_id`). |
| 3 | Has the workspace's tenant_id on the `talent_profiles` row | ⚠️ N/A — see note | `talent_profiles` has **no `tenant_id` column** (init schema `20250409000000_init.sql`; never added). Tenant scoping is **by design** via `agency_talent_roster.tenant_id`, which IS set correctly. So the literal criterion is unsatisfiable, but the intent (profile scoped to this workspace) is met. |
| 4 | Does NOT toggle the owner's account type into a client/talent hybrid | ✅ PASS | The action writes only to `talent_profiles` + `agency_talent_roster`. No mutation of `app_role`, `account_type`, or the `profiles` row. Conforms to `feedback_client_is_client_no_hybrid.md` and the talent-side hybrid design in `project_workspace_talent_hybrid.md`. |

**Verdict:** Flow behaves as designed. 3 of 4 criteria pass outright; criterion 3
is based on a schema assumption that does not match the codebase (no
`tenant_id` on `talent_profiles`) — the correct tenant linkage exists on the
roster row.

## Notable correctness details (good)

- **Idempotent:** `findExistingTalentProfile` short-circuits and returns the
  existing `profile_code`/id if the user already has a profile, so re-clicking
  Create can't create duplicates (`:152-155`).
- **Seat-limit aware:** `checkRosterSeatAvailability` runs before insert
  (`:158-161`).
- **Orphan rollback:** if the roster insert fails, the just-created
  `talent_profiles` row is deleted (`:206-211`) — no dangling profile.
- **Auth + capability gated:** signed-in + `agency.roster.edit` on the tenant
  (`:119`, `:132`).
- **All async states visible:** dialog shows submitting / persistent error per
  `feedback_admin_edit_ux.md`.
- **Starts hidden/draft:** `workflow_status="draft"`, `visibility="hidden"` —
  not auto-published to the public roster.

## Follow-ups (out of scope for F26 — do not action here)

1. **`origin_workspace_id` not populated.** Migration
   `20260928000000_user_origin_denorm.sql` added `origin_kind`,
   `origin_workspace_id`, `origin_created_by_user_id` to `talent_profiles` for
   provenance. The self-provision insert does **not** set them, so a
   self-created hybrid profile has `origin_workspace_id = NULL`. Provenance is
   still recoverable from `agency_talent_roster.source_workspace_id`
   (set to `tenantId` at `:197`), so this is a denorm gap, not a functional
   break. Suggested fix: set `origin_kind`, `origin_workspace_id = tenantId`,
   `origin_created_by_user_id = userId` on the `talent_profiles` insert to match
   the admin-created roster path.
2. **Live browser confirmation pending.** This pass is static. Recommended live
   check: sign in as a workspace owner with no talent profile, click Create,
   confirm (a) the new profile appears on `/<tenant>/admin/roster`, (b) landing
   on `/<tenant>/talent` works, (c) the owner's account chrome still shows them
   as workspace admin (no client/talent identity flip).
