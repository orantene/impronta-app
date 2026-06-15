# Profile-Fields / Catalog-Engine Audit + Deep Recommendation — 2026-06-15

Audit of the Platform "Profile Fields" control room (`/platform/admin/catalog`) — all 6 tabs
(Catalog Engine: Talent-Type Category / Fields Groups / Fields; Section Editor: Section
Category / Section Fields Groups / Section Fields) — plus the public `/t/` render, the Spanish
i18n machinery end-to-end, the workspace-admin roster editor, and the mutation→cache→tenant
sync chain. Produced from a 10-agent read-only fan-out + direct DB inspection (project
`pluhdapdnuiulvxmyspd`, 310 field defs / 261 active).

---

## 1. Executive summary — what's actually wrong

The screen *looks* alarming ("1 needs attention", "224 unused fields") but the headline metrics
are mostly noise. The real problems are elsewhere:

| Area | Reality |
|---|---|
| **Risk warnings** | Only **1** genuine risk (`models.height` sensitive+public). The "224 unused" (really **142** active) is just *fields no talent has filled yet* — normal for a young catalog, mislabeled as "risk". |
| **Spanish — the real story** | The data gap is real (**235/261** active fields missing `label_es`, 15 helpers, 83 English-only option sets) **but worse: several Spanish paths aren't even wired to render.** Translating data alone would be wasted on those surfaces. |
| **Two real data-integrity bugs** | (a) Saving a talent-type/category **nulls its `name_es` and silently sets `is_active=false`**; (b) the Section-Fields reorder panel **destroys catalog field ordering** (lists alphabetically, saves as `display_order`, which is shared with the Fields tab). |
| **Sync chain** | Structurally sound (tag-based cache busting wired on read+write), with one latent gap: `revalidatePath` is hardcoded to `/impronta/...` so non-Impronta tenants lean entirely on the tag. |
| **Clutter** | 49 deprecated fields render dimmed-but-present; 159 active fields are ungrouped; ~545 lines of dead code (`editor-tab.tsx`); one mislabeled tab. |

---

## 2. Architecture map (so the two halves stop being confusing)

There are **two independent systems** behind one page, sharing the nav:

**A. Catalog Engine** — the *field catalog*. Table `profile_field_definitions` (310 rows). Three tabs:
- **Talent-Type Category** → the 3-level taxonomy (`taxonomy_terms`: parent_category → category_group → talent_type). Drives field applicability + directory filters.
- **Talent-Type Fields Groups** → `profile_field_groups` (13 rows). Organizes fields by *catalog group*.
- **Talent-Type Fields** → the 310 field defs themselves, grouped by `field_group_id`.

**B. Section Editor** — the *talent profile-editor rail layout*. Tables `profile_editor_section_groups` (7 rail groups) + `profile_editor_sections` (20 sections). Three tabs:
- **Section Category** → manages the 7 **rail groups** (Profile, Craft, Logistics, …).
- **Section Fields Groups** → *misnamed*; actually manages the 20 **sections** (Identity, Rates, …).
- **Section Fields** → maps each catalog field into a rail section (by the `section` string), reorder.

Both halves read the **same** `profile_field_definitions`; the difference is the *axis* (catalog
group vs editor-rail section).

**Sync chain (platform → tenant → talent):**
```
profile_field_definitions  ──(platform edit, actions.ts)──► revalidateTag("field-catalog")
        │                                                          │ busts ALL tag-cached reads
        ▼ merge (profile-fields-service.mergeCatalog)              ▼
workspace_profile_field_settings (tenant override: enable/hide/relabel/require)
        │  setWorkspaceFieldCatalog ──► revalidateTag("field-catalog" + "field-catalog:<tenant>")
        ▼
resolve-talent-fields (tag-cached) ──► talent editor drawer + public /t/ render
```
Read loaders wrapped in `unstable_cache` with the `field-catalog` tag (verified):
`catalog-map-data`, `tenant-catalog-data`, `profile-fields-service`, `resolve-talent-fields`.
**Conclusion: tag invalidation propagates correctly in principle** — confirmed by the sync test
matrix in §5.

---

## 3. The Spanish render-wiring problem (the part that matters most)

Spanish has THREE layers; the data gap is only one of them, and not the blocking one:

| Surface | Reads ES? | Status |
|---|---|---|
| Public `/t/` field **labels** | `pickFieldLabel(locale, en, es)` | ✅ wired — but 90% of `label_es` is empty |
| Field **helper** text | — | ❌ `helper_es` is **write-only dead data**; resolver never selects it |
| Field **options** (select/chips) | — | ❌ plain English `string[]`; **no ES path anywhere**; booleans hardcoded `Yes/No` |
| **Rail group/section** labels | — | ❌ `label_es` **write-only dead data**; live rail uses a hardcoded `ES_TEXT[en] ?? en` dictionary; `buildLayout()` drops `labelEs` |
| **Section Fields** tab field labels | UI tries `field.label_es` | ❌ loader hardcodes `label_es: null` |
| Public **group headings** | re-derived from slug | ❌ ignores `profile_field_groups.name_es` |
| Taxonomy (types/skills/langs) | `pickTaxonomyLabel` | ✅ wired **and** 100% `name_es` coverage |

**Implication:** the correct order is **wire the render path first, then backfill data** — otherwise
translating 235 labels + 83 option sets produces strings nothing displays.

---

## 4. Prioritized recommendation (the plan)

### Wave 1 — Real bugs (data integrity / sync correctness) — **P0**
1. **Taxonomy update clobber** (`platform/admin/taxonomy/actions.ts`): add `?? beforeRow.x`
   fallbacks for `name_es`/`plural_name`/`description`/`icon`, and stop forcing `is_active=false`
   on save (`formData.has('is_active') ? checked() : beforeRow.is_active`). *Directly fixes your
   "rename a category and it works" scenario.*
2. **`models.height`**: `is_sensitive=false` (matches sibling `physical.height_cm`; clears the lone real risk).
3. **Section-Fields reorder destruction** (`profile-editor/actions.ts` + `editor-layout-admin-data.ts`):
   seed the panel from `display_order` and sort the bucket by it (not alphabetical), and scope the
   write so it can't clobber other groups' ordering.
4. **moveSection into inactive group**: reject / filter inactive groups from the move select.
5. **Roster page**: make `height_cm` dual-write share a failure path; make primary-type save
   non-destructive on insert failure; correct `last_edited_role`.

### Wave 2 — Spanish render wiring — **P0/P1**
6. **`helper_es` seam**: select it in `resolve-talent-fields`, add to `ResolvedField`, render
   locale-aware in `FieldEditor` + public profile.
7. **Option i18n** *(decision: additive, low-risk)*: add `options_es jsonb` parallel map
   `{ "<value>": "<es label>" }` to `profile_field_definitions`; consume in `FieldEditor`
   (select/multiselect/chips) + public `formatFieldValue`; localize booleans `Yes/No → Sí/No`.
   *(Rejected the object-array `{value,label_en,label_es}` migration — touches every reader; the
   parallel map is additive and reversible.)*
8. **Rail label_es**: carry `labelEs`/`labelEsAlt` through `buildLayout` → `sectionMeta`; render
   locale-aware in `TalentProfileShellDrawer`. Backfill the `ES_TEXT` dictionary for the 8 missing
   rail labels as a belt-and-suspenders default.
9. **Section Fields tab + main Fields list**: add `label_es`/`helper_es` to the `catalog-map-data`
   SELECT + `CatalogField` type; render ES inline; map it in `toSectionField` (drop the `null`).
10. **Public group headings**: source from `profile_field_groups.name_es`.

### Wave 3 — Spanish data backfill (after wiring) — **P1**
11. Migration backfilling `label_es` (235), `helper_es` (15), `options_es` (83 sets), rail
    `label_es` (7 groups + 20 sections), generated by a translation fan-out and human-reviewable.

### Wave 4 — UX / clarity / dead code — **P1/P2**
12. **Risk panel**: drop `unused` from `CatalogRisk` → render as a plain "No data yet: N" coverage
    stat; make the real priority-risk rows clickable links to the field editor; add a
    "Has ES label N/261" coverage stat.
13. **Archived filter**: add Active(default)/Archived/All to the Fields tab; hide the 49 deprecated
    by default; `field_count` reflects active.
14. **Dead code**: delete `editor-tab.tsx` (~545 unused lines).
15. **Rename** "Section Fields Groups" → "Sections"; fix the double-counted Sections stat; fix the
    post-save tab bounce (preserve originating tab).
16. **Ungrouped triage**: bulk-assign or formally document the 159 active ungrouped fields.

### Wave 5 — Sync verification (see §5) — runs against live DB + cache.

### Wave 6 — Gate + QA: `tsc --noEmit && lint`; preview-QA the roster drawer + a talent login +
the `/es` render across sections.

---

## 5. Sync-behavior test matrix (your explicit ask)

Each scenario verified end-to-end (platform edit → tenant catalog → talent editor → public `/t/`):

| # | Scenario | Expected | How verified |
|---|---|---|---|
| S1 | Platform **edits a field label** | new label everywhere after tag bust | edit via action → re-read `loadFieldCatalog(tenant)` + `/t/` |
| S2 | Platform **changes `label_es`** | ES label on `/es` surfaces | set `label_es` → `/es/t/` render |
| S3 | Platform **archives (soft-delete)** a field | gone from editor + public; values preserved | `setLifecycle archive` → resolver excludes it |
| S4 | Platform **hard-deletes** a field | cascades values + overrides + recs; gone | `deletePlatformFieldAction` → row counts 0 |
| S5 | Platform **renames a group / rail section** | new name in editor rail + headings | `updateGroup` / `updateSection` → layout reload |
| S6 | **Workspace admin hides a field** | hidden for *that tenant only*, others unaffected | `setWorkspaceFieldCatalog{enabled:false}` → tenant A hidden, tenant B intact |
| S7 | Workspace admin **relabels** a field | tenant sees custom label, platform default elsewhere | `custom_label` → merge precedence |
| S8 | Workspace admin tries to **un-hide a platform-floored** (sensitive/admin) field as public | rejected | floor guard returns error |
| S9 | Platform **reorders fields** | order reflected in editor + Fields tab | `reorderFields` → display_order |
| S10 | **Cache propagation** cross-tenant | non-Impronta tenant updates within tag bust (not just 60s floor) | confirm tag-cached read path |

Findings recorded inline in the implementation; S10 is the one to watch (the `revalidatePath`
hardcoded-to-Impronta gap — mitigated by the global tag, but worth a path-agnostic fix).

---

## 6. Decisions taken (forks resolved with low-risk defaults)

- **Option i18n** → additive `options_es jsonb` map (not an options schema migration).
- **Rail labels** → wire DB `label_es` through render *and* backfill the `ES_TEXT` dictionary.
- **Roster standalone page** → keep + fix its bugs; do **not** unify with the catalog drawer (the
  drawer is the catalog-driven surface you named for QA). Unification is a separate, larger project.
- **Ship** → feature branch `feat/catalog-fields-engine-cleanup` + migrations applied via
  `db:push`; gated; presented for review before merge to `main` (no auto-prod-deploy).
- **`value_i18n`** (per-locale talent free-text values) → out of scope; the phantom migration that
  targeted retired tables is noted for cleanup, not rebuilt.
