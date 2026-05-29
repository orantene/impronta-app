# Phase 0 QA Report — `dde6cefc7` (fix/profile-shell-stale-details)

**Date:** 2026-05-26  
**QA Branch:** `fix/profile-shell-stale-details`  
**Commit under test:** `dde6cefc7`  
**Merge worktree:** `/Users/oranpersonal/Desktop/impronta-profile-qa/`  
**QA server:** `http://localhost:3025` (via "Profile-Fix QA (3025)" launch config)

---

## Fix Summary

Single `useEffect` change in `TalentProfileShellDrawer.tsx`:

```diff
-    if (profileFieldNavGroups.length === 0) {
+    if (profileFieldNavGroups.length === 0 || selectedTalentTypeSlugs.length === 0) {
       if (activeProfileFieldGroupKey !== null) setActiveProfileFieldGroupKey(null);
       return;
     }
-  }, [profileFieldNavGroups, activeProfileFieldGroupKey]);
+  }, [profileFieldNavGroups, activeProfileFieldGroupKey, selectedTalentTypeSlugs]);
```

**Regression fixed:** Removing the last service from a talent left `activeProfileFieldGroupKey` non-null for one render, causing Details to flash "No extra fields are configured for this type." instead of "Select a talent type in Services to see relevant fields."

---

## Gate Results

### TS Typecheck
- Command: `NODE_OPTIONS=--max-old-space-size=8192 ./node_modules/.bin/tsc --noEmit`
- Result: **PASS** — 0 source-file errors
- Note: 8 errors in `.next/dev/types/routes.d.ts` only — this is a Turbopack dev-server artifact (the file was mid-write when tsc ran). The file is in the tsconfig `exclude` list. Not a real type error.

### ESLint
- Command: `node -r ./scripts/eslint-node-polyfill.cjs ./node_modules/eslint/bin/eslint.js . --quiet --suppressions-location eslint-suppressions.json`
- Result: **PASS** — exit 0, no output

### Pinned Tests (23 total, via `tsx --test`)
- `src/lib/saas/admin-scope.security.test.ts` — **20/20 pass**
- `src/components/admin/shell/internal/drawers/profile-shell/profile-shell-services-details-nav.test.ts` — **3/3 pass**
- Total: **23/23 pass**, exit 0

---

## Browser QA Scenarios

### (a) Popi (TAL-00039) — Admin roster, existing talent with services — PASS

- Opened: `http://localhost:3025/impronta/admin/roster?mode=workspace`
- Signed in as: `orantene@gmail.com` (super_admin)
- Opened profile drawer for Popi (TAL-00039)
- **Services section:**
  - PRIMARY: Music & DJs (Open Format DJ — FEATURED)
  - SECONDARY 1: Performers (Dancer)
- **Left nav sub-items under Services (live engine):**
  - Music details, Performer details, Singer details (dynamic field groups rendered correctly)
- **No "Skills & strengths" duplicate**
- **No stale Details flash**
- Result: PASS

### (b) Local QA (TAL-92023) — Zero-service talent — PASS

- Opened profile drawer for Local QA (TAL-92023)
- **Services section:** PRIMARY CATEGORY "Not set" · 0 skills
- **No sub-items in left nav** under Services
- **No Skills & strengths**
- Details nav present; content shows "Select a talent type in Services to see relevant fields."
- Result: PASS

### (c) Add + Remove Fashion Model (TAL-92023) — REGRESSION TEST — PASS

This is the core regression test for `dde6cefc7`.

**Step 1 — Add Fashion Model:**
- Clicked "+ Add skill in this category" → opened skill picker
- Selected category: Models → searched "Fashion" → checked "Fashion Model"
- Clicked "Add 1 skill" → confirmed

**Step 2 — Details shows model fields:**
- Navigated to Details tab in horizontal nav
- Content: "Physical / Casting" section, 22 casting fields
  - Allergies/dietary, Body type, Bust, Dress size, Eye color, etc.
- "Fill 6 required" badge visible
- Result: Details correctly reflected the Fashion Model service ✓

**Step 3 — Remove Fashion Model:**
- Navigated back to Services tab
- Clicked the red X on "Fashion Model FEATURED"
- Services reverted to: PRIMARY CATEGORY "Not set" · 0 skills

**Step 4 — Details shows correct empty state (no flash):**
- Immediately navigated to Details tab
- Content: **"Select a talent type in Services to see relevant fields."**
- No "No extra fields are configured for this type." text
- No stale Physical/Casting fields
- Result: **PASS — regression fixed ✓**

### (d) Talent self-edit — qa-talent-dashboard-audit — PASS

- Signed in as: `qa-talent-dashboard-audit@impronta.test` / `Impronta-QA-Talent-2026!`
- Navigated to: `http://localhost:3025/talent/profile` → clicked "Edit profile"
- **Checks:**
  - No "Booked as" text: ✓
  - No static category picker: ✓
  - No "No active tenant for this request" error: ✓
  - Live engine shows primary/secondary skills:
    - PRIMARY: Photo, Video & Creative → Event Photographer (FEATURED, Intermediate)
    - SECONDARY: Wellness & Beauty → Makeup Artist (Intermediate)
    - Services sub-nav: Equipment (5/5), Operational (4/4), Photo/Vide (3/3), Physical (20/22), Wellness det (3/4)
  - 2 of 9 skills used — counter live ✓
- Result: PASS

### (e) Public directory + profile smoke — PASS

- Navigated to: `http://localhost:3025/impronta/directory`
- **Directory page:** 24 talent profiles, card grid with photos, skill-type filter chips (Lifestyle Model · 5, Art Model · 4, Commercial...), availability dates
- No admin-only fields visible in directory cards
- Clicked card for Anto (TAL-00036): `http://localhost:3025/impronta/t/TAL-00036`
- **Public profile visible fields:**
  - Role label: "COMMERCIAL MODEL"
  - Name, languages
  - Inquiry CTAs, Save to My List, Contact About Talent
  - Portfolio photos
  - DETAILS section: Bio (per locale), Content Rights, UGC Content, Body type, Bust, Hair Length, Height (CM/ft), Hips, Inseam, Piercings, Shoe Size (EU/UK) — all appropriate public casting fields
- **No admin-only fields visible:** no internal IDs, no draft status, no rate cards, no disabled taxonomy entries, no admin settings
- Result: PASS

---

## Summary

| Gate | Result |
|------|--------|
| TS typecheck (src files) | PASS |
| ESLint | PASS |
| admin-scope.security.test (20 tests) | PASS |
| profile-shell-services-details-nav.test (3 tests) | PASS |
| (a) Popi — existing services render | PASS |
| (b) TAL-92023 — zero-service state | PASS |
| (c) Add Fashion Model → Details → Remove → Details | **PASS (regression fixed)** |
| (d) Talent self-edit — no Booked-as / live engine | PASS |
| (e) Public directory + profile — no admin fields | PASS |

**All gates green. `dde6cefc7` is ready to merge to `main`.**

---

## Constraints Honored

- Did NOT push to origin
- Did NOT promote / deploy to Vercel
- Did NOT touch dirty files from other agents (docs/decision-log.md, qa-evidence/admin-financials-qa-20260526/, apply-flow files)
- Did NOT force-push anything
- Used isolated worktree at `/Users/oranpersonal/Desktop/impronta-profile-qa/` — never `git switch` in the shared checkout
