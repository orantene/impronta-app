# Impronta "Noir & Or" Hero Slider + Premium Header — Build Plan & Findings

Branch: `feat/noir-hero-header` (off `main`). Source-of-truth design: `web/public/impronta-mockup-3/`
(handoff docs `01-design-spec.md`, `02-developer-prompt.md`, `03-placeholder-images.md`).

This doc is the validated plan (corrected against the live code by a multi-agent audit) plus the
findings surfaced while building Part A. Owner reviews everything as a DRAFT before any publish/merge.

---

## Owner decisions (locked)
1. **Header scope:** build the full freeform left/center/right regions now (not variant-presets-first).
2. **Talent brand source:** prop-override seed (no migration) — pass talent logo/social/contact into
   `site_header` props so the agency-scoped DB reads are skipped.
3. **Default palette:** Noir & Or defaults on the *new components* only; existing talent sites are not
   force-changed.
4. **Locked look:** ship fully unlocked (prop-lock support is built but nothing is locked by default).
5. Talent header reuses the existing `editorial-split` layout (no net-new variant) for v1.

---

## Architecture (validated)
- One `BuilderNode` discriminated-union system (`builder-node/types.ts`) + Zod registry
  (`registry.ts`) + server renderer (`render.tsx`, emits markup + a scoped `<style>`), a thin
  `"use client"` carousel island (`carousel.tsx`), and a hand-authored per-kind inspector
  (`inspectors/builder-node-content.tsx`).
- The rich header is a CMS **section** (`sections/site_header/`) rendered through
  `PublishedShell.renderShellSlot`, gated by `site-shell-flag.ts`. Talent Max sites render a
  *separate, bare* shell (`render-max-site.tsx`) and the talent allowlist
  (`site-kind-allowlist.ts`) blocks `site_header`/`site_footer`.
- Theming is enum-data-attr driven: `background.mode` → `data-token-background-mode` on `<html>`
  re-pins every `--token-color-*`. Adding palettes = adding enum values + token blocks (no new
  mechanism). Per-prop locking lives in `builder-node/prop-lock.ts` (`lockedProps: string[]`).
- **Part A** extends the existing `carousel` node (no new kind). **Part B** reuses `site_header` on
  talent sites and builds the genuine gaps (scroll-to-solid lever, freeform regions, responsive policy).

## Corrections to the handoff docs (from verification)
- `BuilderCarouselNode` is at **types.ts:625** (doc said ~605); `carouselPropsSchema` at
  **registry.ts:432**; carousel children allow-list at **registry.ts:941-956**.
- Carousel render `case "carousel"` at **render.tsx:3261** (doc said ~3092); carousel CSS at
  **661-667** base / **849** tablet / **955** mobile (doc's 624/808/912 were stale).
- Bare talent `<header data-talent-max-site-header>` at **render-max-site.tsx:461-471** (doc said
  319-329).
- `autoplayMs`/`loop` existed on the type+schema but were **dead** (emitted as inert data-attrs only).
- **Scroll-to-solid already exists** elsewhere (5 bespoke talent templates + marketing header use a
  `.scrolled` class at `scrollY>40`). The net-new piece is the `data-scrolled` attribute +
  `scrollTone`/`scrollThresholdPx` schema lever in the builder header path.
- **Header count-badge and phone `tel:` already exist** in `site_header`
  (`EditorialSplitActions.tsx` badge; `contactLinkSchema type:"phone"`). The only genuinely-missing
  header feature is explicit **left/center/right freeform regions**.
- Header brand/social/contact resolvers are **agency-tenant-scoped** (`Component.tsx:447-504`) — the
  brand mis-scope risk on talent sites; mitigated by the prop-override seed (decision 2).
- **Composition-preset route is NOT viable for a carousel hero** (`rootKind` excludes carousel) — the
  Hero Slider tile uses the **section-template route** (`buildAddGallerySectionTemplate`).

---

## Part A — Hero Slider — DONE (commits `c2cd28d35`, `94b62166f`)
Extended `carousel` with `variant:"rail"|"hero"` + full lever set (height, overlay scrim/tone/
vignette/strength, grain, transition+ms, Ken Burns+amount, autoplay/loop/pauseOnHover, controls
dots/arrows/progress/counter/scrollCue, contentAlign, contentMode per-slide|shared, sharedContent).
Wired real autoplay/crossfade/Ken Burns/reduced-motion in `carousel.tsx`. Tokenized hero CSS ported
1:1 from the mockup. "Hero Slider" gallery tile (section-template) + full inspector branch. QA'd on
the impronta storefront render: full-screen photo + scrim + gold "imprint." + CTAs + scroll cue.

### Part A findings (carried into Part B + go-live)
- **F1 — demo images were untracked.** `/talent-templates/demo/model/` was `??` in git despite the
  doc calling it "committed." Committed the `model/` set (12 imgs) so seeded defaults always render.
- **F2 — hero slides must eager-load.** Lazy slides flashed black on crossfade. The hero render now
  forces `priority` (eager) on image slides; the seed sets it too. Apply the same to any media-bearing
  slide pattern in Part B mobile menus / shells.
- **F3 — the Builder Lab catalog "Preview" pane does NOT load the builder runtime `<style>`**
  (`BuilderNodeRendererStyles`); it only has global token CSS. So carousel/hero/header runtime CSS is
  invisible there. **Review on a rendered page** (insert on a storefront / talent site), not the Lab
  catalog Preview. The scoped sheet (`buildScopedRendererCss`) keeps `.site-bn-hero__*` (no kind
  token → base/always-kept) and `.site-builder-node--carousel[...="hero"]` (carousel present) on the
  published render — verified present (82 KB sheet) on the storefront.
- **F4 — worktree setup.** `git worktree` does not copy gitignored files: `node_modules` (run
  `npm ci`; a symlink is rejected by Turbopack) and `.env.local` (copy it, or every route 404s on the
  host gate). Both done for `/Users/oranpersonal/Desktop/impronta-noir`.

### Part B findings (from the render-path mapping — change the WF-3 approach)
- **F5 — freeform render returns `null` for `kind:"section"`** (`render.tsx:3163-3166`). So a
  `site_header` landmark dropped into the talent shell tree renders **nothing** through the normal
  freeform path. WF-3 therefore needs a **dedicated render port** in `render-max-site.tsx` that
  intercepts shell roots with `sectionTypeKey:"site_header"`/`"site_footer"` and invokes
  `getSectionType(key).Component` directly (porting `PublishedShell.renderShellSlot:206-407`), then
  renders the landmark's freeform `children`. Do NOT route through `isSiteShellEnabledForTenant`
  (agency flag) and handle the missing-snapshot fallback inline.
- **F6 — `site_header`/`site_footer` are shell-only (`visibleToAgency:false`)** and must NOT go in
  `TALENT_PERSONAL_SECTION_TYPE_KEYS` — that list is the *addable page-section* allowlist, and
  `site-kind-allowlist.test.ts` enforces "every talent-allowlisted key is agency-addable." The shell
  landmark is **seeded + rendered via the port**, never picker-filtered, so the allowlist needs no
  change (verified: the freeform shell render path calls no `sectionAllowedForSiteKind`).
- **F7 — `BuilderSectionNode.props` has no field for inline section config.** The agency model keeps
  the `SiteHeaderV1` config in the shell snapshot (`slot.props`), separate from the builder node.
  ARCHITECTURE CHOICE for the editable talent header: add an optional
  `sectionProps?: Record<string, unknown>` to `BuilderSectionNode.props` (+ Zod) so the talent shell
  landmark carries its `SiteHeaderV1` config inline and self-contained (the render port reads it; the
  WF-5 inspector edits it). Lower-risk + freeform-compatible vs. wiring a `cms_sections` instance for
  every talent. Recommended.
- **Status:**
  - **WF-3 BUILT** (commits `6bcb6a678`, `187b5b7a6`, `66a16a426`): `sectionProps` on the section
    node; `buildDefaultShellTree` seeds a schema-valid `site_header` landmark (talent-scoped brand →
    agency reads skipped); `renderShellRoot` port in `render-max-site.tsx` renders it via the bespoke
    Component (no duplicate `<header>`, no agency flag path); `HeaderScrollObserver` + `[data-scrolled]`
    token CSS for scroll-to-solid. tsc + lint clean; 8/8 default-tree tests (incl. SiteHeaderV1
    validity). **Visual QA pending** — needs a talent site whose `shell_tree` carries the landmark
    (new provisions get it; existing sites keep their saved shell). Direct prod-DB seeding was denied,
    so visual QA needs either owner-granted prod read/seed of one talent DRAFT shell (QA + restore) or
    provisioning/viewing a new talent Max site.
  - **WF-4 BUILT** (commit on branch): registered `noir-or` (default), `espresso`, `atelier-blanc`
    `background.mode` palettes + a token-presets block each (re-pinning `--token-color-*` incl.
    `primary`). The hero + header render any palette by selection. tsc + lint clean. (Deferred: a
    `data-scroll-tone` emit on the Component + an `inquiryAction` toggle — the scroll-to-solid already
    works via the observer + `[data-scrolled]` CSS.)
  - **WF-5 ENGINE BUILT** (commit `065c97e29`): `regions {left,center,right}` schema + `headerItem`
    union (wordmark/logo/nav/language/cta/social/phone/inquiry/saved/spacer) with per-breakpoint
    responsive (show/label/icon/hide/menu) + priority; a self-contained `data-variant="freeform"`
    render path (classic variants untouched) with a pure-CSS hamburger → full-screen mobile menu;
    live count badge for inquiry/saved (client island); theme-tokenized CSS; ClusterIcon extracted +
    inquiry/saved icons. The **talent default header is now seeded as freeform regions** (brand · nav ·
    language/social/phone/saved/inquiry/cta, collapsing to a hamburger on mobile). tsc + lint clean;
    24/24 tests; a 10-item L/C/R config validates against SiteHeaderV1.
  - **WF-5 FOLLOW-UPS (documented):**
    1. **Inspector regions editor** — a Regions tab in `SiteHeaderInspector` (add/remove/reorder items
       per region + per-item responsive). `patchSection({regions})` already exists; this is a bounded
       UI build. Note it edits the AGENCY `site_header`; the talent header is composed via the seed.
    2. **Talent-shell editable surface** — to let the owner drop header items in/out for a TALENT site
       via the builder, the talent `shell_tree` must load as an editable builder surface (today the
       talent header config lives in the landmark `sectionProps`, edited only via the seed). Separate
       architectural lift.
  - **End-to-end header QA (blocked locally):** the talent header renders only on a site whose
    `shell_tree` carries the landmark (new provisions get it). Direct prod-DB seeding was denied and
    no talent slug is queryable locally, so live visual QA must happen on the **Vercel preview** (PR
    #643): provision/view a talent Max site, set `background.mode=noir-or`, screenshot the header
    (transparent → scroll-to-solid), hero, palettes, and mobile hamburger. The hero (Part A) is fully
    QA-proven in the real builder (add/change/swap/swipe + Builder Lab catalog).

---

## Part B — Premium header (next)

### WF-3 — reuse `site_header` on talent sites + render port + brand re-scope
- `sections/talent-personal-section-keys.ts` — add `"site_header"`/`"site_footer"` to the talent
  allowlist (flips the gate at `site-kind-allowlist.ts:42-44`).
- `talent-site/server/default-max-site-trees.ts` (`buildDefaultShellTree`) — seed the header/footer as
  `site_header`/`site_footer` landmark section nodes (mirror `buildSlimShellSectionNode`), with talent
  brand/social/contact passed via props (decision 2), `variant:"editorial-split"`,
  `tone:"transparent"`, `scrollTone:"solid"`.
- `talent-site/server/render-max-site.tsx:461-471` — replace the bare `<header>` with a shared
  `renderHeaderLandmark` helper (extracted from `PublishedShell.renderShellSlot`) that renders the
  `site_header` Component then appends its freeform children — WITHOUT the agency `site-shell-flag`
  path (handle the missing-snapshot fallback explicitly).
- `sections/site_header/Component.tsx` — ensure talent props short-circuit the agency DB reads.

### WF-4 — scroll-to-solid + 3 palettes
- `sections/site_header/schema.ts` — add `scrollTone` + `scrollThresholdPx`; add an `inquiryAction`
  visibility toggle (count value stays runtime). Phone `tel:` already supported.
- New `sections/site_header/HeaderScrollObserver.tsx` (`"use client"`) — toggles `data-scrolled` on
  the header at `scrollY > threshold`; SSR-safe; no `type` re-exports (client-island 500 hazard).
- `app/token-presets.css` — `[data-scrolled="true"]` solid-bar rule + register `noir-or` (default),
  `espresso`, `atelier-blanc` palettes (mirror `editorial-noir`); register the enum in
  `tokens/registry.ts` + `tokens/resolve.ts`. No `!important`.

### WF-5 — freeform L/C/R regions + intelligent responsive + final QA
- `sections/site_header/schema.ts` — `regions:{left,center,right}` of a `headerItem` union (wordmark/
  imageLogo/navLinks/langToggle/cta/social/savedAction/inquiryAction/phone/spacer), each with a
  per-breakpoint `responsive` map (`label|icon|hide|menu`) + `priority`.
- Component + inspector — render regions; per-item per-breakpoint show-label/icon-only/hide/
  move-into-menu; priority + overflow → hamburger full-screen menu (drawer already exists).
- Full authed-browser QA on a talent Max site across breakpoints + all 3 palettes; save DRAFT
  template; prepare PR. Owner runs `publishTemplate` after sign-off.

## Gates / process
- `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` clean +
  `verify:server-actions` + `test:builder`. No migration unless governance columns are added.
- Build/compose in Builder Lab → save DRAFT (`createTemplateDraft`); do NOT `publishTemplate` until
  owner sign-off. PR to `main` only after approval (auto-deploys to prod). Respect
  `prefers-reduced-motion`. Default images = committed `/talent-templates/demo/model/`.

## Risks
Brand mis-scope (mitigated via prop-override); client-island `"use server"`/`type` re-export 500s
(keep islands strictly `"use client"`); stale `web/supabase/migrations` dir; pre-existing field-engine
`localeCompare` crash in the talent layout (don't absorb into scope); flag-bypass null-shell fallback.

## Findings F8–F10 (live QA, 2026-06-20)
- **F8 — Impronta storefront header is the pre-existing `editorial-split` variant, not WF-5 freeform.**
  The storefront supports the rich `site_header` via the per-tenant site-shell flag with NO code
  change (`shouldRenderSnapshotShell` in `PublishedShell.tsx` early-returns `PublishedShellHeader`).
  Enabling it for Impronta (`ENABLE_SITE_SHELL=tenants` + `SITE_SHELL_TENANT_IDS=<impronta id>` in
  `.env.local`) revealed the agency's already-configured editorial-split header (social+phone L /
  wordmark+tagline C / lang+saved+inquiry-count+hamburger R / nav row). The WF-5 **freeform** branch
  fires on `props.regions` being set (Component.tsx:468) regardless of `variant`; Impronta has no
  `regions` → editorial-split. PROD: owner sets the two env vars in Vercel.
- **F9 — sticky bug (FIXED, commit 8b9db8c90).** The shell header renders inside its own wrapper
  (`[data-cms-section]` on agency, `[data-talent-max-site-header]` on talent). `position:sticky` on the
  inner `.site-header` only sticks within that wrapper's header-height box → the bar scrolled away on
  BOTH surfaces. Fix = promote sticky to the wrapper (containing block = the tall page column) via a
  scoped rule in token-presets.css, gated on `.site-header[data-sticky="true"]`. Verified live: header
  pins at top:0 through scroll on /impronta.
- **F10 — agency-path scroll-to-solid not wired.** `HeaderScrollObserver` + the `[data-scrolled]`
  tone rule are scoped to the talent wrapper only. Not visually needed for Impronta (its header is
  tone:surface = already solid). Enhancement for transparent agency headers: mount the observer in
  `renderShellSlot` / make scroll-to-solid self-contained on `.site-header[data-scrolled]`.
