# Lane B Visual QA — Public Profile Sidebar Migration
**Date:** 2026-05-27
**Branch:** feat/resolver-public-profile
**Dev server:** Lane B webpack server on port 3000, accessed via impronta.local proxy (port 3104)

## Profiles tested
- TAL-00036 (Anto — Commercial Model)
- TAL-00045 (More — Editorial Model)

## Results

### TAL-00036 (Anto)
- Page rendered: **200 OK** (11.1s compile + response)
- Sidebar sections visible: **Languages** (3 items: Spanish native, English fluent, Italian fluent)
- No fit_labels / skills / industries / event_types / tags sections rendered
  (expected — Anto has no taxonomy data for these)
- No admin-only or internal-only fields appeared
- Gender not set on this profile (N/A for R4 check)

### TAL-00045 (More/Tina)
- Page rendered: **200 OK** (6.1s)
- Sidebar sections: none (aside shows agency representation card + ref code only)
  (expected — no taxonomy data populated)
- No errors

## Gates
- typecheck: PASS (exit 0)
- lint: PASS (no output)
- Server errors: NONE

## Equivalence check
Legacy `isFieldVisible` logic (active + !archived_at + !internal_only + public_visible + profile_visible)
maps 1:1 to `isResolvedFieldVisibleInPublicProfileSidebar` step-guards for non-bridged keys:
  step 1: active + !archived_at ✓
  step 2: !internal_only ✓
  R1 AND: public_visible + profile_visible ✓
  _syntheticLegacyVisibility: re-confirms public_visible (already true from step above) ✓

## screenshot
Screenshot tool denied in preview. Textual accessibility snapshot confirms correct render.
TAL-00036 snapshot excerpt: "Languages" section with 4 items (Spanish/English/Italian + count).
