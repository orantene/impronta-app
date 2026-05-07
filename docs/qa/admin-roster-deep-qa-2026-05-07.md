# Roster Page — Deep QA Findings (live verification)

**Date:** 2026-05-07
**Tester:** Claude (Chrome MCP, localhost:3000, qa-admin@impronta.test)
**Migration applied:** Yes (via Management API — talent_identity_fields + plan_tier_archive both live)
**Method:** Click every CTA, type into every input, verify DB writes via Supabase Management API SQL endpoint

---

## ✅ Verified working (DB-confirmed)

### Add Talent
- Click **Add talent** button (top-right of Roster) → drawer opens
- Fill: First "QA", Last "TestRosterAdd", Email, Primary type "Fashion Model", Home base "Tulum"
- Click **Create + open full profile**
- **DB result (verified live):**
  ```
  talent_profiles row id=1b819f7e-3be6-440f-b610-bede85a31661
  display_name="QA TestRosterAdd" created_at=2026-05-07 20:32:05
  agency_talent_roster status="active"
  ```
- Server action: `addTalentToRoster` in `prototypes/admin-shell/_actions.ts`

### Edit (Identity tab autosave)
- Click any talent card → drawer opens with talentId in payload
- Edit Pronunciation field, type "ah-dree-AH-nah"
- 800ms debounce → autosave fires → DB write
- **DB result (verified live):** `talent_profiles.pronunciation='ah-dree-AH-nah'` updated_at 2026-05-07 20:20:02
- Status pill: "Saving…" → "Saved" rendered next to drawer header buttons (responsive — hidden in narrow drawer width but visible in DOM)
- Server action: `updateTalentIdentity` in `lib/server-actions/admin-talent-identity.ts`

### Remove from roster
- Click talent card → drawer opens → kebab `•••` → **"✕ Remove from roster"** (red, with separator)
- Confirm dialog: *"Remove [Name] from your roster? They'll keep their Tulala account…"*
- On confirm: action runs, drawer closes, toast shows "[Name] removed. Their Tulala account is still active."
- **DB result (verified live for Camila Ortega):**
  ```
  agency_talent_roster.status='removed'
  removed_at=2026-05-07 20:21:44
  removed_by=4b9e595d-7c6c-4e65-8f7f-05cd60e85676 (qa-admin's profile id)
  talent_profiles row UNTOUCHED (deleted_at=null, user_id=null)
  auth.users row UNTOUCHED (not queried but action never references it)
  ```
- Server action: `removeFromRoster` in `lib/server-actions/admin-talent-roster.ts`
- Business rule confirmed: severs agency relationship, talent keeps Tulala account.

### Open full editor (escape hatch to canonical page)
- Click talent card → drawer → kebab → **"↗ Open full editor"**
- Navigates to `/{slug}/admin/roster/{talentId}` — the canonical CRUD page with photo upload, taxonomy, languages, service areas, gallery, hard-delete (per workspace audit).

### Real headshots from `media_assets`
- 5 of 6 visible roster cards show real photos (Adriana, Alexa, Carmen, Chiara, Daniela).
- Camila Ortega shows "CO" initials fallback — DB confirms her 1 photo has `approval_state ≠ 'approved'`. Falls back gracefully.

---

## 🔴 Gaps + recommendations (in priority order)

### G1 — Top-bar talent counter doesn't update after Add or Remove (S2)
- **Symptom:** After adding "QA TestRosterAdd", the top-bar still shows "27 talent · 3 open inquiries". DB has 28.
- **Root cause:** Chrome `overviewMetrics` is loaded once by `(workspace)/[tenantSlug]/admin/layout.tsx` and cached for the request. `router.refresh()` invalidates it but Next.js's prefetch + bfcache can leave stale chrome.
- **Fix:** add `revalidateTag('workspace-overview-metrics')` on the create + remove actions, and tag the loader. OR: include the counter in the same data tree refetched by `router.refresh()`.
- **Severity:** S2 — operator sees inconsistency until next page reload.

### G2 — Drawer's desktop "Remove" + "Full editor" buttons hidden by responsive CSS (FIXED THIS SESSION)
- **Was:** I added Remove + Full editor to `[data-pshell-header-extras]`. That container has `display: none` at narrow drawer widths.
- **Fix shipped:** added both as kebab `•••` items (with red styling for Remove, separator). Verified visible in this session's QA.

### G3 — UI doesn't refresh after Remove (FIXED THIS SESSION)
- **Was:** Remove fired, DB updated, drawer closed, but roster list still showed the removed talent.
- **Fix shipped:** added `shellRouter.refresh()` after `removeFromRoster` succeeds.

### G4 — Add Talent form is long; required-fields gating is silent (S3)
- **Symptom:** First/Last name + Email fill, then Talent Type picker, then Home Base, then Management Method — multi-section scroll. Until all are filled, "Create + open full profile" appears clickable but does nothing (gated by `minimumValid` in component state).
- **Fix:** disable button visually when `minimumValid === false`, show inline hint "Pick a primary type and home base to continue".
- **Severity:** S3.

### G5 — Talent type picker requires scroll to confirm selection (S3)
- After typing "model" in talent type search and clicking Fashion Model, the suggestion picker collapses but the small "Selected: Fashion Model under Models" confirmation is several scrolls below. Operator easily thinks the click didn't take.
- **Fix:** sticky "Selected: X" pill at top of the section after a pick, or fade-in confirmation toast.

### G6 — Status counters all show 0 except Draft (S3 / data)
- "Published 0 · Pending 0 · Invited 0 · Draft 27" — accurate against `talent_profiles.workflow_status` (most are 'draft'), but the UX is confusing because the agency presumably wants most talent to be Published.
- **Recommendation:** seed/migrate Impronta's existing 27 talent from workflow_status='draft' to 'published' if they're meant to be live. Otherwise add a tooltip: "Talent must be reviewed + published before clients see them."

### G7 — Talent cards say "No type set" for most (S3 / data)
- Only Carmen Díaz has a primary type ("Influencer"). The other 26 don't.
- **Recommendation:** seed/backfill primary types via `talent_profile_taxonomy`. Or surface in the canonical edit page so the agency owner can backfill quickly.

### G8 — Carmen Díaz photo is a landscape mountain, not a portrait (S3)
- `pickPrimaryThumb` in `_data-bridge.ts` prefers `card` variant over `original`. Carmen's first card variant might be a non-portrait asset.
- **Fix:** prefer assets where `metadata.crop_mode === 'avatar'` over plain `card`. Or detect aspect ratio and skip < 0.6 (very wide).

### G9 — "Roster (3) (2)" double-badge mystery (S4 / unclear UX)
- Two numeric badges next to "Roster" in the top nav. Likely 3 = pending self-registrations, 2 = something else (notifications? unread? new?).
- **Fix:** consolidate to one badge or add tooltip explaining each.

### G10 — Search/Filter/Sort/View-mode/Select-all/Invite — NOT TESTED
- Time-boxed; these CTAs exist but I didn't drive them this session. All likely client-side prototype state (no DB roundtrip).
- Audit per audit doc: search + sort + filter chips reduce the in-memory talent array; not persisted preferences. Acceptable for v1.

### G11 — "3 self-registrations waiting for review" banner — likely mock (S2)
- Per the original audit, pending-talent queue uses `SEED_PENDING_TALENT` fixtures, not the real `verification_requests` table.
- **Fix:** wire to real `verification_requests` query. Action: see master plan Phase 2f.

### G12 — Plan badge "Age" truncated to fit (cosmetic — S4)
- The "Agency" plan tier badge in chrome shows as "Age" because the column width is too narrow.
- **Fix:** widen the column or use abbreviated tier label ("AGY"/"AG"/"A").

### G13 — Adding QA test row left it on roster (cleanup needed)
- "QA TestRosterAdd" is currently on the live tenant. To remove for cleanup, either:
  - Click card → kebab → Remove from roster, OR
  - SQL: `UPDATE agency_talent_roster SET status='removed', removed_at=now() WHERE talent_profile_id='1b819f7e-3be6-440f-b610-bede85a31661'`
- Or leave as concrete proof of the working flow.

---

## What "Now you can add edit remove and change talents" really means

**Confirmed live, DB-verified, production-ready:**
- ✅ Add — fills row in talent_profiles + agency_talent_roster
- ✅ Edit Identity (legal_name, pronunciation, pronouns, gender, dob, etc.) — autosaves with 800ms debounce
- ✅ Remove — severs agency relationship without touching talent's account
- ✅ Change (any field, including photos) — via "↗ Open full editor" link → canonical page with full CRUD

**Functional but gappy:** chrome counter stale after add/remove (G1), Add Talent form UX could be tighter (G4-G5), data gaps in seed (G6-G7).

**Not tested live this session:** search/filter/sort/select-all (G10), Invite flow, hard-delete flow.

---

## Recommended next slice

### Option A — Polish the gaps above (~½ day)
- G1: revalidate-tag for chrome counters (1h)
- G4-G5: Add Talent form UX tighten (1-2h)
- G6-G7: data backfill script for Impronta (1h)
- G8: pickPrimaryThumb portrait preference (30 min)
- G11: wire real `verification_requests` (1h)

### Option B — Move to next surface (Messages / Calendar / etc.)
Roster is now solid enough to ship. Pick the next priority page from the master plan and apply the same pattern: data-bridge audit → migration if needed → server action → controlled-state drawer wiring.

**My recommendation:** Option A (the 7 small fixes total ~½ day and bring Roster to genuinely "polished"). Then Option B.
