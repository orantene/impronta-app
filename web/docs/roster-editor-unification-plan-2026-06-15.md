# Roster Talent Editor Unification Plan

**Date:** 2026-06-15
**Workstream:** D1 — catalog audit follow-up
**Status:** Design only. No code, no migration, no DB writes. Read-only analysis.
**Author note:** Every claim below was verified against the source files and the live Supabase schema (`pluhdapdnuiulvxmyspd`). Anything I could not prove is flagged inline as **UNVERIFIED**.

---

## 0. TL;DR

The codebase has **two separate admin editors for the same talent**:

1. **The standalone full-page editor** — route `web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/`. ~20 hard-coded fields, a batch `<form action>` save to dedicated `talent_profiles` columns, plus self-contained section CRUD (taxonomy / languages / service areas / gallery).
2. **The catalog-driven drawer** — `TalentProfileShellDrawer` (`web/src/components/admin/shell/internal/drawers/profile-shell/`). The rich, multi-tab profile shell. Per-field autosave through the DB-driven field catalog (`talent_profile_field_values` + `profile_field_definitions`) **and** a comprehensive batched `commitTalentProfileShellAdmin` write to dedicated columns + JSONB blobs.

**They are wired to different entry points.** The roster list (`TalentPage-1.tsx`) opens the **drawer** for editing an existing talent. The **standalone route is NOT orphaned** — it is the **post-create landing page**: the New Talent drawer's "continue editing" and "publish" handoffs do `router.push('/${tenantSlug}/admin/roster/${talentProfileId}')` (`new-talent-drawer.tsx:325` and `:369`). So a brand-new talent, right after creation, is dropped into the *standalone* editor, while every subsequent edit from the roster list opens the *drawer*. That split is the core inconsistency: the same talent is edited by two different UIs depending on how you got there.

(No other navigational links to the route were found — only those two `router.push` calls and the route's own `revalidatePath` strings. So the entire reachable surface of the standalone editor is "the screen you land on immediately after creating a talent.")

**Recommendation: the drawer is canonical. Retire the standalone full-page editor over 4 phases**, after first salvaging the few capabilities the standalone has that the drawer arguably presents better (the standalone's height "canonical-first" reconciliation is already the safe pattern and should be confirmed present in the drawer's path before deletion).

The biggest *correctness* risk in keeping both alive is the **bio divergence** (§4.1): the standalone writes `short_bio` only, while the public profile prefers `bio_en`. Editing a bio in the standalone editor silently does nothing for any talent who already has `bio_en` set.

---

## 1. The two editors at a glance

| | **Standalone full-page editor** | **Catalog-driven drawer** |
|---|---|---|
| Entry route / component | `app/(workspace)/[tenantSlug]/admin/roster/[id]/page.tsx` → `TalentEditForm.tsx` + `EditorSections.tsx` | `components/.../profile-shell/TalentProfileShellDrawer.tsx` (drawer id `talent-profile-shell`, `mode="edit-admin"`) |
| How it opens | **Post-create landing page** — `router.push('/.../admin/roster/<id>')` from the New Talent drawer's "continue editing"/"publish" (`new-talent-drawer.tsx:325,369`). No other nav link. | `openDrawer("talent-profile-shell", { mode:"edit-admin", talentId })` from the roster list (`TalentPage-1.tsx:198`), skill discovery (`:310`), reviews card, light layouts, etc. |
| Save model | **Batch** — one `<form action={updateRosterTalentProfile}>` for scalars; sections (`EditorSections`) call discrete server actions on change | **Per-field autosave** to the catalog + a **batched** `commitTalentProfileShellAdmin` for the dedicated-column/blob slice |
| Scalar write target | Dedicated `talent_profiles` columns (`actions.ts`) | Dedicated `talent_profiles` columns + `talent_profile_field_values` mirror (`admin-talent-identity.ts`, `admin-talent-profile-sections.ts`) |
| Field source | **Hard-coded** TSX (`<select>`/`<input>` literals) | **DB-driven** (`profile_field_definitions`, 121 talents × 3,344 catalog value rows live) |
| Auth gate | `userHasCapability("agency.roster.edit")` + roster-membership check | `requireStaffTenantAction()` + roster check + **personal-profile lock** (talent-owned identity can't be overwritten unless exclusivity `confirmed`) |
| Field coverage | ~20 fields | Full profile (identity, physical, about/bios, rates, availability, credits, limits, social proof, albums, documents, dynamic per-type catalog fields, commercial terms, services menu, …) |
| i18n bios | **No** — only `short_bio` | **Yes** — `bio_en` / `bio_es` (+ draft/status) |
| Personal-profile safety floor | **No** | **Yes** (server-side lock in `commitTalentProfileShellAdmin` + `updateTalentIdentity`) |

---

## 2. Field-by-field coverage map

Legend: ✅ writes it · ⚠️ partial / different semantics · ❌ does not touch.

### 2.1 Identity / contact

| Field (DB) | Standalone | Drawer | Notes / divergence |
|---|---|---|---|
| `display_name` | ✅ `display_name` | ✅ `stage_name → display_name` | aligned |
| `first_name` / `last_name` | ✅ | ✅ | aligned |
| `legal_name` | ❌ | ✅ | **standalone gap** |
| `pronouns` / `pronouns_custom` | ❌ | ✅ (System-B only; columns dropped in "T4") | **standalone gap** — these live ONLY in `talent_profile_field_values` now |
| `pronunciation` | ❌ | ⚠️ **UNVERIFIED** (column exists; not seen written in the modules read) | neither clearly owns it |
| `gender` | ✅ hard-coded 14-option `<select>` | ✅ `GENDER_OPTIONS` (`state/fixtures.ts`) | **options are identical** and match the DB `identity.gender` definition (verified). Stored verbatim to `talent_profiles.gender` by both, mirrored to catalog by drawer. Low risk. |
| `date_of_birth` | ✅ | ✅ | aligned (drawer deliberately does NOT mirror DOB to catalog — legacy collision; column stays canonical) |
| `age_display_mode` | ❌ | ✅ (System-B only) | standalone gap |
| `nationality` | ❌ | ✅ | standalone gap |
| `home_country_text` | ❌ | ✅ (`home_country`) | standalone gap |
| `response_time` | ❌ | ✅ (System-B only) | standalone gap |
| `is_discoverable` | ❌ | ✅ | standalone gap (cross-tenant Discover master switch) |
| `field_visibility` (per-field public/agency/private) | ❌ | ✅ | standalone gap |
| `invitation_email` | ✅ | ✅ (`contact_email`) | aligned |
| `phone` | ✅ (raw string) | ⚠️ split prefix + national, recombined | **semantic divergence** — drawer parses/stores `+prefix national`; standalone stores whatever the admin typed. Round-tripping between the two can reformat the phone. |
| `instagram` | ✅ via `social_links` JSONB merge | ⚠️ social handled elsewhere (`social_links` / `profileDrawerExtras`) | both touch `social_links`; **last-writer-wins clobber risk** if both are used |

### 2.2 Physical

| Field | Standalone | Drawer |
|---|---|---|
| `height_cm` | ✅ **canonical-first**: writes `physical.height_cm` catalog row, THEN denorm `talent_profiles.height_cm` column | ✅ via dynamic catalog field (`physical.height_cm`) in `LiveCategoryFieldsEditor` |
| `physical.bust_cm`, `hips_cm`, `inseam_cm`, `body_type`, `hair_color`, `eye_color`, `dress_size`, `shoe_size_*`, `piercings`, `allergies`, … (≥14 defs) | ❌ | ✅ (DB-driven catalog) |

**Height note:** the standalone editor's "Phase 5-ε canonical-first height write" (`actions.ts:193-249`) is the *correct* reconciliation pattern — it seeds the catalog (`physical.height_cm`) before the denorm column and aborts the column write if the catalog write fails. The column is `integer` in the DB, but the standalone input uses `step={0.5}` and `parseFloat`; a half-cm value would be silently truncated/rejected by the column. Minor, but a real type mismatch.

### 2.3 About / bio

| Field | Standalone | Drawer | Divergence |
|---|---|---|---|
| `short_bio` | ✅ | ⚠️ not the primary bio surface | |
| `bio_en` / `bio_es` (+ `_draft`, `_status`) | ❌ | ✅ | **HIGH-IMPACT.** Public profile renders `canonicalBioEn(bio_en, short_bio)` (`app/t/[profileCode]/page.tsx:1275`) — `bio_en` wins, `short_bio` is fallback. A bio edited in the standalone editor (writes `short_bio`) is **invisible** for any talent with `bio_en` set. |
| `tagline` / `intro_italic` | ❌ | ✅ (`tagline`, mirrored to catalog) | standalone gap |
| `bio_tone`, `personality_traits` | ❌ | ✅ | standalone gap |

### 2.4 Location / service areas

| | Standalone | Drawer |
|---|---|---|
| `home_city_text` | ✅ | ✅ (panel-owned; `skip_service_areas` guard) |
| Service areas (`talent_service_areas`) | ✅ — routed through the **same** `setTalentServiceAreas` service the drawer uses (`extended-actions.ts:306` `toCanonicalKind`) | ✅ `LocationSlotPanel` |
| `home_place_id`, `travel_radius_km`, `travel_fee_required`, `remote_only` | ❌ (only the curated-city service-area rows) | ✅ |
| `passport_status`, `drivers_license`, `work_eligibility`, `upcoming_visits` | ❌ | ✅ |

Service-area writes were **deliberately unified at the service layer** already (the standalone's extended-actions comment: "the full-page editor and the drawer can no longer diverge"). This is the one section that is genuinely shared.

### 2.5 Languages

| | Standalone | Drawer |
|---|---|---|
| `talent_languages` rows | ✅ CRUD via `extended-actions` (`add/update/removeTalentLanguage`) | ✅ via `replace_talent_languages` RPC (or `LanguageSlotPanel` with `skip_languages` guard) |

**Divergence:** different write mechanics. Standalone does **incremental** insert/update/delete; drawer does **full replace**. Same target table; both fine in isolation, but a `replace` from a drawer with stale state could wipe rows added in the standalone (and vice-versa). The drawer already guards this internally with `skip_languages`, but **cross-editor** there is no coordination.

### 2.6 Taxonomy (talent type / roles / skills / contexts / attributes)

| | Standalone | Drawer |
|---|---|---|
| `talent_profile_taxonomy` (`primary_role`, `secondary_role`, `skill`, `context`, `attribute`) | ✅ — `TaxonomySection` with 5 buckets, by **term ID** (`addTalentTaxonomyTerm`) | ✅ — slug-based sync (`syncTalentTypeTaxonomyFromShellSlugs`, `shell_sync_taxonomy`) + skills/contexts via `talent-self-services` |
| Primary-role single-row invariant | ✅ enforced (delete-then-insert + rollback) | ✅ enforced |

Same table, compatible relationship vocabulary. The standalone is the **only** editor exposing the full 5-bucket taxonomy UI as a flat form; the drawer splits this across Skills/Contexts/Type-picker tabs with the catalog. No hard conflict, but two different UX models over one table.

### 2.7 Media

| | Standalone | Drawer |
|---|---|---|
| Avatar (`variant_kind='card'`), Hero (`hero`), Gallery (`gallery`) | ✅ — `ThreeSlotPhotoPanel` + `GallerySection`, **importing the SAME** `setTalentAvatar`/`setTalentHero`/`registerPortfolioPhoto` from `roster/[id]/extended-actions.ts` | ✅ — `PhotoGalleryPro` / `MediaGalleryDrawer`, **re-exporting the SAME** actions via `drawer-shared.tsx:418` |

Media is **already fully shared at the action layer.** Both surfaces call the identical server actions in `extended-actions.ts`. This is the cleanest part of the system and the template for how the rest should look.

### 2.8 Workflow / visibility / status

| | Standalone | Drawer |
|---|---|---|
| `workflow_status`, `visibility` | ✅ explicit `<select>` + audit events | ✅ via publish-gate (`shell_profile_status` + `applyProfileShellStatusWithPublishGate`) |
| `agency_visibility` (`roster_only`/`site_visible`/`featured`) | ✅ + sidebar eye toggle (`setRosterTalentSiteVisibility`, shared with drawers) | ✅ (Representation drawer, which imports the standalone's `setRosterTalentSiteVisibility`) |
| Roster meta (`internal_notes`, `emergency_contact`, `field_locks_data`, `feature_in_directory`) | ❌ | ✅ (System-B) |
| Delete / remove from roster | ✅ `removeTalentFromRoster`, `hardDeleteTalent` | ✅ (`removeFromRoster` in drawer-shared) |

**Divergence:** the standalone exposes raw `workflow_status`/`visibility` enums directly; the drawer routes status changes through a **publish-gate** that enforces completeness requirements. The standalone can therefore push a talent to `published` while bypassing the publish requirements the drawer enforces. This is a **governance divergence**, not just cosmetic.

### 2.9 Rates / availability / credits / limits / social / albums / documents / commercial terms / services menu

All ❌ in the standalone, ✅ in the drawer. These are entirely drawer-only and have no standalone equivalent.

---

## 3. Save-path semantics side by side

**Standalone** (`roster/[id]/actions.ts` + `extended-actions.ts`):
- Service-role client (`createServiceRoleClient`) — bypasses RLS; security rests on the explicit `userHasCapability` + roster-membership checks.
- Scalars: one `talent_profiles.update(profilePatch)` per form submit.
- Height: canonical-first catalog seed → denorm column (the only catalog bridge it has).
- Sections: discrete actions on interaction, each `revalidatePath` + `router.refresh()`.
- **No personal-profile lock** — a service-role write here can overwrite a talent-owned profile regardless of exclusivity status. (The drawer's path blocks this.)

**Drawer** (`admin-talent-identity.ts`, `admin-talent-profile-sections.ts`, `talent-field-values-catalog.ts`):
- Standard server client via `requireStaffTenantAction()` (RLS-aware, tenant-scoped).
- Identity: `talent_profiles.update` for kept columns + `syncScalarFieldValuesToCatalog` / `syncIdentityFieldValuesToCatalog` for migrated (column-dropped) fields.
- `commitTalentProfileShellAdmin`: one big batched `talent_profiles.update` (sections columns + JSONB) + catalog scalar/blob/identity/roster syncs + languages RPC + taxonomy sync + dyn-field sync + publish-gated status.
- **Personal-profile safety floor** enforced server-side.

**Net:** the drawer is the system of record. It is the only path that (a) writes the i18n bios, (b) writes the post-"T4" System-B-only fields, (c) honors the personal-profile lock, (d) honors the publish gate, (e) edits the dynamic catalog fields. The standalone covers a ~20-field subset and writes a *stale* shape (`short_bio` instead of `bio_en`, raw status instead of publish-gated status, no lock).

---

## 4. Where they actively conflict (not just gaps)

These are the cases where using BOTH editors on the same talent produces wrong/lost data:

1. **Bio (HIGH):** standalone `short_bio` is shadowed by drawer `bio_en` on the public page. Editing the bio in the standalone editor appears to work but does nothing user-visible.
2. **Phone (MEDIUM):** different normalization (`+prefix national` vs raw). Round-tripping reformats or mangles the stored value.
3. **Social links / Instagram (MEDIUM):** both rewrite the `social_links` JSONB array with different merge logic → last-writer-wins clobber of the other's entries.
4. **Languages (MEDIUM):** incremental (standalone) vs full-replace (drawer). A drawer save with stale state can delete languages added via the standalone.
5. **Workflow status (MEDIUM, governance):** standalone bypasses the publish-completeness gate the drawer enforces.
6. **Personal-profile lock (HIGH, safety):** the standalone has no lock; it can overwrite a talent-owned, non-confirmed profile that the drawer is designed to protect. This is a **multi-tenant data-ownership hole** as long as the route is reachable.
7. **Height type (LOW):** `step=0.5` input vs `integer` column.

Items 1 and 6 are reasons to **prioritize retiring the standalone route**, not merely deprecate it slowly — both are silent-wrong, and #6 is a safety-floor bypass. And because the standalone is the **post-create landing page**, every newly-created talent is *first* edited there — so these gaps are hit on the happy path, not just by a stray bookmark.

---

## 5. Recommendation: canonical editor

**The catalog-driven drawer (`TalentProfileShellDrawer`, `mode="edit-admin"`) is canonical.**

Rationale:
- It is the editor the product **actually routes to** today (the roster list opens it; the standalone route is orphaned).
- It is the **only** editor that writes the canonical bio (`bio_en`), the System-B-only fields (post-"T4" column drops), the dynamic catalog fields, and that enforces the personal-profile lock + publish gate.
- It is DB-driven, so adding/removing a field is a catalog change, not a code change — the standalone's hard-coded fields are a maintenance liability and already lag the schema.
- Media + service-areas + the eye-toggle + representation are **already shared at the action layer** with the standalone, so consolidating on the drawer keeps those working unchanged.

The standalone editor's only genuinely-better artifacts to preserve as patterns (not code) are:
- The **canonical-first height write** (already the safe ordering — confirm the drawer's `physical.height_cm` path is equally safe before deleting).
- The **flat completeness dial + workflow pipe** UI (`CompletenessDial.tsx`, `WorkflowPipe.tsx`) — nice at-a-glance widgets that could be ported into the drawer header if the drawer lacks an equivalent.
- The **ProofHealthCard** integration (`loadTalentProofHealth`) — verify the drawer surfaces proof-health; if not, port it.

---

## 6. Phased migration plan

Each phase is independently shippable and reversible. No data migration is required to *switch* editors (both target the same tables); the work is UI consolidation + closing the standalone's write-shape gaps before deletion.

### Phase 0 — Map the reachable surface (no user-facing change)
- The route's **only** live entry is the New Talent drawer's post-create handoff (`new-talent-drawer.tsx:325,369`). Confirm there are no others (a structured-log breadcrumb on `roster/[id]/page.tsx` entry will catch any bookmark/legacy path over 1–2 weeks).
- Grep CI guard: fail the build if a NEW `<Link>`/`router.push` to `/admin/roster/[id]` is introduced (the two known ones are grandfathered until Phase 3).
- **Exit criteria:** confirmed that "post-create handoff" is the whole story.

### Phase 1 — Make the orphan safe (close the silent-wrong bugs) *(do this even if deletion slips)*
While the route still exists, eliminate the two HIGH risks so it can't corrupt data:
- **Bio:** change the standalone to write `bio_en` (mirroring the drawer's canonical field) instead of, or in addition to, `short_bio`. Or simplest: remove the bio field from the standalone entirely.
- **Personal-profile lock:** add the same `personalProfileLocked` guard (`user_id` set AND exclusivity ≠ `confirmed`) to `resolveEditContext` in `actions.ts`/`extended-actions.ts`.
- Optionally neutralize the phone/social/language clobber by removing those fields from the standalone (push users to the drawer for them).
- **Risk:** low; these are subtractive/defensive.

### Phase 2 — Port any drawer gaps (capability parity)
Confirm the drawer covers everything an admin currently relies on from the standalone, and port what's missing:
- Completeness dial / workflow pipe widgets (if the drawer header lacks them).
- ProofHealthCard (if absent in the drawer).
- The flat 5-bucket taxonomy editor *as a convenience* (optional — the drawer's tabbed model already covers the data).
- **Exit criteria:** a checklist sign-off that no field reachable in the standalone is unreachable in the drawer.

### Phase 3 — Re-point the handoff + delete the route
- **Re-point the New Talent drawer.** Change `new-talent-drawer.tsx:325` and `:369` from `router.push('/.../admin/roster/<id>')` to `openDrawer("talent-profile-shell", { mode:"edit-admin", talentId })` (the drawer already accepts `talentId`). After this, nothing reaches the standalone route. **This is the gating step** — do it first in the phase and verify no other caller remains via grep.
- Replace `roster/[id]/page.tsx` with a server redirect to the roster list (defensive, for any stray bookmark) — or a thin page that auto-opens the drawer for that `talentId`.
- Delete `TalentEditForm.tsx`, `EditorSections.tsx`, `CompletenessDial.tsx`/`completeness.ts`, `WorkflowPipe.tsx`, `talent-data.ts`, `curated-city-field.tsx`, and the **scalar** `actions.ts` (`updateRosterTalentProfile`, `updateRosterTalentWorkflow`).
- **DO NOT delete `extended-actions.ts`** — its `setTalentAvatar` / `setTalentHero` / `registerPortfolioPhoto` / `setRosterTalentSiteVisibility` (in `actions.ts`) are **imported by the drawer and other surfaces** (`drawer-shared.tsx`, `representation.tsx`, `profile-essentials.tsx`, `TalentPage-3.tsx`). Before deleting `actions.ts`/`extended-actions.ts` wholesale, **move the still-imported actions to a neutral module** (e.g. `lib/server-actions/admin-talent-roster.ts`, which already exists and notes it parallels these) and update imports. This is the trickiest mechanical step — the standalone route's `extended-actions.ts` is load-bearing for the drawer.
- **Risk:** medium — import-graph surgery. `npx tsc --noEmit && npm run lint` gates it; the shared-action move must be verified with a grep of all importers.

### Phase 4 — Cleanup + docs
- Delete the orphaned i18n keys under `admin.talent.edit.*` that only the standalone used (verify none are shared with the drawer first).
- Update `web/docs/development-workflow.md` / any onboarding doc that references the full-page editor.
- Remove the CI guard from Phase 0.

---

## 7. Data / UX / rollout risks

- **No row migration needed.** Both editors already write the same physical tables; switching the UI does not require moving data. The catalog (`talent_profile_field_values`) is already populated (121 talents, 3,344 rows) — the drawer has been the live editor.
- **The route IS reached (post-create handoff).** It is not orphaned — it is the screen every newly-created talent lands on. So Phase 1's defensive fixes are **not optional** if Phase 3 slips: new talents hit the standalone's bio/lock gaps on the happy path. Phase 3's gating action is re-pointing the two `router.push` calls in `new-talent-drawer.tsx` (lines 325, 369) to open the drawer instead.
- **Shared-action import graph (Phase 3) is the real hazard.** The standalone route folder exports actions the drawer depends on. Deleting the folder naively will break the drawer's media + visibility writes. Mitigation: relocate shared actions first, gate on `tsc`.
- **Publish-gate behavior change.** Once the standalone is gone, admins can no longer push `workflow_status='published'` while bypassing completeness. This is intended, but communicate it — an agency used to the standalone's "just set published" shortcut will notice the gate.
- **Height precision.** When porting/confirming, ensure the drawer's `physical.height_cm` write also respects the integer column (or that a migration to `numeric` is a separate, conscious decision — out of scope here).
- **UNVERIFIED items to nail down during implementation:** (a) `pronunciation` column owner — neither editor was observed writing it; (b) whether the drawer surfaces ProofHealth + a completeness widget (Phase 2 checklist); (c) exact list of `admin.talent.edit.*` i18n keys safe to delete.

---

## 8. File reference index

**Standalone editor**
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/page.tsx` — loader + layout
- `.../[id]/TalentEditForm.tsx` — scalar form + photo panel + workflow sidebar
- `.../[id]/EditorSections.tsx` — taxonomy / languages / service-areas / gallery / delete
- `.../[id]/actions.ts` — `updateRosterTalentProfile`, `setRosterTalentSiteVisibility` (**shared**), `registerRosterTalentPhoto`, `updateRosterTalentWorkflow`
- `.../[id]/extended-actions.ts` — taxonomy/lang/area/portfolio CRUD + `setTalentAvatar`/`setTalentHero`/`registerPortfolioPhoto` (**shared with drawer**) + delete/hard-delete
- `.../[id]/completeness.ts`, `CompletenessDial.tsx`, `WorkflowPipe.tsx`, `talent-data.ts`, `curated-city-field.tsx`
- `.../roster/new/` — minimal create form (separate; not in scope to delete, but redundant with the drawer's `mode="create"`)

**Catalog-driven drawer**
- `web/src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx` (215 KB)
- `.../profile-shell/profile-shell-modules/*` — `profile-state.tsx`, `profile-identity-editor.tsx`, `profile-editors-core.tsx`, `profile-extras-editors.tsx`, `profile-commercial-terms.tsx`, `new-talent-drawer.tsx`, …
- `web/src/lib/server-actions/admin-talent-identity.ts` — identity write + catalog mirror
- `web/src/lib/server-actions/admin-talent-profile-sections.ts` — `commitTalentProfileShellAdmin` (batched) + section actions + `syncTalentTypeTaxonomyFromShellSlugs`
- `web/src/lib/server-actions/admin-talent-field-values.ts` — admin catalog value writes (`talent_profile_field_values`)
- `web/src/lib/server-actions/talent-field-values-catalog.ts` — talent-self catalog writes
- `web/src/lib/talent/talent-profile-shell-persistence.ts` — pure patch/RPC builders + zod
- `web/src/components/admin/shell/internal/drawers/drawer-shared.tsx` — **re-exports the standalone's shared actions** (the coupling to break in Phase 3)
- `web/src/components/admin/shell/internal/page-modules/TalentPage-1.tsx:198,310` — roster-list drawer openers (entry point for EXISTING talent)
- `web/src/components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/new-talent-drawer.tsx:325,369` — **the two `router.push` calls that send a NEWLY-created talent to the standalone route** (re-point these in Phase 3)

**Shared targets (both write these tables)**
- `talent_profiles`, `talent_profile_taxonomy`, `talent_languages`, `talent_service_areas`, `media_assets`, `agency_talent_roster`
- `talent_profile_field_values` + `profile_field_definitions` (catalog — drawer-primary; standalone touches only `physical.height_cm`)
