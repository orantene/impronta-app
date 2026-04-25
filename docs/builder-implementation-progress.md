# Tulala builder — implementation progress tracker

This file is the source of truth for the autonomous implementation of the
builder per `docs/mockups/builder-experience.html` (26-surface design spec).

A scheduled task fires every 3 hours during waking hours, reads this file,
picks the next unchecked item, builds it, commits + pushes, checks the box,
and stops. The next fire continues. No human approval required between
items — the user has authorised end-to-end execution.

---

## Live state

- **Active milestone:** A — "Premium look, same features"
- **Active phase:** 1 — Design system primitives + visual cleanup
- **Last commit on phase-1 branch:** _pending_
- **Next action:** Begin selection-layer upgrade — dual-tone ring + premium chip with section-type icon (mockup surface 2).

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
- [ ] Dual-tone ring (white inset 1px + ink outset 2px + halo 6px) — works on dark and light backgrounds
- [ ] Premium chip — 34px height, 10px radius, gradient bg, grip dots + section icon + name + type div + toolbar
- [ ] Drop indicator — blue gradient line with end-cap dots and glow (visible on dark bg)
- [ ] Drag ghost — substantial card with section icon + name + dynamic state line
- [ ] Source-section drag state — desaturate filter + dashed outline + opacity 0.4

#### Strip debug labels everywhere
- [ ] InspectorDock header — remove `(Classic starter) {hash}` from name; show name + type icon + saved state only
- [ ] InspectorDock footer — remove `v{schemaVersion} / Draft` line entirely
- [ ] PublishDrawer slot list — remove `(legacy)` from labels in operator view; rename `EMPTY` to subtle "No section yet" or hide collapsed
- [ ] PublishDrawer section rows — remove the `Hero — new (Classic starter) d7b14f` debug subtitle
- [ ] CompositionLibrary tile descriptions — keep operator copy only

#### Inspector auto-hide
- [ ] When `selectedSectionId === null`, slide the dock out (`translateX(100%)` with 200ms easing) instead of rendering "No selection" empty state
- [ ] Canvas reclaims full width
- [ ] Click any section → dock slides in

#### Retrofit existing drawers to the new `Drawer` primitive
- [ ] InspectorDock uses `<Drawer>` with `kind="dock"`
- [ ] PublishDrawer uses `<Drawer>` with `kind="publish"`
- [ ] CompositionLibrary modal uses `<Drawer>` styling for the modal wrapper
- [ ] MediaPicker modal uses `<Drawer>` styling
- [ ] TalentPicker modal uses `<Drawer>` styling

#### Upgrade hero inspector to KIT parity
- [ ] Rewrite `inspectors/hero-content.tsx` using `Card`, `Field`, `Helper`, `MediaPickerButton`, `SegmentedControl` for variant; matches the wave-3 panel quality

#### Phase 1 acceptance gate
- [ ] All TS errors fixed
- [ ] Vercel build green on `phase-1`
- [ ] On prod: rings visible on Editorial Noir dark background
- [ ] On prod: clicking outside any section slides the dock out
- [ ] On prod: zero debug labels visible in any surface
- [ ] Side-by-side screenshots (before/after) committed under `docs/qa/phase-1/`

---

### Phase 2 — Top bar mission control + Page Settings drawer

**Goal:** match mockup surface 1 (top bar anatomy) + surface 5 (Page Settings) + surface 7 (rebuilt Publish drawer).

#### Top bar overhaul (`edit-chrome/topbar.tsx` if it exists, else create)
- [ ] Brand mark + name pill at left
- [ ] Page picker button (chevron) — opens menu (Phase 24 feature; show simple mock for now)
- [ ] Save status pill (Saved / Saving / Unsaved colours)
- [ ] Undo / Redo icon buttons with `⌘Z` / `⇧⌘Z` titles
- [ ] Viewport switcher pill group (Desktop / Tablet / Mobile) — already exists, just restyle
- [ ] Page settings icon button (cog) — opens Page Settings drawer
- [ ] Revisions icon button (clock-arrow) — opens Revisions drawer (placeholder for Phase 4)
- [ ] Preview icon button (eye) — keyboard hint `⌘P` (Phase 9 implements full preview mode; for now opens the storefront URL in a new tab)
- [ ] Share icon button (share) — placeholder for share-link
- [ ] Save draft text button — calls `saveNamedDraftAction` (Phase 4 implements; for now wire to existing autosave + commit a no-op revision)
- [ ] Publish split-button (main + chevron arrow opens menu with Schedule / Save as draft / Discard)

#### Extract Page Settings drawer
- [ ] Create `edit-chrome/page-settings-drawer.tsx`
- [ ] Reads `pageMetadata` from EditContext (already there)
- [ ] Tabs: Basics / SEO / Social / URL & robots / Code
- [ ] Basics: title, meta description, intro tagline (with character counters)
- [ ] SEO: search preview card (live)
- [ ] Social: OG card preview placeholder
- [ ] URL & robots: indexability toggle, sitemap toggle (toggle not yet wired — schema work in later phase)
- [ ] Code: textarea for `<head>` injection (schema field to add)
- [ ] Save action: writes via existing `saveHomepageCompositionAction`

#### Rebuild Publish drawer
- [ ] Replace inventory-list body with: preview thumbnail card + page-settings-mini card + search-preview card + diff list card + collapsed-empty section list
- [ ] Footer: Save draft (left) + Cancel (right) + Publish now (right primary)
- [ ] "Last published 2 days ago by Oran T." meta line in header
- [ ] Diff list: only sections that differ from live, with edited/added/removed badges
- [ ] Hide all `(legacy)` slots behind "Show all 6 sections" disclosure

#### Save draft mechanism (lightweight)
- [ ] Add `saveNamedDraftAction(name, note?)` server action — creates a tagged composition snapshot row in a `page_revisions` table (schema migration)
- [ ] Wire Save draft button to this action
- [ ] Show a toast/savechip confirming the named draft

#### Phase 2 acceptance gate
- [ ] All TS errors fixed
- [ ] Vercel build green
- [ ] On prod: top bar shows all 10 controls
- [ ] On prod: Page settings opens its own drawer; Publish drawer is the rebuilt design
- [ ] Save draft creates a row in `page_revisions`
- [ ] Screenshots committed

---

## Milestone B — Real navigator + revisions (Phase 3 + Phase 4)

### Phase 3 — Structure Navigator (left rail)

- [ ] `edit-chrome/navigator-panel.tsx` at `left-0 top-[topbar-height] bottom-0 w-[280px]`
- [ ] Toggleable via `⌘\` keybind
- [ ] Tree view: page root → sections (read from `slots`)
- [ ] Each row: drag dots · type icon · name · diff badge · visibility eye toggle
- [ ] Selected row syncs with `selectedSectionId`
- [ ] Drag-to-reorder (call existing `moveSectionTo`)
- [ ] Visibility toggle → schema extension `presentation.hiddenOn: ("desktop"|"tablet"|"mobile")[]`
- [ ] Schema migration for `hiddenOn`
- [ ] Section components respect `hiddenOn` at render time
- [ ] Footer: Page settings + Theme shortcuts

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
| 2026-04-24 (manual) | A.1 | _pending_ | SectionTypeIcon — 12 SVG glyphs |
