# Builder Lab — Full Polish & Improvement Plan

**Goal:** make the Builder Lab the single control plane for everything the page builder offers — every catalog component, every starter/template, every surface gate, every lifecycle state — and make operating it *fast* (bulk, keyboard, search), *consistent* (one UI vocabulary), and *safe* (audit, undo, dependency guards, cross-surface truth). This plan absorbs the prior 9-agent audit and the 5-lens idea set into one autonomous-execution sequence. No re-derivation of already-verified findings; no re-planning of shipped work.

All file paths below are real and confirmed in this repo. Builder Lab UI lives in `web/src/components/builder-lab/`; the governance core lives in `web/src/lib/site-admin/builder-core/templates/` and `web/src/lib/site-admin/add-gallery/`. **Migrations live in the repo-root `supabase/migrations/` directory** — canonical, verified directly (`web/supabase/migrations/` is not present). The latest applied band is **`20261105000000`** (the shell `gallery_tab` CHECK fix, #612, shipped this session), so **new migrations use band ≥ `20261106000000`**.

---

## Status legend & what's already done

Legend: **DONE** = shipped to `main`. **IN-FLIGHT** = built + gated + live on a branch, not yet on `main`. **TODO** = in this plan. Do **not** re-implement DONE/IN-FLIGHT.

| Item | State | Notes — do not redo |
|---|---|---|
| Shell `gallery_tab` CHECK migration | **DONE** (#612, on `main`) | Constraint shipped. |
| Site Starter Kit manager (DB-backed table + Sync) | **IN-FLIGHT** (branch) | `catalog-starter-kit.tsx` DB-backed; Sync built. Slice 0 complete. |
| Status/Archive control (code rows → `availability_override`; template rows → lifecycle actions) | **IN-FLIGHT** (Batch 1, branch) | Two orthogonal axes already implemented. Don't rebuild the control. |
| Shared UI foundation: promoted `LinkBtn` into `ui.tsx`, `LabStatusDropdown`, `LAB.toastMs`, `#f0a8a8` → `LAB.red` | **IN-FLIGHT** (Batch 1, branch) | Foundation primitives exist. New work *consumes* them. |
| Gating tooltips (subtract-only / Max-shell labelling) | **IN-FLIGHT** (Batch 1, branch) | Tooltips landed. |
| Gating mechanism itself (subtract-only via `builder_catalog_overlay` → `applyCatalogOverlay`) | **VERIFIED working** | Confirmed correct; only labels misled. Do not "fix" the engine. |

**Still open from the original audit sequence (folded into Phase 1 below):** Default-surfaces preview 404; Site Starter Kit duplicate-slug 500 + Platform dead-end; Catalog Studio category precedence inversion; remaining UX-unification sweep (route buttons through `LabButton`, `LabViewHeader` on Site Defaults + Default-surfaces, dedupe the double `useEffect` in `builder-lab-stage.tsx:245-280`); the "Builder Lab" surface column (`lab_enabled` migration + `isLab` read flag — do **not** reuse `surfaceTarget:'platform'`, it would hide every DB template from the Lab).

---

## Doctrine (binding)

Non-negotiables for every task. An executor that violates these has failed the task regardless of green tests.

1. **Shared-core, no fork.** There is exactly one read path to the live `+` gallery (`fetchSurfaceGalleryItems`, documented SYNC INVARIANT in `gallery-fetch-action.ts`) and one render core. Never add a parallel render/fetch path. Lab previews reuse the existing platform-lab adapter and `/template-preview/[key]` route.
2. **Reuse existing actions/columns/UI.** Every task's `reusesExisting` list is mandatory, not advisory. New server actions wrap existing chokepoints (`setComponentOverlay`, `clearComponentOverlay`, `publishTemplate`/`publishRowCore`, `archiveTemplate`, `setTemplateRollout`, `createTemplateDraft`, `duplicateTemplate`) — all already behind `requireSuperAdmin` with `gate.userId` in hand. No parallel CRUD.
3. **Gate before commit, every task:** from `web/`: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint && npm run test:builder && npm run test:builder-chrome`. A 0-error run that OOM-crashed is **not** clean. New logic that can be unit-tested gets a test added to the `test:builder` or `test:builder-chrome` list.
4. **Migrations only where flagged.** Files go in repo-root `supabase/migrations/`. Apply via the documented Supabase-MCP fallback (`execute_sql` + manual `schema_migrations` ledger row) when `db:push` drift-blocks — this is the recurring, expected path. Every new migration uses a unique timestamp in band **≥ `20261106000000`** (band `20261105000000` is taken by #612), one band per task. On collision, park-restore.
5. **Integrate into the live worktree for QA.** Raw `*.vercel.app` previews 404 (host-gating). QA on a seeded host (`impronta.tulala.digital` / `app.tulala.digital`) or localhost. The Lab is super_admin-only — QA as `orantene`.
6. **Two orthogonal axes stay orthogonal.** Per-surface *visibility* (overlay enable/`availability_override`) and lifecycle *status* (draft/in_review/published/archived) are independent dimensions. Never collapse them into one control.
7. **Tighten-only invariant.** Overlays can only subtract/restrict (`morePlanRestrictive`), never loosen a code/template default. Any new write path preserves this.

---

## Phases & tasks

Phases are ordered by leverage. Within a phase, **[P]** = parallelizable (disjoint files), **[S]** = sequential (shared hot file or hard dependency). Agent: **opus** for cross-cutting/design/tree-walk/migration-shaped; **sonnet** for mechanical/contained/single-file.

### PHASE 1 — Finish the fixes (close the audit, unblock everything)
Highest leverage: these are known bugs + the foundation the rest builds on. Do this phase first.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| F1 | **Duplicate-twice 500 → collision-safe slug minting** in `duplicateTemplate` (`registry-actions.ts`). Query existing `(kind, slug)`, strip any `-copy[-n]` suffix from base, mint `-copy`, `-copy-2`…; same for title `(Copy)`/`(Copy 2)`. Export the minting helper for reuse. | sonnet | S | No | — | Duplicate the same starter 3× in Starter Kit + Template Manager → 3 rows, no unique-violation, no 500. Unit test on the slug helper added to `test:builder`. |
| F2 | **Default-surfaces preview 404 fix** — replace the dead `/dev/` link with the real owner-gated hydrated route `app/template-preview/[key]/page.tsx` via `getTemplatePreviewUrl(key,{family})`. Kill the ghost unpublished pointers. | opus | M | No | — | Default-surfaces Preview opens a live hydrated render in prod (not 404); no `/dev/` URLs remain; no ghost pointer rows. |
| F3 | **Site Starter Kit: Platform-target dead-end** — remove/redirect the `target=Platform` path that dead-ends; route it to a valid surface or hide the option. | sonnet | S | No | — | No selectable Starter Kit path leads to a dead screen. |
| F4 | **Catalog Studio category precedence inversion** — Lab must render the same category layout the live surface resolves. Reconcile precedence in `catalog-structure.ts` / Studio category resolution so Lab == live. | opus | M | No | — | Studio category in Lab matches the live-rendered layout for the same tenant; regression test in `catalog-studio-slug.test.ts` neighborhood. |
| F5 | **Wire Lab preview button to `/template-preview`** — replace the `available:false` "coming soon" stub in `component-preview-stage.tsx:76` for `source==='template'`: fetch `builder_tree` via `getTemplateById`, seed the existing ephemeral platform-lab adapter, and add an "Open preview" action on Starter Kit + Template Manager rows via `getTemplatePreviewUrl(slug,{family: previewFamilyForRegistry(...)})`. No new render fork. | opus | M | No | — | Every starter/template row has a working visual preview; template-source preview no longer returns the stub. |

**UX-unification finish (shares hot files — run [S] after F-tasks above, as one coordinated sub-batch):**

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| F6 | **Route remaining buttons through `LabButton`** (consume the Batch-1 foundation in `ui.tsx`); remove any straggler ad-hoc button styling. | sonnet | S | No | Batch 1 (IN-FLIGHT) | No raw `<button>`/inline-styled buttons remain in Lab views; all go through `LabButton`. |
| F7 | **`LabViewHeader` on Site Defaults + Default-surfaces** (the two views the audit flagged as header-less). | sonnet | S | No | Batch 1 | Both views render the standard `LabViewHeader`; off-token error red replaced with `LAB.red`. |
| F8 | **Dedupe the double `useEffect`** in `builder-lab-stage.tsx:245-280`. | sonnet | S | No | — | Single effect; no double-fire; `test:builder-chrome` green. |

*F6/F7/F8 all touch `ui.tsx` / `builder-lab-stage.tsx` → must serialize among themselves; can run after F1–F5 land.*

### PHASE 2 — Cross-surface safety + the "Builder Lab" surface column
The highest-blast-radius gap: one toggle silently governs two unrelated audiences, and Lab "visible" ≠ live-visible. Ship the cheap read-only truth views first, then the data-model rewrite.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| X1 | **Surface-matrix read-only view** — pure-derived 4-cell projection (talent profile / talent shell / workspace page / workspace shell) over existing `buildCatalogAdminView` state, exposing the current lossy reality (talent shell = "Workspace" toggle, surprise). No migration; precursor that de-risks X4. | sonnet | M | No | — | Each catalog row shows a 4-surface grid derived from existing overlay state; admin can *see* that hiding from workspace also hides the talent shell. |
| X2 | **Activate the dormant catalog-version drift banner** — poll `getCatalogVersion` (already bumped by every mutation via `bumpCatalogVersion`, currently zero consumers) in `builder-lab-shell.tsx`; show "Catalog changed elsewhere — reload" when it advances. | sonnet | S | No | — | Editing the catalog in a second tab raises the banner in the first; confirms bump-on-write fires. |
| X3 | **Tighten-only invariant guard + disabled-toggle tooltip** — in `setComponentOverlay` reject enabling a surface the row's `target_context` excludes; in `catalog-row-table.tsx` disable that toggle with "This component targets {x}; can't be enabled on {y}." | sonnet | S | No | — | No false-positive "enabled" cells; server rejects out-of-target enable; tooltip explains why. |
| X4 | **Split the 2-toggle overlay into a true 4-surface matrix** — add `talent_profile_enabled`, `talent_shell_enabled`, `workspace_page_enabled`, `workspace_shell_enabled` to `builder_catalog_overlay`; derive a distinct `surfaceTarget` per `BuilderSurfaceKind`; render a 4-column matrix; migrate existing 2 columns forward losslessly. | opus | L | **Yes** | X1 | Admin can express "talent profile + talent shell, not workspace page"; existing overlays migrate with no visible behavior change; `applyCatalogOverlay` honors all 4. High risk — guard with X1 truth view + parity probe X5. |
| X5 | **Live-gallery parity probe** — "Preview as surface" calls `fetchSurfaceGalleryItems` with a synthesized `GallerySurfaceDescriptor` per surface (free/studio/agency × talent tier) and diffs against the Lab admin view, flagging "shown in Lab, hidden live" rows with reason (plan / tier / rollout / target). | opus | M | No | — | For a chosen plan+tier, the probe lists exactly which Lab-visible rows are live-hidden and why, from the production read path. |
| X6 | **The "Builder Lab" surface column** — add `lab_enabled` overlay column + an `isLab` flag on the read path. **Do NOT** reuse `surfaceTarget:'platform'` (hides every DB template from the Lab). | opus | M | **Yes** | — | A component can be governed-visible in the Lab independent of tenant surfaces; no DB template disappears from the Lab. |

*X4 and X6 both alter `builder_catalog_overlay` + `registry-db-merge.ts` + `catalog-row-table.tsx` → SEQUENTIAL with each other and with X1/X3. X2 and X5 are disjoint → [P].*

### PHASE 3 — Lifecycle & governance (the accountability backbone)
Bulk editing is only safe once there's a trail and an undo. Ship the audit table first; undo/revert depend on it.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| G1 | **Builder Lab activity log** — new `builder_lab_audit` table; append a row from every super_admin chokepoint (`setComponentOverlay`, `clearComponentOverlay`, `publishTemplate`/`publishRowCore`, `archiveTemplate`, `unpublishTemplate`, `setTemplateRollout`) with `before`/`after` JSON, actor (`gate.userId`), ts. Reverse-chron feed panel + per-row history affordance. | opus | M | **Yes** | — | Every governance write lands an audit row with diff; feed shows who/what/when; per-row history opens. |
| G2 | **Emit audit events on overlay writes via existing pipeline** — also wire `scheduleAuditEvent` → `record_phase5_audit` → `platform_audit_log` (already used by template publishes) into both overlay actions with a diff summary. (Complements G1's Lab-local table; reuses the platform audit pipeline for parity with template publishes.) | sonnet | S | No | — | Overlay writes emit a `platform_audit_log` event with surface/override diff. |
| G3 | **Surface the discarded publish diff** — `diffTemplateTreeForPublish` already runs in `validate-publish.ts:190` and is `void`-discarded. Return its verdict from `publishTemplate`; `PublishNotePanel` shows "No changes since v(N) — re-publishing only bumps version" vs "Tree changed since v(N)". | sonnet | S | No | — | Publishing a no-op draft warns before confirm; changed draft shows "Tree changed since v(N)". |
| G4 | **Two-person approval** — add `submitted_by/submitted_at/reviewed_by/reviewed_at/review_note` columns; stamp in `submitTemplateForReview`/`rejectToDraft`/`publishTemplate`; optional block-self-approve guard (publish of `in_review` fails if reviewer == submitter); reviewer note threads into revision snapshot via `normalizeChangelog`. | opus | M | **Yes** | — | Reviewer identity recorded; self-approve blockable; reject captures a reason. |
| G5 | **Guardrail: block archiving/hiding a depended-on component** — pre-write scan walks all published `builder_templates` trees (reuse the `computeDataBindingRequirements`/`collectDanglingBindings` recursive visitor, keyed on `node.type`/embedded template ref), blocks or requires "archive anyway, N templates depend on this" confirm with the dependent list. | opus | L | No | — | Archiving/hiding a component referenced by a published template lists dependents and requires explicit confirm; unreferenced archive is unaffected. |
| G6 | **Tenant picker + impact preview for the rollout panel** — replace raw-UUID textareas (which silently drop non-UUIDs) with tenant search/multi-select; live readout via the pure frozen `templateRolloutAllowed`/`deterministicBucket`: "N of M tenants see this now (X allowlist, Y % bucket, Z denied)". | sonnet | M | No | — | Operator picks tenants by name; invalid ids surfaced not dropped; exact admitted-count shown. |
| G7 | **Per-row overlay revision/undo** — capture a per-item overlay snapshot on each `setComponentOverlay`/`clearComponentOverlay`; compact revision strip on the catalog row (mirror `RevisionList`) with "revert this item to its state on (date)". Shares G1's table. | opus | M | **Yes** (shares G1) | G1 | A single bad overlay tweak reverts without re-entering other overrides. |
| G8 | **Scheduled / timed rollout ramp + auto-archive** — optional `rollout_ramp_to`/`rollout_ramp_at`/`status_expire_at` columns; cron (reuse money-alert/reconcile-held-payouts pattern) advances `rollout_percentage` toward target and flips long-stale drafts to archived; each transition writes through G1. | opus | L | **Yes** | G1 | "Canary 10% → 100% over the weekend" runs unattended; stale drafts auto-archive; every transition audited. High risk — flag-gate the cron. |

*G1 must land before G7/G8. G2/G3/G6 are disjoint → [P]. G4/G5 touch registry actions → coordinate with G1.*

### PHASE 4 — Operator efficiency (turn 30-click chores into 2 clicks)
Depends on Phase 3 audit/undo being in place so bulk editing is safe.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| O1 | **Single bulk-overlay server action** — `setComponentOverlayBatch(inputs[])` / `clearComponentOverlayBatch(refs[])` in `catalog-overlay-actions.ts`: upsert/delete N rows in one round-trip, bump version + revalidate **once**. Same `requireSuperAdmin` gate + payload shape. No UI. | sonnet | S | No | — | A 40-item re-gate is one DB call + one cache bump; identical result to N sequential calls. |
| O2 | **Row checkboxes + sticky bulk action bar** in `CatalogRowTable` — leading checkbox column + "N selected" bar (Show/Hide on each surface, Publish, Archive, Reset overlay), backed by O1. | opus | M | No | O1 | Select N rows → bulk action applies via O1 with optimistic flip + reload reconcile; undo (G7) covers it. |
| O3 | **Mount the orphaned Template Manager as a Catalog special tab** — add `TemplateManager` (`template-manager.tsx`, fully built, mounted nowhere) as a `SPECIAL_TABS` entry ("Templates") in `ComponentCatalog`. Unlocks rollout/allowlist/denylist/changelog/revision controls. | sonnet | S | No | — | "Templates" tab renders TemplateManager; `in_review`/`archived` are reachable states, not dead. |
| O4 | **Inline rollout + revision controls on Playground draft rows** — expandable per-row drawer in `catalog-playground.tsx` mounting existing `RolloutPanel` + `RevisionList`, calling `setTemplateRollout`/`rollbackToRevision`/`restoreTemplateRevision`. | sonnet | M | No | — | Stage rollout / roll back a version from the Playground row without leaving it. |
| O5 | **Undo toast for governance edits** — capture pre-mutation overlay snapshot on toggle/status/save/reset; surface "Undone? Undo" in `LabToast` for `LAB.toastMs`; replace the modal reset-confirm with optimistic + undo. | opus | M | No | G7 (snapshot infra) | Accidental toggle/reset recoverable from the toast; reset no longer modal. |
| O6 | **Global cross-tab search (Cmd/Ctrl-K)** — command palette indexing all gallery components + `builder_templates` (`listAllTemplates`) + Playground drafts; results grouped by source; click jumps to owning tab with row pre-expanded (`setActiveTab` + `editingId`). | opus | L | No | — | One keystroke locates any governed object across tabs/templates/drafts and jumps to it expanded. |
| O7 | **Persisted saved/filtered views** — named presets (tab scope + all/hidden/customized + surface dimension talent-only/workspace-only/archived) in the filter row; remember active preset in `localStorage`. | sonnet | M | No | — | Reviewer reopens straight into "everything awaiting review" without re-filtering. |
| O8 | **Keyboard affordances on the row table** — roving tabindex: j/k move, t/w toggle surfaces, e edit, p preview, / focus search, Esc collapse; reuse existing `onToggleSurface`/`onRowClick`/`onPreview`. | opus | M | No | — | A full tab can be re-gated hands-on-keyboard; matches existing Esc-handler pattern. |
| O9 | **Multi-row edit accordion** — switch `editingId` to a `Set`; group-header expand-all/collapse-all; per-row form state keyed by id. | opus | M | No | — | Several rows' locked/default props stay open side-by-side. |
| O10 | **Unified "All" superset index tab** — first Catalog tab flattening code components + published + draft/in_review templates into one sortable table (Source/Tab/Target/Status/Plan/Customized?), reusing `CatalogRowTable` shell + a facet bar (`loadCatalogAdminView` + `listAllTemplates`). | opus | L | No | — | One screen audits the whole catalog; mis-gated / stuck-in-review items visible at a glance. |

*O2/O5/O6/O8/O9/O10 all touch `component-catalog.tsx` and/or `catalog-row-table.tsx` → heavily SEQUENTIAL. O1/O3/O4/O7 are more disjoint → partial [P]. See conflict map.*

### PHASE 5 — Discoverability & insight (evidence-based curation)
Usage data turns hide/archive guesses into informed decisions. Provenance stamp + usage readers underpin the health dashboard.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| D1 | **Component-type usage counter** — read-only action + Catalog column tallying `BuilderNode.kind` across `cms_pages.blocks`, `cms_sections.props_jsonb`, `cms_builder_components.subtree_jsonb`, `talent_sites.*_snapshot`/`shell_tree` (mirror the `computeDataBindingRequirements` walker). | opus | M | No | — | Each component row shows "used on N tenant pages"; counts match a manual tree audit on a sample. |
| D2 | **Hidden & archived filter + count chips** — "Hidden (N)" / "Archived (N)" chips + clearer treatment in `catalog-row-table.tsx` over already-computed `buildCatalogAdminView` state. | sonnet | S | No | — | One click filters TO suppressed items; counts accurate. |
| D3 | **Surface staged-rollout state in the template list** — per-row "Rollout: 25% / allow 3 / deny 1" chip + "partially rolled out" filter, from `rollout_percentage`/allowlist/denylist already on each row. | sonnet | S | No | — | Canaried vs fully-rolled-out templates distinguishable at a glance. |
| D4 | **Changelog/revision timeline discoverable per template** — inline "v7, changed 2d ago, copy fix" line + one-click expand reusing `template-revision-list.tsx`, no leaving the list. | sonnet | S | No | — | Per-card history + expand without navigation. |
| D5 | **First-class tag & category taxonomy manager** — sub-panel listing distinct tags/categories; bulk rename across all templates in one write; merge duplicates; delete orphans. | sonnet | M | No | — | Renaming a tag updates all templates; merge/delete work; search facets stay clean. |
| D6 | **Where-used / impact preview before hide or archive** — confirm dialog on the status menu showing "used on N live pages; they keep their copy but it leaves the gallery", from D1. | opus | M | No | D1 | Archiving a load-bearing component shows usage before the one-way switch. |
| D7 | **Stamp template provenance on insert + usage tally** — stamp source template id on root node at insert (`insert.ts:121`); new `builder_template_usage` table appended on apply; "applied N times across M tenants" in `template-manager.tsx`. | opus | L | **Yes** | — | New inserts carry provenance; usage rows accumulate; manager shows adoption. |
| D8 | **Catalog health dashboard** — top-of-Catalog strip: orphaned-category templates, connected templates whose `data_binding_requirements` can't be satisfied on target (never appear), published >90d zero-usage, components hidden on one surface not the other. | opus | L | No | D7 | Single triage view lists orphans/unbound/dead-weight/asymmetric rows from data in hand. |

*D2/D3/D4 are pure UI over computed data → [P], contained. D1→D6 and D7→D8 are dependency chains. D5 is disjoint.*

### PHASE 6 — Authoring & templates (raise starter quality)
Make the kit a visual gallery and authoring a confident loop. F1 (slug minting) is the shared prerequisite for import.

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| A1 | **Duplicate-with-rename dialog** — inline rename row (reuse `EditAccordionRow`/`LinkBtn`) prompting title/slug before `duplicateTemplate(id,{title,slug})` (the `overrides` arg already exists, UI never used it); client-side slug-uniqueness check. | sonnet | S | No | F1 | "Editorial — dark" is one deliberate step; picks a unique slug up front. |
| A2 | **Real thumbnails via `thumbnail_asset_id` + MediaPickerDrawer** — add thumbnail cell + "Set thumbnail" to Starter Kit row editor + Template Manager card; opens existing `MediaPickerDrawer`; persists via `updateTemplateDraft({thumbnail_asset_id})`; renders the asset URL. | opus | M | No | — | Kit reads as a visual gallery; chosen thumbnail persists + renders (meets "never placeholder boxes" bar). |
| A3 | **Export template/starter to JSON** — row action serializing portable fields (kind/title/slug/description/category/gallery_tab/target_context/required_plan/tags/theme_tokens/builder_tree/schema_version; **excluding** id/status/version/created_by/published_at/rollout); fetch `builder_tree` via `getTemplateById` for built-ins. | sonnet | S | No | — | `<slug>.template.json` downloads with only portable fields. |
| A4 | **Import template/starter from JSON** — header button; zod-validate against `CreateTemplateDraftInput`; run `computeDataBindingRequirements`; create DRAFT via `createTemplateDraft` with the F1 collision-safe slug helper; reject unknown kinds / oversized trees. | sonnet | M | No | F1, A3 | Round-trips with export; imported slug never unique-violates; bad input rejected with reason. |
| A5 | **Promote a Playground draft to a published starter in one click** — action on the Lab save flow + draft rows: ensure `gallery_tab='page_templates'` + sane `target_context`, run `validateTemplateForPublish`, publish; surface validator reasons inline on failure. | opus | M | No | — | SHAPE-in-Lab → SHIP-as-starter is one click; validation failures shown inline. |
| A6 | **Pre-publish checklist panel** — extend `PublishNotePanel` to call a read-only wrapper over `validateTemplateForPublish` on open, showing pass/fail rows (has content, bindings resolvable, has description, has thumbnail, has changelog); block/warn per row; replaces the raw `window.confirm`. | opus | M | No | A2 (thumbnail row) | Publish shows what's missing *before* shipping, not after failure. |
| A7 | **Template collections/categories grouping** — render Starter Kit (+ optionally Template Manager) as collapsible category sections with counts + category/tag filter bar (reuse Template Manager pill-filter pattern) + category quick-rename. | sonnet | M | No | — | A 30-starter kit browses by intent; quick-rename curates collections. |
| A8 | **Auto-capture thumbnails on publish** — in `publishRowCore`, if `thumbnail_asset_id` null, render through `/template-preview` headlessly, upload PNG, stamp the id; flag-gated, best-effort/non-fatal (mirror the best-effort revision-snapshot insert). | opus | L | No | A2 | Published starters self-populate a faithful thumbnail; failure never blocks publish. High risk — headless capture infra is new; ship last, flag-gated. |

*A3/A4 are an export→import pair. A2→A6/A8 chain on thumbnails. A1 depends on F1. A5/A7 disjoint → [P].*

### Cross-surface stretch (fold into Phase 2/3 when reached)

| ID | Task | Agent | Effort | Migration | Depends-on | Acceptance check |
|---|---|---|---|---|---|---|
| X7 | **Per-surface rollout admission diff** — for a selected template, evaluate `templateRolloutAllowed` against a sample/entered tenant id per surface; show "talent profile: admitted via 60% bucket / workspace page: denied — denylisted". | opus | M | No | X5 | Per-surface real reach of a staged rollout is auditable before assuming "published = everyone". |
| X8 | **Per-surface preview-subject parity** — extend `BuilderLabComponentPreview` to accept the target surface and build the matching config (`buildTalentPageBuilderConfig`/`buildCmsPageBuilderConfig`/`buildSiteShellBuilderConfig`) with a `PreviewSubjectPicker`-selected subject, so preview hydrates as that surface actually does. | opus | L | No | F5 | A connected card previews against the real surface's `previewSubjectKind`, not just the Lab subject. |

---

## Autonomous execution protocol

**Order:** run phases in sequence 1 → 6 (leverage order). Within a phase, dispatch all **[P]** tasks to parallel agents; serialize **[S]** tasks that share a hot file. Phase 1 must fully land (and merge to `main`) before Phase 2's data-model rewrites, because X4/X6 build on the post-fix overlay state and the unified UI foundation.

**Commit-before-gate rule (mandatory, recurring lesson):** each agent commits its work *before* running the tsc/lint/test gate. Agent deaths mid-gate are recoverable only if the work is already committed. Gate, then amend/fixup if needed, then push the feature branch.

**Per-task lifecycle:**
1. `git fetch origin && git switch -c <type>/builder-lab-<id> origin/main` (never switch in the shared checkout — `git worktree list` first; a per-lane worktree usually exists).
2. If the task carries a migration: `date -u +%Y%m%d%H%M%S` → band ≥ `20261105000000`; write migration; apply via `db:push`, falling back to Supabase-MCP `execute_sql` + manual `schema_migrations` ledger row on drift; regen types.
3. Implement, reusing the listed existing actions/columns/UI. Add a unit test to `test:builder`/`test:builder-chrome` where logic is testable.
4. Commit.
5. Gate: `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint && npm run test:builder && npm run test:builder-chrome`.
6. Push branch, open PR to `main`.

**Integration + live-QA loop:** after a phase's PRs are green, the integrator FF-merges (no force-push to `main`), then deploys and runs `cd web && npm run deploy:smoke`. Live-QA the Lab as `orantene` on a seeded host (`impronta.tulala.digital`) — the audit's standing rule: merged ≠ live-working (PWA shipped 404 on all assets despite merging). Specifically re-run the audit's failure cases each phase: duplicate-twice (F1), template preview (F2/F5), the 4-surface matrix truth (X1/X4), bulk re-gate + undo (O2/O5/G7).

**Conflict map — these files are HOT; never let two agents edit one concurrently:**
- `web/src/components/builder-lab/ui.tsx` — F6, F7 (foundation; everything consumes it). Freeze during F6/F7.
- `web/src/components/builder-lab/catalog-row-table.tsx` — X1, X3, O2, O8, D2, D3, D6. Serialize hard; this is the busiest file.
- `web/src/components/builder-lab/component-catalog.tsx` — O2, O5, O6, O7, O8, O9, O10, X6. Serialize; the unified-index (O10) and search (O6) are the biggest rewrites — land them last in Phase 4 so smaller edits don't repeatedly rebase.
- `web/src/components/builder-lab/builder-lab-stage.tsx` — F8, A5. Serialize.
- `web/src/lib/site-admin/builder-core/templates/catalog-overlay-actions.ts` — X3, X4, G1, G2, G7, O1. Serialize the writers.
- `web/src/lib/site-admin/builder-core/templates/registry-actions.ts` — F1, G1, G3, G4, G5, A4, A5. Serialize.
- `web/src/lib/site-admin/add-gallery/registry-db-merge.ts` — X1, X4, X6, D1. Serialize the read-path edits.

**Where to start:** Phase 1, tasks **F1** (sonnet, isolated, unblocks A1/A4) and **F2 + F5** (opus, preview infra) in parallel — disjoint files, all known-bug closures. Hold F6/F7/F8 until F1–F5 merge, then run the UX sub-batch serialized on `ui.tsx`/`builder-lab-stage.tsx`. Then Phase 2 starting with the cheap read-only truth views **X1/X2** before the **X4/X6** migrations.

---

## Migration register

All in repo-root `supabase/migrations/`, band ≥ `20261106000000`, one unique timestamp per task, applied via `db:push` → Supabase-MCP fallback. Latest applied band is `20261105000000` (#612, the shell CHECK), so the new range is clear.

| Task | Migration purpose | Band / notes |
|---|---|---|
| X4 | Add `talent_profile_enabled`, `talent_shell_enabled`, `workspace_page_enabled`, `workspace_shell_enabled` to `builder_catalog_overlay`; backfill from existing `talent_enabled`/`workspace_enabled` losslessly. | `20261106xxxxxx` |
| X6 | Add `lab_enabled` to `builder_catalog_overlay`. | separate band `20261106xxxxxx` (distinct from X4 — coordinate, both touch same table) |
| G1 | New `builder_lab_audit` table (item_ref, before/after JSON, actor, ts). | `20261106xxxxxx` |
| G4 | Add `submitted_by/submitted_at/reviewed_by/reviewed_at/review_note` to `builder_templates`. | `20261106xxxxxx` |
| G7 | Per-row overlay snapshots — reuses/extends the G1 `builder_lab_audit` table; no separate table unless schema diverges. | shares G1; only new band if a dedicated snapshot table is needed |
| G8 | Add `rollout_ramp_to`, `rollout_ramp_at`, `status_expire_at` to `builder_templates`; cron registration. | `20261106xxxxxx` |
| D7 | New `builder_template_usage` table (template_id, tenant_id, surface, page_ref, inserted_at). | `20261106xxxxxx` |

All other tasks are **no-migration** — they reuse existing columns (`availability_override`, `rollout_percentage`, `tenant_allowlist/denylist`, `thumbnail_asset_id`, `category`, `tags[]`), existing actions, and `localStorage`.
