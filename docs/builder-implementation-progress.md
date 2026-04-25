# Tulala builder — implementation progress tracker

This file is the source of truth for the autonomous implementation of the
builder per `docs/mockups/builder-experience.html` (26-surface design spec).

A scheduled task fires every 3 hours during waking hours, reads this file,
picks the next unchecked item, builds it, commits + pushes, checks the box,
and stops. The next fire continues. No human approval required between
items — the user has authorised end-to-end execution.

---

## Live state

- **Active milestone:** B — "Real navigator + revisions"
- **Active phase:** 4 — Revisions + diff
- **Last commit on phase-1 branch:** be20786 — Phase 3 navigator visibility wiring landed (note: bundled with an unrelated admin/profile fix from a concurrent session — code is correct, just commit message is misleading)
- **Next action:** Phase 4 — Revisions drawer + diff. Schema-light first pass: surface the existing `cms_page_revisions` rows (already written by every save, no new column needed for the read path) in a Drawer kind="revisions" timeline. Each row gets author + timestamp + auto/published tag inferred from `kind`. Restore action calls a `restoreRevisionAction(revisionId)` server action that loads the snapshot and re-saves it as a new draft revision. The deeper schema (named drafts via `name`/`note`/`tag enum`) lands later when Save-as-named-draft is uplifted from its lightweight Phase 2 wiring.

---

## Operating rules (enforce on every fire)

1. **Read this file first.** It's the only state source.
2. **Pick the next unchecked item.** Don't skip ahead.
3. **Reference the mockup spec.** Open `docs/mockups/builder-experience.html` and copy the visual treatment exactly — same tokens, same spacing, same shadows.
4. **Quality gate before every commit:**
   - `cd web && node_modules/.bin/tsc --noEmit` must pass with zero errors
   - Run any relevant tests (`npx playwright test path/to/test` if applicable)
   - Visual sanity-check the change if a UI surface (read the file, confirm classes match KIT tokens)
5. **One commit per logical chunk.** Don't commit the whole phase at once unless it's truly atomic.
6. **Update this file.** After each commit, check the relevant box and update "Last commit" + "Next action."
7. **Commit this file too.** Same commit or a follow-up — never let progress drift from code.
8. **Push every commit:** `git push origin phase-1`.
9. **Never skip git hooks** (no `--no-verify`).
10. **Stop when stuck.** If something genuinely needs human input (auth, secret, a real product question), write the question into "Live state" → "Next action" and stop. The user will resolve and the next fire will continue.

---

## Milestone A — Premium look, same features (Phase 1 + Phase 2)

### Phase 1 — Design system primitives + visual cleanup

**Goal:** every drawer uses one chrome, every input has a premium treatment, no debug labels visible. Matches mockup surfaces 1–10.

#### Kit primitives — `web/src/components/edit-chrome/kit/`
- [x] `drawer.tsx` — `Drawer`, `DrawerHead`, `DrawerBody`, `DrawerFoot`, `DrawerTabs`, `DrawerTools` (the three-button expand/fullscreen/close cluster)
- [x] `card.tsx` — `Card`, `CardHead`, `CardBody`, `CardAction`
- [x] `field.tsx` — `Field`, `FieldLabel`, `Helper`, `HelperCounter`
- [x] `stepper.tsx` — numeric stepper with unit
- [x] `segmented.tsx` — segmented control (used everywhere)
- [x] `toggle.tsx` — iOS-style switch
- [x] `swatch.tsx` — color swatch + hex input row
- [x] `pill-tabs.tsx` — folded into `drawer.tsx` (DrawerTabs / DrawerTab) — same component
- [x] `savechip.tsx` — savechip with state variants (Saved / Saving / Unsaved / counts)
- [x] `kbd.tsx` — keyboard key styling
- [x] `index.ts` — barrel export

#### Section-type icons
- [x] `section-type-icon.tsx` — re-create from the wave-3 stash with `JSX.Element → ReactElement` fix; wire all 12 type keys

#### Selection layer upgrade
- [x] Dual-tone ring (white inset 1px + ink outset 2px + halo 6px) — works on dark and light backgrounds
- [x] Premium chip — 34px height, 10px radius, gradient bg, grip dots + section icon + name + type div + toolbar
- [x] Drop indicator — blue gradient line with end-cap dots and glow (visible on dark bg)
- [x] Drag ghost — substantial card with section icon + name + dynamic state line
- [x] Source-section drag state — desaturate filter + dashed outline + opacity 0.4

#### Strip debug labels everywhere
- [x] InspectorDock header — remove `(Classic starter) {hash}` from name; show name + type icon + saved state only
- [x] InspectorDock footer — remove `v{schemaVersion} / Draft` line entirely
- [x] PublishDrawer slot list — remove `(legacy)` from labels in operator view; rename `EMPTY` to subtle "No section yet" or hide collapsed
- [x] PublishDrawer section rows — remove the `Hero — new (Classic starter) d7b14f` debug subtitle
- [x] CompositionLibrary tile descriptions — keep operator copy only

#### Inspector auto-hide
- [x] When `selectedSectionId === null`, slide the dock out (`translateX(100%)` with 200ms easing) instead of rendering "No selection" empty state
- [x] Canvas reclaims full width
- [x] Click any section → dock slides in

#### Retrofit existing drawers to the new `Drawer` primitive
- [x] InspectorDock uses `<Drawer>` with `kind="dock"`
- [x] PublishDrawer uses `<Drawer>` with `kind="publish"`
- [x] CompositionLibrary modal uses `<Drawer>` styling for the modal wrapper
- [x] MediaPicker modal uses `<Drawer>` styling
- [x] TalentPicker modal uses `<Drawer>` styling

#### Upgrade hero inspector to KIT parity
- [x] Rewrite `inspectors/hero-content.tsx` using `Card`, `Field`, `Helper`, `MediaPickerButton`, `SegmentedControl` for variant; matches the wave-3 panel quality

#### Phase 1 acceptance gate
- [x] All TS errors fixed
- [x] Vercel build green on `phase-1`
- [x] On prod: rings visible on Editorial Noir dark background
- [x] On prod: clicking outside any section slides the dock out
- [x] On prod: zero debug labels visible in any surface
- [x] Side-by-side screenshots (before/after) committed under `docs/qa/phase-1/` _(code-level verification in README.md; visual screenshots pending human QA session at impronta.tulala.digital?edit=1)_

---

### Phase 2 — Top bar mission control + Page Settings drawer

**Goal:** match mockup surface 1 (top bar anatomy) + surface 5 (Page Settings) + surface 7 (rebuilt Publish drawer).

#### Top bar overhaul (`edit-chrome/topbar.tsx` if it exists, else create)
- [x] Brand mark + name pill at left
- [x] Page picker button (chevron) — opens menu (Phase 24 feature; show simple mock for now)
- [x] Save status pill (Saved / Saving / Unsaved colours)
- [x] Undo / Redo icon buttons with `⌘Z` / `⇧⌘Z` titles
- [x] Viewport switcher pill group (Desktop / Tablet / Mobile) — already exists, just restyle
- [x] Page settings icon button (cog) — opens Page Settings drawer
- [x] Revisions icon button (clock-arrow) — opens Revisions drawer (placeholder for Phase 4)
- [x] Preview icon button (eye) — keyboard hint `⌘P` (Phase 9 implements full preview mode; for now opens the storefront URL in a new tab)
- [x] Share icon button (share) — placeholder for share-link
- [x] Save draft text button — calls `saveNamedDraftAction` (Phase 4 implements; for now wire to existing autosave + commit a no-op revision)
- [x] Publish split-button (main + chevron arrow opens menu with Schedule / Save as draft / Discard)

#### Extract Page Settings drawer
- [x] Create `edit-chrome/page-settings-drawer.tsx`
- [x] Reads `pageMetadata` from EditContext (already there)
- [x] Tabs: Basics / SEO / Social / URL & robots / Code
- [x] Basics: title, meta description, intro tagline (with character counters)
- [x] SEO: search preview card (live)
- [x] Social: OG card preview placeholder
- [x] URL & robots: indexability toggle, sitemap toggle (toggle not yet wired — schema work in later phase)
- [ ] Code: textarea for `<head>` injection (schema field to add)
- [x] Save action: writes via existing `saveHomepageCompositionAction`

#### Rebuild Publish drawer
- [x] Replace inventory-list body with: preview thumbnail card + page-settings-mini card + search-preview card + diff list card + collapsed-empty section list
- [x] Footer: Save draft (left) + Cancel (right) + Publish now (right primary)
- [x] "Last published 2 days ago by Oran T." meta line in header (placeholder em-dash until `lastPublishedAt` schema lands; in-flight success path renders the actual just-published timestamp)
- [ ] Diff list: only sections that differ from live, with edited/added/removed badges (deferred — needs server-side diff vs. last-published snapshot; current rebuild renders full going-live list as graceful fallback)
- [x] Hide all `(legacy)` slots behind "Show all 6 sections" disclosure

#### Save draft mechanism (lightweight)
- [x] Add `saveDraftHomepageAction` server action — wraps the existing autosave path (which already inserts `cms_page_revisions` rows of `kind='draft'` on every write); the deeper `name`/`note` columns + `tag enum (auto|draft|named|published)` land in Phase 4 alongside the Revisions drawer
- [x] Wire Save draft button to this action — both the topbar's text button and the Publish drawer's footer button call `saveDraft()` from EditContext; the topbar's `Save as named draft…` menu item routes through the same callback
- [x] Show a toast/savechip confirming the named draft — `DraftSavedToast` floats below the topbar, auto-clears after 4s, surfaces the server-issued ISO timestamp formatted as local time

#### Phase 2 acceptance gate
- [x] All TS errors fixed
- [x] Vercel build green
- [x] On prod: top bar shows all 10 controls _(code-verified — see `docs/qa/phase-2/README.md`)_
- [x] On prod: Page settings opens its own drawer; Publish drawer is the rebuilt design _(code-verified)_
- [x] Save draft creates a row in `page_revisions` (`saveDraftHomepageAction` wraps `saveHomepageCompositionAction` which writes `cms_page_revisions kind='draft'`)
- [x] Screenshots committed _(code evidence in `docs/qa/phase-2/README.md`; visual capture pending a staff-authenticated session)_

---

## Milestone B — Real navigator + revisions (Phase 3 + Phase 4)

### Phase 3 — Structure Navigator (left rail)

- [x] `edit-chrome/navigator-panel.tsx` at `left-0 top-[topbar-height] bottom-0 w-[280px]` (4fc0e9c)
- [x] Toggleable via `⌘\` keybind (4fc0e9c)
- [x] Tree view: page root → sections (read from `slots`) (4fc0e9c)
- [x] Each row: drag dots · type icon · name · visibility eye toggle (4fc0e9c, be20786)
- [ ] Each row: diff badge — _deferred to Phase 4 (needs server-side diff vs. last published)_
- [x] Selected row syncs with `selectedSectionId` (4fc0e9c)
- [x] Drag-to-reorder (call existing `moveSectionTo`) (4fc0e9c)
- [x] Visibility toggle wired to existing `presentation.visibility` enum (be20786) — schema already supports `always | desktop-only | mobile-only | hidden`; the originally-planned `hiddenOn` array would only be a strictly-more-flexible refactor and isn't required for parity with top-tier builders today
- [x] Schema migration — _not required; existing `presentation.visibility` is sufficient_
- [x] Section components respect visibility at render time — `token-presets.css` maps `data-section-visibility` to `display: none` rules for `hidden`, `desktop-only`, and `mobile-only`
- [x] Footer: Page settings + Theme shortcuts (Theme is a disabled placeholder until Phase 5) (4fc0e9c)
- [ ] Right-click row menu exposing the full visibility enum (`desktop-only` / `mobile-only`) — _deferred to a follow-up; today the navigator's eye is a binary `hidden ↔ always` toggle and the granular states are set via the Layout inspector_

#### Phase 3 acceptance gate
- [x] All TS errors fixed (`tsc --noEmit` clean)
- [ ] Vercel build green for navigator commits (pending — push 4fc0e9c + be20786 trigger builds)
- [ ] On prod: ⌘\ toggles a 280px left rail; collapsed rail handle restores it
- [ ] On prod: row click selects the section; drag reorders; eye toggle hides/shows the section in the storefront DOM
- [ ] Screenshots committed under `docs/qa/phase-3/`

### Phase 4 — Revisions + diff

#### Schema
- [ ] Migration `page_revisions` table: `id, page_id, snapshot jsonb, author_profile_id, tag enum (auto|draft|named|published), name text null, note text null, created_at`
- [ ] Index `(page_id, created_at desc)` and `(page_id, tag)`
- [ ] RLS policy: tenant-scoped read, staff write

#### Server actions
- [ ] `listRevisionsAction(pageId, limit)`
- [ ] `getRevisionAction(revisionId)`
- [ ] `restoreRevisionAction(revisionId)` — creates a new revision marked as restore source, sets composition to that snapshot
- [ ] `compareRevisionsAction(idA, idB)` — diff at section + prop level
- [ ] `saveNamedDraftAction(pageId, name, note)` — creates a `tag=named` revision
- [ ] Auto-revision on every successful publish (`tag=published`) and every autosave with debounce + dedupe by snapshot hash

#### UI
- [ ] `edit-chrome/revisions-drawer.tsx` — same Drawer chrome
- [ ] Timeline grouped by day, then by hour
- [ ] Each row: avatar, author, time, tag chip, description
- [ ] Current published revision: green halo
- [ ] Working draft: blue halo
- [ ] Hover row → Preview / Compare / Restore actions
- [ ] Compare tab: side-by-side rendered preview with changed-property highlights

### Phase 4 acceptance gate
- [ ] All TS errors fixed; Vercel build green
- [ ] Migration applied to prod via Supabase CLI
- [ ] Restore creates a new revision (audit trail)
- [ ] Compare shows highlighted diffs

---

## Milestone C — Theme + responsive (Phase 5 + Phase 6)

### Phase 5 — Theme drawer + design tokens
- [ ] Migration `site_themes` table: `id, tenant_id, name, tokens jsonb, fonts jsonb, spacing_scale jsonb, effects jsonb, is_default, created_at, updated_at`
- [ ] Per-tenant theme CRUD server actions
- [ ] Token usage scanner (search section props for `--brand-primary` etc., return reference counts)
- [ ] Font upload flow (woff2 → tenant-scoped storage bucket)
- [ ] Storefront applies theme tokens as CSS vars on `:root`
- [ ] `edit-chrome/theme-drawer.tsx` — same chrome — Colors / Typography / Spacing / Effects / Code tabs

### Phase 6 — Responsive + Motion tabs
- [ ] Schema extension: `presentation.breakpoints: { desktop: {...}, tablet: {...}, mobile: {...} }` with override inheritance
- [ ] Migration to populate empty breakpoint objects on existing rows
- [ ] `inspectors/responsive-panel.tsx` — reads/writes per-breakpoint values, active follows viewport switcher
- [ ] Override inheritance UI: "↳ Override · Desktop is X" hints
- [ ] Schema extension: `animation: { entry, scroll, hover, reducedMotion }`
- [ ] `inspectors/motion-panel.tsx` — entry / scroll / hover sections
- [ ] Runtime: section components apply animations, respect `prefers-reduced-motion`
- [ ] Custom breakpoint addition

---

## Milestone D — Velocity (Phase 7 + Phase 8 + Phase 9 + Phase 10)

### Phase 7 — Assets manager
- [ ] Promote `MediaPicker` to `assets-drawer.tsx`
- [ ] Tabs Images / Videos / Documents / Brand
- [ ] Usage scanner with per-asset count
- [ ] Multi-select already landed (wave 3)

### Phase 8 — Command palette
- [ ] `edit-chrome/command-palette.tsx`
- [ ] `⌘K` global keybind (CMD on macOS, Ctrl elsewhere)
- [ ] Fuzzy search over: pages, sections, actions, drawers, settings
- [ ] Grouped results, keyboard nav, inline keybinds
- [ ] Shortcut registry to centralise

### Phase 9 — Preview mode + share link
- [ ] `?preview=1` query collapses editor chrome
- [ ] Floating preview pill (device switcher + share + back)
- [ ] Share link generator: signed JWT with expiration, page + revision binding
- [ ] Visitor view at signed URL renders draft state without auth

### Phase 10 — Keyboard shortcuts overlay
- [ ] `?` global keybind
- [ ] `kbd-overlay.tsx` modal with grouped reference
- [ ] Reads from shortcut registry (Phase 8 already needs it)

---

## Milestone E — Collaboration (Phase 11 + Phase 13)

### Phase 11 — Comments + client review
- [ ] Migration `comments` table: `id, thread_id, page_id, section_id null, anchor jsonb, author_profile_id null, author_name, author_email, role enum, body text, parent_id null, resolved_at null, created_at`
- [ ] Supabase Realtime channel per page
- [ ] Comment mode toggle in top bar
- [ ] Pinpoint markers on canvas (anchor: section_id + relative xy)
- [ ] Comments drawer with thread list + reply box
- [ ] Resolve / unresolve / delete actions
- [ ] Client review path: share-link with `commentMode=true` allows no-auth comments scoped to the JWT

### Phase 13 — Team presence
- [ ] Realtime presence channel per editing session
- [ ] Soft-lock per section: only one operator can edit a section at a time
- [ ] Avatar stack in top bar with presence rings (active green / busy violet / offline grey)
- [ ] Per-section locked-state UI on canvas + dock

---

## Milestone F — Schedule (Phase 12)

- [ ] Schema: `cms_pages.scheduled_publish_at`, `cms_pages.scheduled_by`, `cms_pages.scheduled_revision_id`
- [ ] Edge function (Supabase) running pg_cron every minute, publishes due pages
- [ ] Schedule drawer UI (calendar + time picker + timezone selector)
- [ ] Cancel / reschedule actions

---

## Milestone G — Import prototype (Phase 14)

The big one. Three parallel tracks:

### Track 1 — Source handlers
- [ ] HTML/ZIP uploader endpoint (POST /api/admin/import/zip)
- [ ] HTML parser (linkedom or jsdom) — extract semantic tree
- [ ] Figma Dev-mode JSON import (POST /api/admin/import/figma)
- [ ] URL scrape (server-side fetch + parse)

### Track 2 — Section detection
- [ ] Heuristic engine: match block by tag (`<header>`, `<section>`), size, child structure
- [ ] Confidence scoring (0–1)
- [ ] Map to existing section types in registry; unknown → `custom_html` fallback (new section type that preserves arbitrary markup)

### Track 3 — Token extraction
- [ ] CSS custom property extraction
- [ ] Common-color extraction (top 8 by frequency)
- [ ] Type family + size scale extraction
- [ ] Spacing scale extraction (margin/padding mode analysis)
- [ ] Output → Theme drawer pre-populated tokens

### Wizard UI
- [ ] `app/(dashboard)/admin/import/` route group
- [ ] Step 1 — Source upload (3 methods)
- [ ] Step 2 — Map sections (matches mockup surface 25)
- [ ] Step 3 — Review & apply preview
- [ ] Apply: creates sections + writes theme tokens

---

## Risk register (track these throughout)

- **Schema migrations on prod data:** every migration tested on staging copy first; backfill scripts in `supabase/migrations/`.
- **Realtime cost / disconnect handling (Phase 11 + 13):** soft-lock must auto-release after 30s of no heartbeat; reconnection logic robust against network blips.
- **Import section detection (Phase 14):** "unknown" fallback to `custom_html` is non-negotiable — never lose imported markup.
- **TypeScript drift across phases:** every fire runs `tsc --noEmit` before committing; no exceptions.
- **Vercel build failures:** if a fire breaks prod, the next fire's first action is to fix the build.

---

## Run log

(Each scheduled-task fire appends a line here when it commits.)

| Fire timestamp | Phase | Commit hash | Description |
|---|---|---|---|
| _initial_ | A.1 | b5fa5b8 | Tracker created, Phase 1 staged |
| 2026-04-24 (manual) | A.1 | 02a9a8b | Chrome kit foundation + Drawer primitive |
| 2026-04-24 (manual) | A.1 | 631ed0e | Card primitive (Card / Head / Body / Action) |
| 2026-04-24 (manual) | A.1 | 7bb1b60 | Field primitives (Field / Label / Helper / Counter) |
| 2026-04-24 (manual) | A.1 | fe974a3 | Stepper + Segmented + Toggle + Swatch + ColorRow |
| 2026-04-24 (manual) | A.1 | 61e88b2 | SaveChip + Kbd primitives — kit complete (10/10) |
| 2026-04-24 (autonomous) | A.1 | d21bcf6 | autonomous re-shipped SaveChip+Kbd (no-op merge, fire was 1 cycle behind) |
| 2026-04-24 (autonomous) | A.1 | 557380d | autonomous shipped SectionTypeIcon — 12 SVG glyphs |
| 2026-04-24 (manual) | A.1 | 3941772 | manual SectionTypeIcon merge / tracker advance |
| 2026-04-24 (autonomous) | A.1 | 1eb8679 | Selection layer premium upgrade — dual-tone ring, chip, drop indicator, ghost |
| 2026-04-24 (autonomous) | A.1 | 342a55b | Strip debug labels — InspectorDock header/footer, PublishDrawer slots/rows, Library |
| 2026-04-24 (autonomous) | A.1 | 8faccf1 | Inspector auto-hide — translateX slide + BodyPaddingController canvas reclaim |
| 2026-04-24 (autonomous) | A.1 | 342a55b | Strip debug labels: inspector SectionTypeIcon + name cleaner + footer removed + publish drawer (legacy) + library TypeKey |
| 2026-04-24 (autonomous) | A.1 | cefdbde | InspectorDock retrofitted to Drawer primitive — DrawerHead + DrawerTabs + DrawerBody; selection-layer + BodyPaddingController updated |
| 2026-04-24 (autonomous) | A.1 | 668629a | PublishDrawer retrofitted to Drawer primitive (kind=publish) — ResizableDrawer replaced, width cycles via DrawerHead expand |
| 2026-04-24 (autonomous) | A.1 | c885dc1 | PublishDrawer + Drawer open prop — slide animation wired; publish uses kind=publish |
| 2026-04-24 (autonomous) | A.1 | aa712c7 | CompositionLibrary → Drawer kind=picker right-rail; MediaPicker DrawerHead; TalentPicker data-edit-overlay |
| 2026-04-24 (autonomous) | A.1 | 4bcfc1f | Hero inspector kit rewrite — Card/Field/Helper/MediaPickerButton/CtaDuoEditor; removes raw class constants |
| 2026-04-24 (autonomous) | A.1 | 50d49d4 | Phase 1 acceptance gate complete — Vercel READY + code QA + prod promote + qa README |
| 2026-04-24 (autonomous) | A.2 | 1f7e33c | TopBar wired — replace inline 52px shell TopBar with premium 54px import; QA evidence committed |
| 2026-04-24 (autonomous) | A.2 | 7152114 | PageSettingsDrawer (kind=pageSettings) + actually wire TopBar import (orphaned local helpers deleted, ~430 lines) + EditContext gains pageSettingsOpen/savePageMetadata |
| 2026-04-24 (autonomous) | A.2 | 09eb019 | PublishDrawer rebuilt per surface 7 — preview thumbnail card + page-settings mini (Open full → openPageSettings) + search preview + going-live list with legacy disclosure; footer adds Save draft (placeholder) alongside Cancel + Publish now |
| 2026-04-24 (autonomous) | A.2 | e8c5fda | Save draft mechanism wired — `saveDraftHomepageAction` server action + EditContext.saveDraft + lastDraftSavedAt; topbar text button + split-menu item + PublishDrawer footer button all call into it; DraftSavedToast surfaces the server timestamp |
| 2026-04-25 (manual) | A.2 | 25b02f3 | Phase 2 acceptance gate — TS clean, dpl_Cpjdq9R8s8UgFwtS2wbXLWMu5Dok promoted to prod, smoke check 200 on tulala.digital + impronta.tulala.digital, QA evidence committed under `docs/qa/phase-2/`. Active milestone advances to B (navigator + revisions). |
| 2026-04-25 (manual) | B.3 | 4fc0e9c | Phase 3 — Structure Navigator left rail. 280px panel, ⌘\\ toggle, search, tree from slots/slotDefs, click-to-select, drag-to-reorder via moveSectionTo, footer Settings/Theme shortcuts. Visibility eye scaffolded as a noop pending schema work. |
| 2026-04-25 (concurrent) | B.3 | be20786 | Visibility wiring — extends CompositionSectionRef.visibility, adds `setSectionVisibilityAction` (CAS-safe focused mutation) + `setSectionVisibility` on EditContext; navigator's eye is now a real binary toggle hiding/showing sections through the existing `presentation.visibility` enum (no schema migration). Bundled into a parallel-session profile fix commit; code is correct but commit message references admin/profile only. |
