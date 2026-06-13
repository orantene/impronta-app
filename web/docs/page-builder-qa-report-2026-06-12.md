# Page Builder — Full QA Sweep Report (2026-06-12)

**Tester:** QA agent (Claude) driving Google Chrome
**Build under test:** `origin/main` @ `a067c4605b126b431635e308c0f66fd2eafafd4e`
**Environment:** isolated worktree `/Users/oranpersonal/Desktop/impronta-qa-wt`, dev server `localhost:3330`, `NEXT_PUBLIC_BUILDER_PRESENCE=1`
**Signed in as:** `qa-admin@impronta.test` (super_admin)
**Max talent for talent tests:** `TAL-92001` (tulum-talent-sofia@impronta.test)

---

## Findings

### F1 · [A/B — Add Gallery] "Page Templates" tab is MISSING from the Add Gallery
- **What's broken:** The Add Gallery panel shows only four tabs — **Layout · Elements · Sections · Connected**. The spec (page-builder-platform-plan WS4) and QA checklist Check 2 both require a fifth **"Page Templates"** tab where published `builder_templates` (page-target) are inserted as re-minted freeform nodes.
- **Repro:** Builder Lab → pick talent → Open editor → click **Add** (left rail) → observe the tab row.
- **Expected:** Tabs include "Page Templates" (or templates surface somewhere in the gallery).
- **Actual:** No "Page Templates" tab. DB check: `builder_templates` is **empty (0 rows)**, so the tab is almost certainly hidden when there are no published page templates. Re-verified via the template-publish lifecycle below (see F-Templates).
- **Severity:** Minor / by-design (empty-state hide). Only a real defect if the tab fails to appear AFTER a page template is published — tracked in the lifecycle test.
- **Console:** none for this item.

### F2 · [A/B — Add Gallery] React "duplicate key" errors when gallery section/element previews render
- **What's broken:** Opening the Add Gallery (Sections/Elements previews) throws repeated React `Encountered two children with the same key` errors. Keys collide: `para-0`, `para-1`, `button`. Next.js dev overlay shows "3 Issues".
- **Repro:** Builder Lab editor → Add → Sections tab (and Elements). Watch console / dev overlay.
- **Expected:** Zero console errors; gallery preview thumbnails use unique keys.
- **Actual:** 5+ duplicate-key errors fired. The miniature section/element preview renderer uses index/role-based keys (`para-0`, `button`) that are not unique across multiple preview cards.
- **Severity:** Minor (dev warning; risk of mis-rendered/duplicated/omitted preview children, but no user-facing break observed).
- **Console:**
  ```
  Encountered two children with the same key, `para-0`. ...
  Encountered two children with the same key, `para-1`. ...
  Encountered two children with the same key, `button`. ...
  ```

### F3 · [A — Builder Lab / Talent Lab] **Inserted nodes never render on the canvas — Lab canvas stays blank**
- **What's broken:** In the Builder Lab editor, inserting a section (or any node) adds it to the draft and the Layers tree, but the **canvas never paints the node**. The canvas shows only the lab page shell ("Builder Lab" heading + "Talent: Sofía Herrera" chip) and stays blank no matter what you add. Visual editing is impossible — you can't see what you're building.
- **Repro:**
  1. `/platform/admin/builder-lab` → Talent Lab → pick TAL-92001 (Sofía Herrera) → Open editor.
  2. Add → Sections → Hero → "Hero Centered" → click to insert. Toast: "Draft saved · … Live preview can lag a moment after inserts".
  3. Wait, dismiss toast, interact — canvas remains blank.
  4. Open Page Structure → Layers: the node IS there (Container → Intro Text, Title, Description, Button Group), fully editable with layer controls.
  5. Toggle Preview (eye): canvas still blank.
- **Expected:** The inserted Hero section renders on the canvas (hydrated with Sofía's data per the Lab's stated purpose), repainting in place.
- **Actual:** Canvas renders **zero** builder nodes. DOM probe with panels closed: `document.querySelectorAll('[data-builder-node-id]').length === 0`; no `[data-theme-canvas-root]`; no storefront element. The composition exists in the draft (Layers shows it; nodes have real ids e.g. `container-d37a4e2f…`, `heading-95183ba3…`, `cta_group-ceff0f47…`) but the canvas component isn't mounting/rendering it. Preview mode also blank.
- **Severity:** **Blocker** for the Builder Lab surface (the headline super_admin authoring tool is unusable for visual work). NOTE: server logs show no render error — failure is client-side and silent.
- **Console:** No new exception beyond the duplicate-key warnings (F2). The render simply produces nothing.

### F4 · [E — Talent Max page-builder] **Empty talent page is permanently un-editable — every insert blocked "This page is still loading"**
- **What's broken:** A Max talent opening `/talent/page-builder` with no existing page (the normal first-time state) gets a builder where **every** insert/mutation is rejected with the toast "BUILDER CHANGE BLOCKED — This page is still loading — try again in a moment." The state never clears (waited >30s, retried repeatedly). The talent cannot create their first page at all.
- **Repro:**
  1. Dev-signin as a Max talent with no `talent_pages` row (TAL-92001 / tulum-talent-sofia@impronta.test). `next=/talent/page-builder`.
  2. Editor mounts, canvas blank (expected — empty homepage).
  3. Add → Sections → Hero → "Hero Centered" → click. Toast: "BUILDER CHANGE BLOCKED — This page is still loading."
  4. Wait 30s+, retry — same block every time.
- **Expected:** First insert creates the page and renders the section.
- **Actual:** Permanent block. **Root cause (code-confirmed):** `dispatchMutation` (and the other mutation paths) early-return this error when `pageVersionRef.current === null` (`edit-context.tsx:4580/4610/4690/4819/5079/5444/7332/7431`). `pageVersion` is seeded only from `initialComposition?.pageVersion ?? null` (`edit-context.tsx:2363`) and otherwise set only by `applyComposition(data.pageVersion)`. For a talent surface with no existing page row, `initialComposition.pageVersion` is null and nothing establishes an initial version on mount, so it stays null forever → all mutations blocked.
- **Severity:** **Blocker** — the entire Talent Max page-builder is unusable for any talent who hasn't already got a page (i.e. all of them, since `talent_pages` is empty in this DB). DOM probe confirms `data-builder-node-id` count 0, no iframe, no `data-theme-canvas-root`.
- **Console:** duplicate-key warnings (F2) carried over (20+); no other exception.

### F5 · [E — Talent Max page-builder] Talent surface has no Theme drawer (only Brand)
- **What's broken / NOTE:** The talent editor left rail exposes **Brand** but no **Theme** entry (the platform/Builder-Lab rail has both Brand and Theme). The theme cascade (GAP A/B, #3b inherit-override) is therefore not reachable from the talent surface. May be by design (talent inherits tenant theme), but it means the per-node Inherit/Override toggle (#3b) and live token reactivity (GAP A) cannot be exercised by a talent. Flagging for confirmation, not asserting a defect.
- **Severity:** Minor / needs-design-confirmation.

### F6 · [D — Workspace page builder] Inserted nodes save to DB but **do not render on the embedded builder canvas**
- **What's broken:** Same blank-canvas symptom as F3, on the workspace `/[tenant]/admin/website` → New page → builder. Insert "Hero Centered": the toast confirms "Draft saved", the node persists to `workspace_pages.blocks` (DB-verified: 1745-char array with the Hero container), but the editor canvas renders **zero** nodes (`data-builder-node-id` count 0). Re-opening the saved draft via Edit still shows a blank canvas. Setting `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1` (prod value) and restarting did **not** fix it.
- **Repro:** `/impronta/admin/website` → New page → Add → Sections → Hero Centered → wait. Canvas blank; DB row populated.
- **Expected:** Canvas renders the inserted Hero (with theme), editable in place.
- **Actual:** Blank canvas; data layer fine.
- **Severity:** **Blocker** for the workspace page builder (can't see what you build). Shares root with F3 — see "Cross-cutting analysis" below.
- **Console:** clean on this surface (duplicate-key F2 only when the Add gallery is open).

---

## Cross-cutting analysis — the blank-canvas pattern (F3 / F4 / F6)

The freeform builder canvas **renders correctly on the homepage editor** (`/impronta?edit=1`, opened via Website → "Edit homepage" in a new tab): full storefront content paints, nodes are selectable, the text toolbar + capability panels work, presence avatars appear, **zero console errors**. That surface loads the real storefront URL with `?edit=1` and overlays the editor.

The three blank-canvas surfaces (Builder **Lab**, **Workspace** page builder, **Talent** builder) mount the editor **without a storefront page render underneath** — the editor chrome appears over empty space and `data-builder-node-id` count stays 0 even though the draft is saved. So:
- **Data + render-engine + theme cascade all work** (proven on the homepage editor and via DB writes).
- **What's broken is the canvas host** for the non-homepage freeform surfaces — they don't render the composition you're editing, making them unusable for visual work in this dev environment.
- Setting the prod `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1` did not change it, so it's not (solely) that flag.

CAVEAT: tested on `next dev` (Turbopack), not a production build. Memory notes prior **live** QA on prod (improntamodels.com) and "in the Builder Lab editor" succeeded, so a production build may host these canvases differently. This needs confirmation against a prod build before fixing — but as it stands, a developer/operator running these surfaces locally (or anyone who hit the same condition in prod) sees an unusable blank canvas.

---

### F7 · [B — Editor chrome] Publish-options dropdown opens **off-screen to the right** — menu invisible/unclickable
- **What's broken:** Clicking the Publish caret ("Publish options") toggles `aria-expanded` and the menu mounts with all 7 items, but it renders at **x≈1468–1708 on a 1530px-wide viewport** (`position:absolute`, left-aligned to a right-edge trigger), so it overflows the right viewport edge and the visible sliver is hidden behind the right inspector rail. The user sees nothing.
- **Repro:** Homepage editor (`/impronta?edit=1`) at ~1530px window → click the chevron next to **Publish** → no menu appears on screen.
- **Expected:** Menu opens right-aligned (align "end") and fully on-screen.
- **Actual:** Menu is in the DOM (`role=menu`, 7 `menuitem`s: Save draft, Preview, Schedule publish…, Revision history, Page settings, Duplicate page, Unpublish/Archive — confirmed via DOM probe; visibility:visible, opacity:1) but positioned off the right edge → not visible or clickable by mouse.
- **Severity:** **Major** — Revision history, Page settings, Schedule, Duplicate page, and Unpublish/Archive are reachable ONLY through this menu, so they're effectively inaccessible at this (common laptop) width. (Save and Preview have separate always-visible controls.)
- **Caveat:** Width-dependent — a wider window or a narrower right rail may let it fit; the fix is right-alignment/viewport-flip, not the actions themselves. The menu CONTENT is correct and complete (named-draft + discard correctly absent, per spec).
- **Console:** none.

## Verified WORKING

- **[A] Builder Lab** loads with Talent Lab / Workspace Lab / Templates tabs; super_admin gated; talent picker populates with real names/codes; search (debounced) works; preview-subject selection + "Open editor" works.
- **[A] Talent Lab insert** produces editable freeform nodes (Container → Intro Text/Title/Description/Button Group) with real ids + full layer controls (Navigator/Page Structure). Layers, Outline, Classes sub-tabs present.
- **[B] Add Gallery** tabs Layout / Elements / Sections / Connected all render; Sections categories (Hero/About/Services/Gallery/Featured Talent/Talent Roster/Testimonials/CTA/FAQ/Contact); Connected categories (Talent/Agency/Directory/Booking & Inquiry/Dynamic Data).
- **[B] Link guard** — clicking a nav link in edit mode shows "Links are disabled while editing. Exit edit mode to navigate."
- **[C / #3b] Theme-inheritance inspector panel** (homepage editor): heading shows exactly Text color / Font / Text size, each "Inherit · Theme: …", with Inherit|Override toggles. Override seeds the resolved literal and **repaints the heading color live on canvas**; Inherit reverts live ("Rendering…"). Round-trip clean, autosaved. Responsive Desktop/Tablet/Mobile rail + "Hide on this device" present.
- **[C / GAP A] Live theme reactivity** (homepage editor): changing Brand Primary `#0F0F0F → #E11D48` instantly repainted the "Explore talent" button + "Start an inquiry" link on canvas — **no Publish, no reload**. "Discard changes" reverts live.
- **[C / GAP B] Theme drawer Components tab** present: per-kind defaults (Headings / Body text / Buttons) with "Inherit (theme default)" token-bind dropdowns + custom color; copy reads "Changes preview on the canvas live — Save draft, then Publish theme".
- **[C] Theme drawer** loads (Studio Minimal v131) with Colors / Typography / Layout / Effects / Components / Code tabs; Brand + Editorial palettes.
- **[F] Homepage editor canvas renders + is responsive-aware**; presence avatars render top-right; zero console errors on this surface.
- **[H] Homepage** (curated cms_page_sections path) renders normally in the editor — not visibly broken (note: this tenant's draft contains obvious test/garbled copy like "Talent agencysss", "Your hssseadline ssss…" — that is pre-existing seed data, not a builder defect).
- **[B] Publish dropdown CONTENT** — all 7 items present and correct: Save draft (⌘S) · Preview · Schedule publish… · Revision history · Page settings · Duplicate page · Unpublish/Archive. Named-draft + Discard correctly removed. (The menu's off-screen positioning is the F7 bug; the items themselves are right.)
- **[B] Asset Library** opens (All / Images / Videos / Documents / Brand tabs, search, Select + Upload).
- **[F] Responsive device toggles** — Desktop/Tablet/Mobile switch the canvas frame (Mobile = 390px, hamburger nav, stacked CTAs) with a "mobile editing — edits scope to mobile" banner + a publish "CHECKS / advisories" panel.
- **[F] Multiplayer presence** (flag `NEXT_PUBLIC_BUILDER_PRESENCE=1`) — opening the homepage editor in a 2nd tab shows dual session avatars in the topbar + the banner "You have this page open in another tab — edits there can conflict." Per-tab session keying works.
- **[E] Talent Max gating** — a Max talent (`talent_portfolio`) lands directly in the editor, no upsell (correct). (Non-Max upsell path NOT tested — see env notes.)
- **Editor mount** — no "cannot access before initialization" / circular-dependency runtime error observed (the `makeId` extraction is clean); editor chrome (left rail Search/Add/All Pages/Page Structure/Page Settings/Assets/Brand/Theme/Help; right rail Layout/Content/Style/Data/Motion) mounts on every surface.

---

## Summary — counts by severity

| Severity | Count | IDs |
|---|---|---|
| **Blocker** | 3 | F3 (Lab canvas blank), F4 (talent empty-page blocked), F6 (workspace canvas blank) |
| **Major** | 1 | F7 (Publish menu off-screen) |
| **Minor** | 3 | F2 (duplicate React keys), F1 (Page Templates tab empty-hide), F5 (talent no Theme drawer) |
| **Polish** | 0 | — |

> F3 and F6 share one root cause (the non-homepage freeform surfaces don't host a storefront canvas render); see "Cross-cutting analysis". They carry a real dev-vs-prod-build caveat. F4 is an env-independent logic bug (`pageVersion === null` is never resolved for a never-created page).

## Environment notes

- **Commit under test:** `origin/main` @ `a067c4605b126b431635e308c0f66fd2eafafd4e` ("refactor(directory): split field-driven-filters into seam modules (#357)").
- **Setup:** isolated worktree `/Users/oranpersonal/Desktop/impronta-qa-wt`, real `npm install`, `.env.local` copied from the main checkout. Dev server `next dev` (Turbopack) on `localhost:3330`. Added `NEXT_PUBLIC_BUILDER_PRESENCE=1` and (mid-run) `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1` to match prod.
- **Note — flags absent from the copied `.env.local`:** neither `NEXT_PUBLIC_BUILDER_PRESENCE` nor `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` was present in the main checkout's `.env.local`, yet memory records both as `=1` in Vercel prod. A dev running QA from the repo's env would NOT have presence or the client canvas on. Worth reconciling the local env template with prod.
- **Accounts:** super_admin `qa-admin@impronta.test`; Max talent `tulum-talent-sofia@impronta.test` (TAL-92001 / Sofía Herrera). Tenant `impronta` (Impronta Models).
- **Tested as `next dev`, not a production build.** The blank-canvas blockers (F3/F6) specifically need re-confirmation against a `next build` / prod deploy before they're treated as prod regressions.

### Not reached / not exercised (and why)
- **Templates lifecycle (Check 6: create draft → submit → publish → unpublish → archive → duplicate → restore)** — not run. `builder_templates` is empty; authoring a template from the Lab is undermined by the F3 blank canvas (you'd save an empty/blind template). This also leaves F1 (does the "Page Templates" tab appear once a page template is published?) formally unconfirmed.
- **Public renders `/p/<slug>` and `/t/<code>/home`** — not exercised. The workspace test page is an unpublished draft and the talent has no page; verifying public render would require **publishing content to a real tenant** (`impronta` → improntamodels.com), which I did not do without explicit permission (out-of-scope side effect).
- **Non-Max talent upsell** — not tested (no non-Max fixture signed in).
- **Multi-select + drag-reorder, code node (sandboxed iframe), repeaters/field-binding, media-library picker insert, Custom CSS / Motion capability editors** — not deep-tested; gated behind first needing a working canvas to see results (F3/F6). Layer reorder controls (up/down/delete) are present in the Navigator.
- **Workspace/Talent public legacy-removal regression** — not verified at the public layer (same publish constraint).

## Cleanup done
- Created one throwaway workspace draft page `/impronta/p/untitled-mqahg6wl` (status=draft, never published) while testing F6. It is harmless (draft, not public) but should be deleted from the `impronta` Website → Pages list. No theme changes were published (Brand-color test was discarded). No `cms_page_sections` writes.

---
---

# Fix Verification Log

> Integration branch `integration/builder-launch-ready`. Gate at log time: **tsc 0 / lint 0 / test:builder 465 pass · 0 fail**. All evidence DOM-measured or DB-queried on `localhost:3330` (prod flags `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS=1`, `NEXT_PUBLIC_BUILDER_PRESENCE=1`).

## Wave 1 — F1–F9 (canvas render, talent first-page, publish menu, gallery keys, templates tab, theme gate)
All FIXED + live-verified in prior sessions (Lanes A–E merged; in-editor `ClientBuilderCanvas` now paints all non-homepage surfaces; talent lazy `ensurePage`; viewport-clamped Publish menu; scoped gallery keys; tab list derived from `galleryPolicy.allowedTabs`; Theme drawer gated on `themeTokens` capability). Retained as history above.

## Wave 2 — Theme Modernization + "no black canvas" (this session)

**Platform default (DB-verified):** `platform_settings.id=true` → `default_theme_preset_slug='modern-2026'`, `color.accent=#0ea5e9`, `color.background=#ffffff`, `color.ink=#111111`, `button.backgroundColor=token:color.accent`. Seed migration `20260612182139_platform_default_theme.sql` applied to remote.

| Acceptance step | Result | Evidence |
|---|---|---|
| **1. New site opens on modern LIGHT default** | ✅ | Fresh talent (theme `{}`) editor canvas: `--token-color-background=#ffffff`, `--token-color-accent=#0ea5e9`, hero buttons `rgb(14,165,233)`, headings ink `#111`. |
| **2. Added elements adopt the theme** | ✅ | Hero H1 ink `#111`, paragraph grey `#6b7280`, CTAs sky-blue white-label 10px-radius — all from the modern preset cascade (no per-node styles). |
| **3. Theme drawer — every tab/control** | ✅ | Drawer light + consistent. New **PAGE BACKGROUND** card (color picker + "white by default" + texture Segmented) at top of Colors; BRAND COLORS (Primary/Secondary/Accent/Neutral) with swatch+hex rows. Tabs: Colors/Typography/Layout/Effects/Components/Code. |
| **4a. Change theme globally — live repaint** | ✅ | Accent `#0EA5E9`→`#E11D48`: `--token-color-accent` + every button repainted to `rgb(225,29,72)` instantly. |
| **4b. Page background control (user's pain point)** | ✅ | Background `#FFFFFF`→`#F0F9FF`: canvas `--token-color-background` + paint → `rgb(240,249,255)` live. The control the user "couldn't find" is now top of Colors and works. |
| **5. Override one component beats theme** | ✅ | H1 font-size override via inline toolbar (default→240px→tidy 86px) while color stayed theme-ink `#111` — per-node override wins over the global token. |
| **6. Public render inherits platform default** | ✅ | Live `/t/TAL-92001/home` (unthemed talent): shell `rgb(255,255,255)`, accent `#0ea5e9`, buttons `rgb(14,165,233)`, H1 ink `#111`. Falls back to modern light, NOT the host's black. |
| **7. Impronta stays black** | ✅ (structural) | 3 chrome commits touch only editor-chrome wrappers; no public storefront paint, no Impronta theme, no existing-tenant data. Platform default seeds only NEW/empty rows. |

## "Lighten everything" — builder chrome (this session, 3 commits)

The editor chrome (topbar/rails/panels) already used the light `CHROME` palette; the dark came from **wrapper screens** hardcoding `#0E0E11`/`#16161A`. Fixed:

| Commit | Surface | Before → After (DOM-verified) |
|---|---|---|
| `b9c26f154` | Talent builder | desk `rgb(14,14,17)`→`rgb(249,249,251)`; exit strip `rgb(22,22,26)`→`rgb(250,249,246)`; non-Max upsell dark→light. **0 dark blocks ≥200×30 in viewport.** |
| `c51d59fb6` | Builder Lab stage | header-bridge `#16161A`→`CHROME.paper`; PreviewSubjectChip dark→`CHROME.muted/green` (also fixed an invisible near-white chip in the light topbar). Lab canvas `rgb(255,255,255)`, 0 dark blocks; surrounding super-admin dashboard intentionally kept dark per user. |
| (prior) | Canvas region | `min-height:100vh` + `var(--token-color-background)` paint so a short page fills light to the bottom. |

## Follow-ups / honest residual notes
- **Agency public header is dark on Sofía's page — verified CORRECT, not a defect.** The public header is the *agency's* shared `PublicHeader`, scoped to the managing tenant (Impronta = black brand), so it follows Impronta's dark background mode. The registry token `shell.header-bg` defaults to `""` = "follow the active background mode"; the modern preset uses `background.mode:plain` + white, so a **fresh modern-default tenant gets a LIGHT header automatically**. No preset header token should be added — that would override the correct follow-the-bg behavior. Sofía looks dark only because she is hosted under a dark-brand agency.
- **Publish CAS conflict during QA** was self-inflicted (direct SQL `theme={}` reset bumped the row under the open editor) — not a product bug; the app's own publish checks passed.
- **QA fixture state:** TAL-92001 (Sofía) left with `theme={}` (renders modern light) — fine as a fixture; clean at ship if desired.
- Deferred Wave-1 sweep tail (repeaters/field-binding deep test, media-library picker insert, multi-select/drag depth, public `/p/`) unchanged from above.

---

## Wave 3 — Talent media picker (live-verified)

**Feature:** Max talents pick their OWN photos in the builder image picker, split into portfolio vs uploads. New `/api/talent/media/library` (talent-self / managing-staff auth) + `listTalentScopedMediaLibrary` + isolated `BuilderMediaScopeProvider` (keeps `edit-context.tsx` untouched) + talent mode in `media-picker-drawer.tsx`.

**Bug caught by local QA (would have shipped broken):** the new route 404'd because `proxy.ts` host-gates app-host paths via `APP_API_PREFIXES` (surface-allow-list.ts), which lacked `/api/talent`. Added it. `proxy.ts` runs in prod too, so this would have 404'd live — exactly why local verification before merge mattered.

**Live evidence (Sofía TAL-92001, seeded 4 demo assets + 2 portfolio links + 1 existing = 5):**
- Endpoint `GET /api/talent/media/library` → `{ok:true, items:5, portfolioAssetIds:[2]}`.
- Picker source tabs: **All my photos 5 · My portfolio 2 (On your profile) · My uploads 3 (Your media)** — DOM-verified counts.
- Per-tile badges: `[Portfolio, Portfolio, Mine, Mine, Mine]` (2 portfolio, 3 mine).
- "My portfolio" filter → 2 tiles, both Portfolio-badged.
- Picking a photo → picker closes, canvas `<img>` src updates to the picked URL (`picsum.photos/seed/sofiaportfolio1`).
- Console clean (only dev info logs).
- **Workspace picker** structurally unchanged: talent tabs gate on `talentProfileId` (only the talent mount provides it via `BuilderMediaScopeProvider`); no provider → null → agency-library path, byte-identical. tsc-confirmed.

**Gate:** tsc 0 / lint 0 / surface-allow-list 11 pass / test:builder 465 pass. No migration.

**QA artifacts (remove at ship):** 4 `media_assets` + 2 `agency_talent_media` rows tagged `metadata.source='qa-media-seed'` on Sofía; one throwaway image section in Sofía's *draft* (unpublished).
