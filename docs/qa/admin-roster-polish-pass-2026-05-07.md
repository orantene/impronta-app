# Admin Roster Polish Pass — 2026-05-07

QA findings from `admin-roster-deep-qa-2026-05-07.md` addressed in this pass.
Branch: `claude/zealous-khayyam-f78651`

---

## Fixes shipped

### G1 — Add talent: stale roster counter after save
**File:** `_actions.ts`

`addTalentToRoster` was calling `revalidatePath` on specific page paths instead of the layout root. Switched to `revalidatePath("/", "layout")` so `router.refresh()` on the client picks up the updated top-bar counter (N talent · M open inquiries) immediately after save.

### G4 — QuickAdd: Save button active before minimum fields filled
**File:** `_drawers.tsx` (`NewTalentDrawer`)

`PrimaryButton` was always enabled. Now computed `minimumValid = !!primaryType && homeBase.trim().length > 0` and:
- Wrapped button in a `<span>` with tooltip text when disabled
- Added `disabled={!minimumValid}` to the button
- Added an inline hint block below the action row that explains exactly which field(s) are missing

### G5 — QuickAdd: No visible confirmation of selected talent type
**File:** `_drawers.tsx` (`NewTalentDrawer`)

Added a sticky confirmation pill above the type grid that appears as soon as a type is selected. Shows `ChildLabel under ParentLabel` with a green checkmark and a × clear button. Disappears when selection is cleared.

### G6 — Roster cards: All talent show as "Draft"
**File:** `_data-bridge.ts` (`deriveProfileState`)

`deriveProfileState` checked `profileWorkflow === "published"` but the DB enum is `profile_workflow_status` with values `draft, submitted, under_review, approved, hidden, archived` — no `"published"` value. Fixed to also match `"approved"`:
```ts
if (rosterStatus === "active" && (profileWorkflow === "approved" || profileWorkflow === "published")) {
  return "published";
}
```
This caused ~23 of 27 roster talent to show as Draft instead of Published.

### G7 — Roster cards: "No type set" for all talent despite types in DB
**File:** `_data-bridge.ts` + `_pages.tsx`

Two-part issue:
1. The Supabase query wasn't fetching `name_en` from `taxonomy_terms`, so fallback text was always null
2. Local `TAXONOMY` fixture IDs (`"fashion"`, `"commercial"`) don't match DB slugs (`"runway-model"`, `"commercial-model"`)

Fix: added `name_en` to the query; `derivePrimaryType` now returns `slug ?? name_en` so the raw DB name_en surfaces as the label. Card render updated to show `profile.primaryType` as fallback when `TAXONOMY` lookup fails, instead of hardcoded "No type set".

### G8 — Roster cards: Portrait photos not preferred
**File:** `_data-bridge.ts` (`pickPrimaryThumb`)

Added `width, height` to the `media_assets` select. `pickPrimaryThumb` now applies a three-key sort: variant rank → orientation rank (portrait-first: `h >= w`) → sort_order. Previously only sorted by variant then sort_order, which could surface landscape crops before portraits.

### G9 — Roster: Two separate unread-count badges on pending row
**File:** `_pages.tsx`

Pending row showed an amber "N pending" badge AND an indigo "N verifications" badge independently. Consolidated into a single amber badge with combined count. Tooltip now reads `"N pending approvals (M verification requests)"` when there are both, or just the count when only one type.

### G11 — Roster: Pending banner shows mock count (3) not real DB count
**File:** `_pages.tsx` (`WorkspaceTopbar`, `TalentPage`)

`pendingTalent.length` was 3 (from the `PENDING_TALENT` mock). Wired both the nav badge and the pending-count display to `overviewMetrics.pendingApprovals` when `overviewMetrics` is available, falling back to mock length only when the real data hasn't loaded. DB confirmed 0 real pending approvals.

### G12 — Roster cards: Acting disciplines label truncates too early
**File:** `_pages.tsx`

`maxWidth` on the acting-label container changed from `180` → `220`. Gives longer discipline names room to display without truncation.

### G13 — DB: Stale "removed" roster entry still visible
**DB fix (direct SQL)**

One talent profile (`1b819f7e-3be6-440f-b610-bede85a31661`) had `status = 'active'` in `agency_talent_roster` despite being removed from the roster. Updated via Management API:
```sql
UPDATE agency_talent_roster SET status='removed', removed_at=now()
WHERE talent_profile_id='1b819f7e-3be6-440f-b610-bede85a31661'
```
Confirmed: `status = 'removed'`, `removed_at = '2026-05-07 21:18:53.775142+00'`.

---

## Findings deferred / not in scope

- **G2, G3, G10** — not included in this pass scope
- **TAXONOMY fixture vs DB slug mismatch** — not fully resolved. G7 fix surfaces `name_en` as display but the TAXONOMY fixture remains misaligned with DB slugs. A follow-up should either sync the fixture slugs or replace the fixture lookup with DB-driven labels.

---

## Verification

- All DB reads confirmed via Supabase Management API queries
- Typecheck: pre-existing dependency errors (missing node_modules in worktree) — no new errors from this pass
- Untracked imports check: clean (`[check-untracked-imports] No untracked TS files under web/src — clean.`)
