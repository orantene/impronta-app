# Page-builder convergence + completion plan

**Status:** active execution plan. Supersedes ad-hoc megabatches.
**Created:** 2026-04-26. **Updated:** 2026-04-26 with prototype-alignment lens.
**Operating rule:** every commit from this point forward either *finishes a v1 capability* or *removes baggage* — and lands at or above the approved-prototype quality bar. Nothing else.

---

## 0. The single mental model we're committing to

**The product is "edit the live site". Everything else is either a primitive that supports that, or it's gone.**

In practice:

- The canonical editing surface is the storefront with `?edit=1`. The EditShell mounts on top of the real DOM. Sections are selected on the canvas. Inspector is on the right. Publish is in the topbar.
- There is **one** way to compose pages: inline.
- There is **one** way to edit theme: the Theme drawer inside that EditShell.
- There is **one** way to manage publishing: the Publish drawer in that EditShell.
- The dashboard (`/admin/...`) keeps **only** the things that genuinely don't belong on the canvas: workspace settings, billing, member management, integrations, audit log, AI usage. It is no longer a parallel editor.

Anything outside that model is a baggage candidate.

---

## 0.5 The approved prototype is the binding fidelity reference

**Reference artifact.** `docs/mockups/builder-experience.html` — 3,655 lines, 26 numbered surfaces. This is what we approved. It is preserved verbatim and is the single source of truth for what the builder must look and feel like.

**Companion audit.** `web/docs/builder-experience-execution-plan.md` already maps each numbered surface to its current implementation status. Use it as the per-surface scorecard during phase verification. Update it as phases land.

**What this means in practice.**

- Convergence (deleting old surfaces) is necessary but **not sufficient**. A converged product that doesn't match the prototype is still a fail.
- Every phase below has a **Prototype alignment** subsection that lists which numbered surface(s) §1–§26 it must hit. A phase isn't done until the relevant surface(s) read at parity-or-better with the mockup.
- "Parity-or-better" specifically means: layout hierarchy, spacing rhythm, callouts and guidance copy, transitions, and the overall premium feeling. Not pixel-identity — the prototype is a static HTML mockup, the live builder has real data — but lived-experience fidelity.
- Where the prototype is silent (e.g. error states, multi-tenant edge cases), engineering judgment fills the gap, but the gap-filling work must respect the prototype's visual and interaction language.

**Mapping prototype surfaces to phases.**

| Prototype surface | Primary owner phase |
|---|---|
| §1 Top bar | A (cleanup) + B (Pages dropdown lands in F) |
| §2 Inspector five-tab depth | E (visual unification) — already built; needs rhythm pass |
| §3 Style panel | E |
| §4 Responsive panel | E (post-v1 expansion in polish) |
| §5 Page settings drawer | A (kill Code/Templates tabs); F (page binding) |
| §6 Revisions drawer | KEEP — already lands as recovery path |
| §7 Publish drawer | A (preflight wiring of orphan checks) |
| §8 Add section library | **D** — full redesign |
| §9 Drag in progress | E (canvas selection rhythm) |
| §11 Structure navigator | F (pages + structure surface) |
| §12 Theme drawer | A (Advanced disclosure for BrandKitImport / MeshGradient) |
| §13 Assets drawer | KEEP |
| §14 Motion panel | E |
| §15 Comments | post-v1 |
| §16 Compare revisions | post-v1 |
| §17 **Inline text editing** | **C** — WYSIWYG |
| §18 Empty canvas | A (single template-gallery mount) |
| §19 Preview mode | KEEP |
| §20 Command palette | post-v1 (already partially live) |
| §21 Schedule publish | KEEP |
| §22 Team presence | post-v1 |
| §23 Bespoke content panel (featured talent) | E |
| §24 Pages picker | **F** |
| §25 Import from prototype | post-v1 |
| §26 Keyboard shortcuts | KEEP — already live |
| (not in §) Header + footer editing | **B** — beyond the prototype scope; treat as v1 extension |

**Phase B note.** The approved prototype does not depict header/footer editing as a numbered surface — but the prototype's mental model demands it (the prototype shows a real header/footer in every screenshot, and a section-edit flow that would obviously extend to the shell). Phase B implements the *prototype's implied behavior* for header/footer, using the prototype's section-edit interaction language (selection chrome, inspector tabs, drag handles).

**Quality bar — universal.**

For every phase, "done" means all four are true:
1. Old baggage removed (call it out per phase).
2. New capability functional (the engineering ask).
3. Prototype alignment verified against the named surface(s) (the fidelity ask).
4. The phase passes a **lived-experience smoke test** on a real tenant (typically `impronta.tulala.digital`): an operator unfamiliar with the change can complete the relevant flow without confusion, and the result *feels* like the same product depicted in the mockup.

If any of those four is missing, the phase is not done — regardless of what the diff or the test suite says.

---

## 1. Old-surface classification

### REMOVE (delete from the codebase)

- [ ] `/admin/site-settings/sections/*` — section-instance CRUD list + per-section editor page. Redundant with inline section selection. Delete route + `section-editor.tsx` admin variant.
- [ ] `/admin/site-settings/structure/*` — already redirects, but `starter-action.ts` lives here. Move action to `web/src/lib/site-admin/edit-mode/`, delete the route folder.
- [ ] The "Sections" navigator panel non-canvas variant (if present). Canvas IS the navigator.
- [ ] `SiteDarkModeSwitcher` mount on public storefront — keep the file, unmount from `agency-home-storefront.tsx`.
- [ ] `FocusOrderOverlay` mount on public storefront — keep the file, unmount. Move to a future "Tools" panel inside the EditShell.
- [ ] `WorkspaceTemplateGallery` mount inside `EmptyCanvasStarter` — keep one mount only.
- [ ] "Templates" tab inside the page-settings drawer — wrong place.
- [ ] "Code" tab in the page-settings drawer (says "Coming soon") — remove until in scope.
- [ ] Half-mounted AI surfaces with no UI:
  - [ ] `aria-landmark-action.ts` → wire into publish preflight (or delete).
  - [ ] `suggestLayoutImprovement` → wire into publish preflight as optional check (or delete).
  - [ ] `loadAiUsageSummary` → keep action; build dashboard card OR delete (no orphans).
- [ ] `web/src/app/prototypes/admin-shell/*` — dead lint-error files. Delete unless actively used as design references; if so, move to `web/docs/prototypes/`.

### REDIRECT (keep URL, bounce to canonical)

- [ ] `/admin/site-settings/structure` → `${tenant_storefront}/?edit=1`. (Already does this — keep.)
- [ ] `/admin/site-settings/sections` → `${tenant_storefront}/?edit=1&panel=sections`.
- [ ] `/admin/site-settings/pages` → `${tenant_storefront}/?edit=1&panel=pages`.
- [ ] `/admin/site-settings/templates` (if exists) → `${tenant_storefront}/?edit=1&panel=templates`.

EditShell needs to learn the `?panel=` query param so old links open the right drawer.

### DEMOTE (keep, but move out of primary path)

- [ ] Dashboard `/admin` workspace shell — keep for billing/members/integrations/audit/AI-usage/agency-branding. Demote anything touching page composition or section content.
- [ ] Theme drawer `BrandKitImport` — tuck inside an "Advanced" disclosure.
- [ ] `MeshGradientGenerator` — same: Advanced disclosure inside Theme drawer.
- [ ] Per-section custom CSS field (`presentation.customCss`) — behind an "Advanced" toggle in Style tab.
- [ ] Revisions drawer — recovery path, not primary undo. Cmd-Z (post-v1) becomes the primary path.
- [ ] 8 advanced section types out of 43 (Image Orbit, Lottie, Code Snippet, Code Embed, Map Overlay, Donation Form, Magazine Layout, Sticky Scroll) — demote out of the *default* section-add picker. Behind "Advanced sections" filter. Default operators see ~15 sections.

### KEEP (canonical or genuinely shared)

- EditShell, Inspector dock, Topbar, Theme drawer, Publish drawer, Revisions drawer, Schedule drawer.
- Section registry pattern + 43 section types.
- `cms_pages` / `cms_sections` / `cms_page_sections` schema.
- Publish snapshot model (`published_homepage_snapshot`, `published_page_snapshot`).
- Workspace templates table + actions.
- All section schemas and migrations.
- All token/preset CSS.
- AI rewrite per field (NOT the unrelated AI feature flotilla — just per-field rewrite, which is integrated).
- Form-submission endpoint + captcha.
- Multi-tenant guards + audit + RLS.

---

## 2. The single primary builder path

This is the one true flow. Anything that doesn't fit it is a candidate for the buckets above.

| Step | What happens |
|---|---|
| **Entry** | Operator visits tenant's public site (e.g. `impronta.tulala.digital`). If authenticated staff for that tenant → Edit pill in corner. Click → `?edit=1` → EditShell mounts. |
| **Empty case** | No homepage composition yet → `EmptyCanvasStarter` shows. Pick starter → server seeds sections + theme preset → reload in edit mode with content. |
| **Selecting** | Hover any section → outline glow. Click → selected. Inspector dock opens right. Section chrome shows: drag handle, duplicate, delete, "convert to global" (post-shell-edit), AI rewrite. |
| **Editing copy** | Click any text inside selected section → contentEditable engages. Toolbar floats on selection (Bold / Italic / Accent / Link). **Live styling — no raw markers visible.** Markers exist only in storage. |
| **Editing structured props** | Inspector dock. Tabs: Content / Layout / Style / Responsive / Motion. Same five tabs for every section type. |
| **Adding a section** | Hover gap between two sections → "+ Add section". Centered command-palette modal. Categorized: Hero / Trust / Showcase / Story / Convert / Forms / Embed / Footer-shape. Each category 3–6 entries with thumbnail + label + one-line description. "Advanced" toggle reveals the rest. Search field at top. |
| **Reordering** | Hover section → drag handle on left. Drag to reorder. Inside arrays (gallery, FAQ, testimonials) — same drag handle, no up/down buttons. |
| **Header & footer** | Visible on canvas. Selecting them works exactly like sections. Same inspector tabs. Stored as section rows on a `site_shell` row with `slot_key='header'` or `'footer'`. Editing them is the same flow as editing the page body. |
| **Multi-page** | Topbar has "Pages" dropdown next to workspace name. Pick different page → EditShell rebinds to that page's draft composition. Same flow. Header/footer global; only body changes. |
| **Locale** | Top-right of topbar: locale switcher. Default / EN / ES / etc. Switching changes every i18n field's active tab in inspectors. Stored as locale maps. AI translate button in switcher offers "fill missing translations". |
| **Theme** | Theme drawer in topbar. Brand colors, type ramp, density, radii. Brand-kit import + mesh generator inside Advanced disclosure. |
| **Templates** | A "Templates" surface, NOT a tab inside Page Settings. Topbar button. Two views: "My templates" (this workspace) and "Marketplace" (platform-promoted). Real thumbnails (rendered server-side at save time). Apply replaces current page's draft composition. |
| **Publish** | Publish drawer same as today. Preflight: heading lint, contrast, broken links, ARIA landmarks. Each finding clickable → selects the offending section. Publish bakes the snapshot, busts cache, advances `cms_pages.version`. |
| **Page settings** | Drawer keeps Basics / SEO / Social / URL & robots. Tabs that don't belong (Code, Templates) are gone. |
| **Workspace settings** | Live in `/admin` only — billing, members, integrations, audit, AI usage. Anything that affects how a page renders does not live there. |
| **Undo** | Cmd-Z / Cmd-Shift-Z works at page level. Operation log in EditShell's draft state. Saved revisions still in Revisions drawer for "go back N saves". |

---

## 3. The completion milestone — Builder v1

Defined by exactly six product capabilities:

- [ ] **1. Header + footer are editable on the canvas using the same flow as page sections.**
- [ ] **2. Inline rich-text editing shows live styling, not raw markers.**
- [ ] **3. Section-add UX is categorized, searchable, and previewed.** Default view curated (~15 sections), not flat list of 43.
- [ ] **4. All sections share one visual rhythm:** common `SectionHead`, common container/spacing scale, common CTA primitive, two type-scale variants (editorial / clean) every section respects.
- [ ] **5. Non-homepage pages compose inline using the same EditShell.** Pages dropdown in topbar.
- [ ] **6. Single admin model.** `/admin/site-settings/sections|structure|pages` removed or redirected. Dashboard is workspace ops only.

These six are the bar. Polish items (focal-point, AI panel, undo, per-breakpoint, dashboards) are post-v1.

**Order note:** convergence (capability 6) goes FIRST as Phase A, not last. If we don't delete old surfaces first, every other phase has to maintain two paths.

---

## 4. Disciplined execution plan

Six phases. One per commit (or two close commits). No megabatches. Each phase is a real product change, fully integrated before the next starts.

**Standing rules for every phase below — non-negotiable:**

- **Prototype alignment is a gate.** A phase that ships engineering changes without matching the named prototype surface(s) is not done. Visual rhythm, callouts, transitions, premium feel — all measured against `docs/mockups/builder-experience.html`.
- **Deletion follows replacement.** Old surfaces are removed *only after* the replacement covers the real use case. We never create a gap in the operator flow to satisfy a cleanup checkbox. (Phase A's redirects exist precisely so this rule is honored — they keep links live during the transition.)
- **One capability per phase.** No bundling. If something doesn't fit the phase's named goal, it goes to a follow-up phase or to the post-v1 list.
- **Each phase ends with a lived-experience smoke test on a real tenant**, not just a diff review.

---

### Phase 0 — Immediate sweep (½ day)

Zero-risk deletions / pulls. Do this BEFORE Phase A.

**Important distinction.** Two things named "prototype" exist in the repo. Do not conflate them:
- ✅ **`docs/mockups/builder-experience.html`** — the APPROVED BUILDER prototype. This is the binding fidelity reference. **Preserve it untouched.**
- ❌ **`web/src/app/prototypes/admin-shell/*`** — UNRELATED admin-shell experiment, not the approved builder prototype. This is what we're deleting.

**Tasks.**

- [ ] Pull `SiteDarkModeSwitcher` from public storefront mount.
- [ ] Pull `FocusOrderOverlay` from public storefront mount.
- [ ] Delete or move `web/src/app/prototypes/admin-shell/*` (the admin-shell experiment, NOT the builder mockup).
- [ ] Remove "Code" tab from page-settings drawer.
- [ ] Move "Templates" tab out of page-settings drawer (decide: topbar button OR fold into section-add picker).
- [ ] Pick one mount point for workspace template gallery (currently mounted twice).
- [ ] Delete `/admin/site-settings/sections` and `/admin/site-settings/structure` routes (replace with redirects). Keep `pages` until Phase F replaces it.
- [ ] Action orphans: wire `aria-landmark-action.ts` and `suggestLayoutImprovement` to publish preflight, OR delete. Decide on `loadAiUsageSummary` (build card or delete).
- [ ] Document in deployment memory: GH Action handles aliases on push; manual `vercel promote` not needed for `phase-1` pushes.
- [ ] Add `prebuild` step or CI check that nukes `.next/dev/types` before running `tsc`. The M15 `revalidateTag` arity bug got past local checks because of stale types.

**Prototype alignment.** None directly — Phase 0 is pure subtraction. But: confirm `docs/mockups/builder-experience.html` is untouched after the sweep (it should be, but verify; an automated check would be a one-liner in CI).

**Quality bar.** No regressions. Every flow that worked before still works. The lint baseline is lower. The visible product surface is *unchanged from the operator's perspective* except for the absence of the floating dev chips.

**Verification.**
- Lint baseline drops by the prototypes/admin-shell removal count.
- No orphan actions.
- Single template-gallery mount.
- No Code/Templates tabs in page settings.
- No dev chips on prod storefront.
- Smoke test: open `impronta.tulala.digital/?edit=1` and complete a full edit-publish cycle. Confirm zero behavior changes.

---

### Phase A — Convergence cleanup (1–3 days)

**Goal.** Delete or demote everything in the REMOVE / REDIRECT / DEMOTE buckets. After this phase the only canonical editor is the EditShell.

**What ships.**
- [ ] `/admin/site-settings/sections|structure|pages` deleted or replaced with thin redirects to `?edit=1&panel=...`.
- [ ] EditShell learns `?panel=` query param so old links open the right drawer.
- [ ] `SiteDarkModeSwitcher` and `FocusOrderOverlay` unmounted from public storefront. (Confirms Phase 0.)
- [ ] `prototypes/admin-shell` directory deleted. (Confirms Phase 0.)
- [ ] Page-settings drawer: Code + Templates tabs removed. (Confirms Phase 0.)
- [ ] `BrandKitImport` and `MeshGradientGenerator` moved behind Advanced disclosure inside Theme drawer.
- [ ] `presentation.customCss` field hidden behind Advanced toggle in Style tab.
- [ ] Section-add picker existing UI stays (Phase D will redesign). 43-type list lives.
- [ ] Workspace template gallery has one mount only — topbar Templates button.
- [ ] AI / a11y orphans wired or deleted.
- [ ] Lint baseline drops by prototypes/admin-shell removal.

**What gets removed.**
- All routes/components in REMOVE bucket.
- Dark-mode chip from prod.
- Page-settings Code + Templates tabs.
- One of two workspace-template gallery mounts.

**Dependencies.** None. Pure subtraction.

**Risk.** Old links → 404 if redirects miss something. Mitigation: grep codebase + docs for `/admin/site-settings/(sections|structure|pages)`.

**Prototype alignment.**
- §1 Top bar — confirm topbar mission-control feel survives cleanup; the workspace-name region, page-name region, save chip, and primary action group should match the mockup's spacing.
- §5 Page settings drawer — only Basics / SEO / Social / URL & robots tabs remain. Tab strip rhythm matches mockup §5.
- §7 Publish drawer — orphan AI / a11y checks land as preflight findings exactly the way the mockup §7 shows preflight rows (severity dot, category, message, "Jump to section" affordance).
- §12 Theme drawer — `BrandKitImport` and `MeshGradientGenerator` move into an "Advanced" disclosure that respects mockup §12's progressive-disclosure pattern.
- §18 Empty canvas — single `WorkspaceTemplateGallery` mount; canvas remains the calm starter surface depicted in mockup §18, not two stacked tools.

**Quality bar.** After Phase A, an operator who lands on `?edit=1` sees exactly one editor — the EditShell — with old admin URLs gracefully redirecting in. Side-by-side compare the topbar, page-settings drawer, theme drawer, and publish drawer against the mockup screenshots. Premium feel is preserved (no removed-but-not-replaced gaps); old admin links open the EditShell pre-warmed to the right drawer (`?panel=`).

**Deletion-timing rule applied.** The `/admin/site-settings/pages` route is **kept** in Phase A and only retired in Phase F (when the Pages dropdown lands). This honors "deletion follows replacement" — `pages` is the only legacy admin surface that a tenant might still use day-to-day; the others are cosmetic.

**Verification.**
- Manual: visit every removed URL, confirm redirect or intentional 404.
- Automated: Playwright smoke test that loads `/admin`, storefront in edit mode, clicks each topbar button + each drawer tab.
- `tsc` clean. Lint baseline lower than before.
- Bundle size measured: should drop slightly.
- **Mockup compare:** screenshot the topbar, theme drawer, publish drawer, page-settings drawer; place beside mockup §1 / §5 / §7 / §12; confirm rhythm and hierarchy match.

---

### Phase B — Header + footer editing (1.5–2 weeks)

**Goal.** Header and footer editable on the canvas, same flow as sections.

**What ships.**
- [ ] New table OR new use of `cms_pages`: a `site_shell` row per tenant per locale, with `header` and `footer` slot keys carrying section rows from `cms_page_sections` via synthetic page id (or new join).
- [ ] `PublicHeader` and public footer become "section composer"-rendered, reading from published shell snapshot.
- [ ] EditShell: header and footer become selectable in edit mode. Same outline-on-hover, same inspector flow.
- [ ] Two new section types: `site_header` and `site_footer`. Real sections with own schema (logo, nav items, CTA / social links, legal copy).
- [ ] One-off seed migration: capture current `PublicHeader` + footer state into `site_header` / `site_footer` rows for every tenant.

**Not in this phase.** "Convert to global" affordance — defer to post-v1.

**What gets removed.** Hard-coded `PublicHeader` and footer JSX (replaced with snapshot rendering). The "site shell is hard-coded" comment in `agency-home-storefront.tsx`.

**Dependencies.** Phase A.

**Risk.** Highest of the six phases. Header rendered everywhere including non-snapshot paths (login, error, marketing apex). **Mitigation:** introduce snapshot renderer behind feature flag per tenant. Roll out tenant by tenant. Keep hard-coded fallback for one release after rollout.

**Prototype alignment.**
- The mockup does not depict a numbered "edit header/footer" surface, but every screenshot in §1, §2, §8, §9, §17, §18 includes a header and footer rendered around the canvas. Phase B implements the prototype's *implied* behavior: the same selection chrome (mockup §9 drag/select indicators), the same inspector tabs (mockup §2), the same save and publish flow (§1, §7).
- Specifically: hover state, outline glow, drag handle, duplicate/delete affordances on the header MUST match the mockup §9 selection treatment exactly. No bespoke shell-only chrome.
- The Inspector tabs (Content / Layout / Style / Responsive / Motion) for `site_header` and `site_footer` follow mockup §2's five-tab depth pattern. No reduced or expanded tab set.

**Quality bar.** An operator who has used Phase A successfully edits the header and footer on a real tenant without instruction. The action *feels* identical to editing a body section. There is no "header mode" or special chrome. Publishing the header repaints every page on the tenant. The seeded defaults (logo position, nav links, footer columns, social links, legal copy) read as a real designed shell, not a placeholder.

**Deletion-timing rule applied.** The hard-coded `PublicHeader` JSX is **kept as a fallback** for one release after the snapshot renderer ships. Feature-flag rollout per tenant. We delete the hard-coded path only after every tenant is on the snapshot renderer and a follow-up release confirms zero regressions. This is the highest-risk deletion in the whole plan; it cannot be a same-commit removal.

**Verification.**
- Every existing tenant's seeded header/footer renders identical to before.
- Editing header on `impronta.tulala.digital` and publishing doesn't break marketing apex (`tulala.digital`) or app shell (`app.tulala.digital`).
- New tenant created post-Phase B sees default `site_header` / `site_footer` defaults.
- Cache busting: publishing a header edit busts right tags so all pages on that tenant repaint.
- **Mockup compare:** screenshot the canvas with header selected vs. body section selected. Selection chrome should be identical. Inspector tabs should be identical depth.

---

### Phase C — Inline rich-text WYSIWYG (1.5 weeks)

**Goal.** Editing copy shows live styling. Operators never see `{accent}` / `[link]()` / `{b}` / `{i}` while typing.

**What ships.**
- [ ] Editor primitive built on contentEditable + serialization layer. Render: live bold, italic, accent color, link styling. Serialize back to existing markers on save. Markers stay canonical storage so renderer doesn't change and existing data continues to parse.
- [ ] Floating selection toolbar replaces current `inline-editor.tsx` toolbar but keeps same actions (Bold / Italic / Accent / Link). Link target picker reuses existing `LinkPicker`.
- [ ] Wire into every text field in every editor (hand-written + auto-bound). `ZodSchemaForm` `text`/`textarea` renderer becomes the primitive's wrapper.
- [ ] Backwards-compat: existing storage stays in marker form. New writes also produce marker form. NO migration.

**What gets removed.** Current `inline-editor.tsx` toolbar implementation (replaced).

**Dependencies.** Phase A.

**Risk.** ContentEditable is finicky. **Mitigation:** choose a small, well-tested base (Lexical or thin Slate config) rather than rolling our own selection model. Spend a day evaluating before committing.

**Prototype alignment.**
- §17 Inline text editing is **the** target. The mockup defines exactly what this surface looks like: a floating selection toolbar with bold/italic/accent/link, a clean caret, live styling, no marker noise. Phase C ships §17 verbatim.
- §17's toolbar is compact, not a full word-processor ribbon. The four actions (Bold / Italic / Accent / Link) are it. No font-size pickers, no color wheel, no alignment buttons inside the toolbar — those live in the Inspector Style tab, not the floating toolbar.
- Link picker reuses existing `LinkPicker` (already integrated, 7-mode). Do NOT redesign LinkPicker as part of this phase.

**Quality bar — and the user's "controlled, premium" discipline.**

What "controlled" means concretely:
1. **Scope cap.** Phase C ships §17 and only §17. Not a rich-text editing platform. Not a Notion clone. The four toolbar actions, the live rendering, the marker round-trip. Anything beyond that is out of scope for this phase, including: tables, lists, headings inside body text, embedded media, mentions, slash commands, custom keyboard shortcuts beyond Cmd-B/I/K.
2. **No new dependencies without a 24-hour evaluation.** If we adopt Lexical or a Slate config, that's a deliberate choice with a written justification (size, maintenance, a11y, marker round-trip support). Default position is to evaluate two options for a day before committing.
3. **No storage migration.** Markers stay canonical. The editor is a view layer.
4. **Wire it everywhere in one phase, not piecemeal.** `ZodSchemaForm` text/textarea renderer becomes the wrapper. All hand-written editors that have raw text fields are touched in this phase. We do not leave half the inspector with WYSIWYG and half with raw markers.

What "premium" means concretely:
- Caret feels native. No janky re-renders on keypress.
- Selection toolbar appears with the same subtle motion as the mockup §17 (fade + small upward translate, ~120ms ease-out).
- Active styles in the toolbar reflect the current selection (bold button is filled when selection is bold).
- Link mode opens the existing LinkPicker as a popover anchored to the toolbar, not a modal dialog.
- Accent color uses the tenant's brand accent token, not a hardcoded color.

**Deletion-timing rule applied.** The current `inline-editor.tsx` toolbar is replaced in-place. There is no "old toolbar visible during transition" — the new toolbar is the only toolbar from the moment the phase ships. This is fine because the replacement has full coverage of the old toolbar's actions on day one.

**Verification.**
- Every existing site continues to render identically (no storage changes).
- Page with `{accent}` markers in DB shows accent-styled text in editor + zero visible markers.
- Round-trip: type, save, reload, verify storage still uses markers.
- Keyboard: Cmd-B / Cmd-I / Cmd-K (link) work.
- **Mockup compare:** type a paragraph with bold + accent + link in the live editor; screenshot beside mockup §17. Selection toolbar position, button rhythm, caret feel must match.
- **a11y:** screen-reader announces formatting changes; the toolbar is keyboard-navigable.
- **Performance:** typing in a 200-word paragraph stays at 60fps. No React reconciliation per keypress.

---

### Phase D — Section-add UX (3–5 days)

**Goal.** Adding a section is approachable. Default operators see ~15 curated types categorized; advanced toggle reveals the rest.

**What ships.**
- [ ] Curated section catalog: each section's `meta.ts` gets `category` field (`hero` / `trust` / `showcase` / `story` / `convert` / `form` / `embed` / `footer-shape` / `advanced`) and `inDefault` boolean.
- [ ] Section picker modal: command-palette style, search at top, categories left, results grid center with thumbnails. Each result: label, one-line description, "Add" button.
- [ ] Thumbnails: rendered server-side at first request, cached. Real render of section with placeholder content payload.
- [ ] "Advanced sections" toggle reveals remaining ~28 types.
- [ ] Insert affordance: hover gap between two sections → "+" button → opens picker → inserted at that gap.
- [ ] Existing section-add entry points removed (navigator panel "+" button if exists, OR refactored to open new picker).

**What gets removed.** Whatever current section-add UX is (probably flat list).

**Dependencies.** Phases A, B, C. (B because header/footer slot also uses this picker. C because picker uses same WYSIWYG primitives in preview.)

**Risk.** Thumbnail rendering is the only complex piece. If slips, ship picker without thumbnails first; add as follow-up.

**Prototype alignment.**
- §8 Add section library is the target. The mockup shows: thumbnail-led grid, category strip, search at top, hover preview, and a clear "Add" affordance per tile. Phase D matches this layout one-for-one.
- §9 Drag in progress — the insert affordance ("+ Add section" button between sections on hover) follows §9's gap-indicator visual language.
- The "Advanced sections" toggle is a quiet pill, not a full section. Mockup §8 hints at this with its category-strip rhythm — we extend it with one more category named "Advanced" that's collapsed by default.

**Quality bar.** New operators add a section in under 30 seconds without instruction. Thumbnails actually preview the section (real render, not a static SVG outline). Categorization reads as curatorial — operators understand why a given section is in "Showcase" vs. "Convert". The picker is the visual peer of mockup §8.

**Deletion-timing rule applied.** The flat 43-type list (current section-add UX) is replaced in this phase. We do not keep both pickers; the redesign covers all 43 types from day one (15 in default view, 28 behind Advanced toggle).

**Verification.**
- Default picker shows 12–15 sections, organized.
- Search by name returns matches across all sections including advanced.
- "Add" inserts at right slot index, section gets library defaults, canvas reflects immediately.
- **Mockup compare:** screenshot the picker open beside mockup §8. Category strip, grid rhythm, thumbnail aspect, search-bar position, hover-preview behavior all match.
- **Lived-experience smoke test:** a non-engineer (recruit one) opens an empty tenant, picks a starter, and adds 3 new sections via the picker. They complete this without hitting confusion states.

---

### Phase E — Visual unification (2–3 weeks)

**Goal.** All 43 sections share one visual rhythm. Output looks designed, not assembled.

**What ships.**
- [ ] One `SectionHead` primitive with `eyebrow`, `headline`, `intro`. Every section's Component imports it. Removes ~40 small variations.
- [ ] One `SectionContainer` with existing container-width tokens but unified internal padding scale that respects `presentation.padding{Top,Bottom}` enums consistently.
- [ ] One `Cta` primitive (label, href, variant). Every section with CTAs uses it.
- [ ] Two type-scale variants on heading ramp: `editorial` (serif display, generous spacing) and `clean` (sans, compact rhythm). Selectable per page or per section. Every Component respects active scale through tokens.
- [ ] Refactor each Component.tsx to use the three primitives. Bulk of work: 43 files, mechanical but per-section judgment calls on real difference vs unintentional.
- [ ] Visual regression pass: snapshot every section type with sample tenant before + after refactor; manually review for unintended drift.

**What gets removed.** Every per-section ad-hoc headline / container / CTA implementation. Probably ~1500 lines net deleted across 43 sections.

**Dependencies.** Phases A–D.

**Risk.** Visual drift on existing tenants. **Mitigation:** snapshot tests per section, manual review on real tenant data.

**Prototype alignment — this is the highest-care phase, read carefully.**

The user's challenge on Phase E is correct and binding: **do not flatten distinctive sections into generic consistency.** "Visually unified" does not mean "visually homogeneous." The approved prototype is *premium* precisely because it has rhythm and contrast — a hero feels different from a stats row from a testimonials trio. Unification means *shared rhythm*, not *uniform appearance*.

Concrete distinction to hold:

- **Shared (must unify):** outer container width, vertical padding scale, eyebrow typography, headline-to-body baseline rhythm, CTA primitive shape, focus rings, selection chrome, motion timing curves.
- **Distinctive (must preserve):** section-specific visual signatures — the hero's full-bleed photographic backdrop, the mosaic's asymmetric grid, the marquee's continuous scroll, the timeline's vertical rail, the testimonials trio's accent rotation, the bespoke featured-talent picker (mockup §23) layout. These are the reasons the prototype reads as premium. They survive Phase E *unchanged*.
- **The litmus test:** if two sections look the same after the unification pass, we've done it wrong. If two sections feel like they were authored by the same designer using the same vocabulary, we've done it right.

Specific prototype surfaces in scope:
- §2 Inspector five-tab depth — already largely built; Phase E gives it consistent rhythm across all 43 sections (every section's content tab feels familiar even though its fields differ).
- §3 Style — kit-driven controls (Stepper, Swatch, Segmented) replace any remaining `<select>` shortcuts. Mockup §3's level of polish is the bar.
- §14 Motion — same kit-driven treatment for entry/scroll/hover.
- §23 Bespoke content panel — left intact. The featured-talent picker is a deliberate departure from the universal pattern; do not flatten it. The prototype explicitly calls this out as distinctive.

**Quality bar — the anti-flattening checks.**

Before declaring Phase E done, run all four:
1. **Distinctiveness audit.** Pick any 6 of the 43 sections. Render them with default content. They should be visually identifiable from each other in 2 seconds without reading copy. If not, unification went too far.
2. **Cohesion audit.** Compose a homepage from 6 sections of different types. The page should read as a single designed document, not a stitched collage. If not, unification didn't go far enough.
3. **Mockup parity check.** Side-by-side compare the live result against the mockup screenshots that contain similar sections. Spacing rhythm, type ramp, accent usage, motion feel — all match.
4. **Operator A/B.** A non-engineer composes a page using the new shared primitives. The resulting page is genuinely better than what they'd produce with the current free-form sections. If not, unification is restricting rather than enabling.

**Deletion-timing rule applied.** Per-section ad-hoc headline/container/CTA implementations are removed only as each section is refactored. We do not delete the primitives' source until every section using them is migrated. The 43-section refactor is itself sequenced — start with the simplest (trust_strip, marquee), then mid-complexity (testimonials_trio, faq_accordion), then the bespoke ones last (hero, featured_talent, magazine_layout). At each step, the previously-refactored sections must still pass the cohesion + distinctiveness audits.

**Verification.**
- Every section renders within unified rhythm.
- Page composed from 6 random sections looks visually coherent without operator intervention.
- **Distinctiveness check:** the 6 sections are still individually identifiable.
- Existing published sites don't shift unexpectedly (snapshot test enforces this).
- **Mockup compare:** screenshot the canvas with ≥4 different section types live; compare against mockup §1, §2, §3, §9 composite screenshots. Premium feel preserved.

---

### Phase F — Non-homepage inline composer (1 week)

**Goal.** EditShell is page-aware. Pages dropdown in topbar. Same flow for non-homepage pages.

**What ships.**
- [ ] EditShell binds to `pageId` from URL (e.g. `/about?edit=1` resolves to About page row). Default for `/?edit=1` is homepage.
- [ ] Pages dropdown in topbar: lists all non-archived pages on this tenant, shows draft / live status per page, lets operator switch.
- [ ] "Create new page" affordance in dropdown: small modal for slug + title + locale, creates row, immediately switches into editing it with empty composition.
- [ ] Reuse existing `page-composer-action.ts` server actions for save/publish; work here is mostly UI binding.

**What gets removed.** "Templates" tab's `PagesComposerList` becomes the pages dropdown, not a separate list.

**Dependencies.** Phases A–E. (E because non-homepage pages should immediately benefit from unified visual rhythm.)

**Risk.** Lower than B/C/E. Infrastructure mostly there.

**Prototype alignment.**
- §24 Pages picker is the target — the dropdown the prototype shows in the topbar. Phase F implements it verbatim: page list with status badges (draft/live), search, "+ New page" affordance.
- §11 Structure navigator — the per-page section navigator becomes page-aware (knows which page's sections it's listing). Mockup §11 already depicts this; Phase F just makes it real for non-homepage pages.
- §1 Top bar gains the Pages dropdown next to the workspace name, exactly per mockup §1.

**Quality bar.** Switching between pages feels instant (under 250ms perceived). Draft state per page is preserved across switches. Creating a new page feels lightweight (modal, three fields, immediate edit). The shell (header/footer from Phase B) remains stable across page switches — only the body changes. The publish flow per non-homepage page is identical to the homepage flow.

**Deletion-timing rule applied.** The `/admin/site-settings/pages` route (kept through Phase A) is finally retired in this phase, with a redirect to `?edit=1&page=<slug>`. The `PagesComposerList` UI inside the page-settings drawer is replaced by the topbar dropdown.

**Verification.**
- Switch between two pages mid-edit, see canvas swap, draft state preserved per page.
- Publish a non-homepage page, hit its public URL, see snapshot rendered.
- Header/footer remain consistent across pages because they're shell-scoped (Phase B).
- **Mockup compare:** Pages dropdown open beside mockup §24. Topbar with dropdown closed beside mockup §1.

---

## 5. Post-v1 polish (sequenced AFTER milestone, NOT part of it)

Real work, not required to call builder finished:

| Item | Effort | Notes |
|---|---|---|
| Image focal-point + crop | ~3 days | `MediaPicker` returns `{url, focal:{x,y}, crop?:{ratio}}`. Renderer respects focal-point on `object-position`. |
| Unified AI panel | ~1 week | Folds rewrite, translate, alt-text, critique, layout-suggest into one inspector tab. Usage chart on dashboard. |
| Page-level undo | ~1 week | Operation log + Cmd-Z/Cmd-Shift-Z + persist on save. |
| Per-breakpoint responsive editor | ~2 weeks | Per-section overrides on more than `mobileStack` + `visibility`. |
| Reusable global blocks | ~2 weeks | "Convert to global" turns section into shell-scoped block reusable across pages. |
| Publish-path Playwright tests | ~3 days | Catch the next M15-style failure locally. |
| CSS code-splitting per section | ~1 week | Drops bundle from 452KB to per-page actuals. |

---

## 6. End state

After Phase F:

- **One product.** Page builder is the storefront in edit mode. No second editor. Dashboard for workspace operations only.
- **Headed and footed.** Tenants edit their site shell on the canvas. Site builder, not homepage builder.
- **Approachable.** Non-engineer operator picks starter, edits copy with live formatting, swaps imagery, drags sections to reorder, adds new sections from curated picker, edits sub-pages with same flow, switches between locales with one click, publishes. Every step looks and feels like the same product.
- **Visually coherent.** Sections share rhythm. Two type scales are the choice. Output looks designed.
- **Multi-page, multi-locale, multi-tenant.** All three work through same EditShell, no special cases.
- **Shipped without dead weight.** No floating dev chips, no "coming soon" tabs, no parallel admin pages. Codebase reflects one product decision.

**What's NOT in v1, and that's fine:**
- Image cropping and focal-point.
- Unified AI panel (rewrite still works per field).
- Page-level undo (revisions drawer still works).
- Per-breakpoint responsive editing beyond mobileStack/visibility.
- Reusable global blocks across pages.
- Analytics / page-impact view.
- Marketplace as a first-class surface.
- Custom-domain self-serve for tenants.
- Bundle code-splitting per section.

Real future work. Not what makes the product feel finished — what makes it feel *premium*. After v1.

---

## Operating standard from this point forward

Every commit either:
1. *Finishes a v1 capability* (a phase in §4),
2. *Removes baggage* (an item from §1's REMOVE/REDIRECT/DEMOTE buckets), or
3. *Improves prototype fidelity* against `docs/mockups/builder-experience.html`.

If a feature idea doesn't fit one of those three buckets, **defer it**.

**Phase completion gate (all four):**
1. Old baggage removed.
2. New capability functional.
3. Prototype alignment verified against named surfaces (§§).
4. Lived-experience smoke test on a real tenant passes.

No megabatches. One phase at a time. Phase fully integrated, prototype-verified, and smoke-tested before the next starts.

---

## Execution log

Use this section to track progress. Add a row per phase as it ships.

| Phase | Status | Started | Shipped | Commit | Notes |
|---|---|---|---|---|---|
| 0 — Immediate sweep | not started | | | | |
| A — Convergence cleanup | not started | | | | |
| B — Header + footer editing | not started | | | | |
| C — WYSIWYG rich text | not started | | | | |
| D — Section-add UX | not started | | | | |
| E — Visual unification | not started | | | | |
| F — Non-homepage composer | not started | | | | |
| **v1 milestone** | not reached | | | | |

---

## Quick reference

**The bar for v1:** the six capabilities in §3, each landed at or above the prototype quality bar.
**The fidelity reference:** `docs/mockups/builder-experience.html` (preserved untouched).
**The standard for every commit:** finishes a v1 capability OR removes baggage OR improves prototype fidelity.
**The phase completion gate:** baggage removed + capability functional + prototype-aligned + lived-experience verified.
**The next action:** Phase 0 immediate sweep.
**The mental model:** edit on the live site, one path, no parallel editors, prototype is the look-and-feel benchmark.

---

## Appendix — addressing the four challenge points directly

The user raised four challenges when approving this plan. Each is addressed explicitly here so the response is part of the plan, not a side conversation.

### Challenge 1: Prototype alignment — don't let this become engineering cleanup

**How this plan answers it:** §0.5 establishes the prototype as a binding fidelity reference, mapped phase-by-phase. Every phase has a Prototype alignment subsection naming the mockup surface(s) it owns and a Quality bar subsection defining what "premium feel" means concretely. Phase completion requires lived-experience smoke testing against the prototype, not just `tsc` clean.

### Challenge 2: Phase E visual unification — preserve premium feel, don't flatten

**How this plan answers it:** Phase E's prototype-alignment block draws an explicit line between *shared* (must unify — container, padding scale, eyebrow/headline rhythm, CTA primitive, focus rings) and *distinctive* (must preserve — hero photographic backdrop, mosaic asymmetry, marquee scroll, timeline rail, testimonials accent rotation, bespoke pickers). The verification gate includes a "Distinctiveness audit" alongside the cohesion check. The 43-section refactor is sequenced simplest-first so cohesion + distinctiveness are continuously verifiable.

### Challenge 3: Deletion timing — don't create gaps

**How this plan answers it:** Standing rules at the top of §4 codify "deletion follows replacement." Each phase's "Deletion-timing rule applied" subsection states explicitly which deletions happen when. Two specific applications: (a) `/admin/site-settings/pages` route is kept through Phase A and only retired in Phase F when the Pages dropdown lands; (b) the hard-coded `PublicHeader` JSX is feature-flagged per tenant in Phase B and removed only after a follow-up release confirms zero regressions.

### Challenge 4: WYSIWYG scope discipline

**How this plan answers it:** Phase C's Quality bar block lists four explicit scope-cap rules: (1) §17 only — no platform/Notion-clone scope creep; (2) no new dependency without a 24-hour evaluation; (3) no storage migration; (4) wired everywhere in one phase, not piecemeal. The phase verification includes a 60fps performance check and a mockup compare — premium feel is binary, not "good enough."

---

## How prototype fidelity and engineering convergence might conflict — and how we'll resolve it

Three places where the two lenses can pull against each other:

1. **A baggage-removal item that the prototype doesn't depict.**
   *Example:* dark-mode switcher. The mockup is silent on it; engineering convergence says delete.
   *Resolution:* delete. Convergence wins when the prototype is silent and the surface is dev-mode noise.

2. **A prototype surface that engineering wants to defer.**
   *Example:* §16 Compare revisions. Mockup shows it; we've deferred to post-v1.
   *Resolution:* defer is allowed for prototype surfaces explicitly tagged "post-v1" in §0.5's mapping table. The deferral list is small and named. Anything else — if the prototype shows it and §0.5 doesn't tag it post-v1, it's in v1.

3. **An engineering shortcut that fails the lived-experience test.**
   *Example:* shipping the section picker (Phase D) without thumbnails because thumbnails are hard.
   *Resolution:* engineering shortcut loses. Phase D doesn't ship until the §8 quality bar is met. If thumbnails are hard, we either delay the phase or scope thumbnails differently — but we don't ship below the bar.

The bias direction: when in doubt, the prototype wins. If we've drifted, we re-align the engineering plan to the prototype, not the other way around. The codebase exists to deliver the prototype, not vice versa.

---

## How we'll prevent technically-cleaner-but-experientially-weaker outcomes

Four mechanisms, all already encoded in the plan above:

1. **Phase completion gate (4 of 4).** Engineering correctness is *necessary but not sufficient*. Prototype alignment + lived-experience smoke test are independent gates. A `tsc`-clean phase that fails the lived-experience test is not done.
2. **Mockup compare in every verification block.** Each phase's verification includes a side-by-side comparison against named mockup surfaces. This is mechanical and unambiguous.
3. **Distinctiveness audit (Phase E specifically).** Anti-flattening test runs before Phase E ships. Cohesion test runs in the same pass.
4. **Lived-experience smoke test on a real tenant.** Every phase ends here. Operator unfamiliar with the change completes the relevant flow on `impronta.tulala.digital` (or equivalent). If they hit a confusion state, the phase is not done.

The combined effect: a phase cannot ship by being engineering-correct alone. It has to *feel right* on a real tenant against a real prototype. That's the discipline that prevents "cleaner but weaker."
