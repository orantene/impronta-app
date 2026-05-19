# Phase 0A — Talent profile drawers: trust correction (2026-05-19)

**Scope:** user-trust fix only. No feature wiring, no UI redesign, no second write path, no drawer removal.

## Root cause

Six standalone "drawer" components in `src/components/admin/shell/internal/talent-drawers.tsx` were prototype scaffolds that rendered hardcoded `MY_TALENT_PROFILE` fixture data **as if it were the signed-in talent's own**, with a disabled or absent Save. They are **stale duplicates**: the real, DB-backed editor for every one of these domains is `TalentProfileShellDrawer` (`drawers.tsx:5300`), opened via drawerId `talent-profile-shell` / `talent-profile-edit` (admin roster + talent self-surface, same component). The live talent self-surface already routes all real editing there (`talent.tsx:824` `openSection`).

## Source-of-truth map (verified by 3 independent code traces)

| Domain | Real editor (canonical) | Real persistence action | DB destination |
|---|---|---|---|
| Measurements | Shell → physical/profile fields | `updateSelfProfileShellDynFields` / `commitTalentProfileShellAdmin` | `field_values` (+ `field_definitions`) |
| Skills | Shell → `SkillSlotPanel` (real tenants only; prototype falls back to non-persisted `SkillsProEditor`) | `setTalentProfileSkills` / `addSkill` (immediate) | `talent_profile_taxonomy` |
| Portfolio | Shell gallery + real `TalentPhotoEditDrawer` | `actionUploadAndAssignMedia` / `registerPortfolioPhoto`; albums `updateSelfMediaAlbums` | `media_assets`; `talent_profiles.media_albums_data` |
| Polaroids | Shell → Polaroids → `PolaroidsEditor` | `actionUploadAndAssignMedia` kind=`polaroid` (immediate) | `media_assets` |
| Profile sections | Shell typed accordion sections | `updateSelfAbout` / `updateSelfIdentity` / … or `commitTalentProfileShellAdmin` | `talent_profiles` columns |
| Documents | Shell → Documents/Files | `updateSelfTalentDocuments` (metadata) + `actionUploadTalentDocument` (file) | `talent_profiles.documents_data` (+ private bucket) |

Client/public surfaces read real DB only and never import these mocks — unaffected.

## What Phase 0A changed (3 files)

1. **Neutralized all 6 mock bodies** (`talent-drawers.tsx`): `TalentProfileSectionDrawer`, `TalentPortfolioDrawer`, `TalentPolaroidsDrawer`, `TalentSkillsDrawer`, `TalentMeasurementsDrawer`, `TalentDocumentsDrawer`. Each keeps its export, signature, `open`/`closeDrawer`, and `DrawerShell` wrapper. Body replaced with a shared `ProfileSectionNotConnected` notice; description made honest; footer = Close only (no fake/disabled Save). All `MY_TALENT_PROFILE.*` and `POLAROID_SET` references deleted (import dropped) — fixture display is now structurally impossible.
2. **Repointed the only live entry points** to the real editor (canonical call, matches the sibling "Edit profile" convention already in those files):
   - `admin-shell-client.tsx:559` cmd-palette "Add polaroids" → `openDrawer("talent-profile-edit", { mode:"edit-self", section:"polaroids" })`
   - `wave2.tsx:3780` onboarding-arc "photos" step → `openDrawer("talent-profile-edit", { mode:"edit-self", section:"media" })`
   - `wave2.tsx:4682` first-run banner step 2 cta → `"talent-profile-edit"`
   The other 4 drawerIds had **zero** live `openDrawer` callers (help-metadata only) — neutralized defensively, zero UX impact.

## Gate

`tsc --noEmit` + `eslint`, proven via stash diff: **before == after = 0 errors / 16 warnings** on the 3 files. Phase 0A introduces **zero** new errors or warnings. Pre-existing, NOT touched (branch governance): 4 `drawers.tsx` `ResolvedField` tsc errors + 16 `talent-drawers.tsx` unused-symbol warnings — present at base HEAD, unrelated to this change.

## Deferred — to ever build a real standalone drawer for these (Phase 1+)

Not required (the shell drawer is the canonical editor). If standalone editors are ever wanted, each must consume the canonical action above — never a second write path. Notably: a standalone Measurements editor must use the dynFields path (`updateSelfProfileShellDynFields`), **not** `saveTalentScalarFieldValues` (that is generic agency-defined scalar fields; there is no measurements field-catalog group). Skills standalone must respect the real-tenant-only `SkillSlotPanel` gating.
