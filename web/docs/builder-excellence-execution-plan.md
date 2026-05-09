# Builder excellence — product-grade execution plan

**Status:** active backlog (merges technical audit + market-grade roadmap).  
**Supersedes:** purely gap-fix framing — goal is a **best-in-market governed visual builder**, not only closing bugs.  
**Related:** [builder-convergence-plan.md](./builder-convergence-plan.md) (Builder v1 six capabilities, Phases 0–F), [builder-experience-execution-plan.md](./builder-experience-execution-plan.md) (mockup §1–§26 scorecard), `docs/mockups/builder-experience.html`.

---

## Product north star

**Governed flexibility:** the operator should feel unlimited creativity while the system stays structured, data stays clean, output stays performant, and the product family stays visually coherent.

**Judge features by:**  
“Can a real agency owner, operator, or talent coordinator build a premium branded website or landing page **quickly, safely, and confidently** without a developer?”

If no, the feature is not done — optimize for **operator confidence**, visual quality, speed, and trust, not only engineering completion.

**Canvas-first:** the storefront canvas is the primary workspace. Inspectors, drawers, and panels **support** the canvas; they must not replace direct manipulation for common tasks.

---

## Why gap-fix alone is insufficient — four deeper layers

### 1. Design composition system (beyond “sections only”)

The builder must eventually reason about a hierarchy richer than “page = ordered sections” only:

- Page → Section → **Container / Grid / Column** → **Card / Media / Text / CTA group / Form** → **dynamic talent blocks** → **reusable components**.

A section-only builder tops out fast: operators can rearrange large pieces but cannot approximate many premium layouts. Market-leading builders need **nested layout primitives**, with **most complexity hidden behind presets** until power users need it.

**Guidance:** evolve toward governed nesting (`Page → Section → Layout → Block → Element`). Do **not** ship unlimited freeform chaos early — validate composition rules in schema, renderer, and inspector together.

### 2. Responsive editing as first-class

Device preview is necessary but not sufficient. Target capabilities:

- Desktop / tablet / mobile as **design modes**, not only viewport shrink.
- Per-device overrides: spacing, alignment, visibility, order, image crop, layout direction.
- Hide/show blocks by device where supported by schema.
- Mobile-specific header behavior, CTA behavior, section stacking controls.

Mobile quality is non-negotiable for agencies, talent, clients, and operators on phones.

### 3. Design intelligence (not only AI copy)

AI must eventually assist **composition and quality** inside the governed system, e.g. improve section, premium polish, hero variants, layout options, hierarchy fixes, conversion passes — **mapping outputs to approved sections/blocks/tokens**, not unconstrained HTML.

Discipline: wire or remove dangling AI entry points; no random generators outside schema.

### 4. Section library as competitive advantage — **families**, not a flat registry

Curated defaults (~15–20) plus Advanced is the floor. Long-term, organize **section families** (Hero variants, Talent showcases, Trust, Conversion, Editorial, etc.) so operators choose outcomes (“Luxury hero”, “Talent grid”) not internal type IDs.

---

## Alignment with Builder v1 (convergence plan §3)

The repo still defines **six Builder v1 capabilities**. Map pillars to them:

| Capability (#) | Primary pillars below |
|----------------|----------------------|
| 1 Header/footer on canvas | Pillar 5 |
| 2 WYSIWYG inline | Pillar 3 |
| 3 Curated section-add UX | Pillar 4 |
| 4 Shared visual rhythm | Pillars 4 + tokens (below) |
| 5 Non-home inline compose | Ongoing (Pages picker / EditShell); reinforced by Pillar 2 |
| 6 Single admin model | Pillar 1 |

Cross-cutting: **Pillar 7 (responsive)**, **Pillar 8 (nesting architecture)**, **Pillar 9 (templates/reuse)**, **Pillar 10 (AI)**.

---

## Architectural backlog (prepare; ship incrementally)

These items **inform schema and refactor choices**; most ship after core pillars unless explicitly pulled forward.

**A. Component nesting strategy** — Section contains blocks; layout blocks contain children; children are typed (text, image, cards, buttons, forms, talent modules). Prefer governed trees over arbitrary DOM.

**B. Reusable saved blocks** — Saved CTA, testimonial, pricing, talent spotlight, header/footer variations — reuse across pages when composition model supports it.

**C. Global design tokens as product** — Brand/accent, typography pairs, button/card radii, shadows, section spacing, density, animation level — **Theme drawer + inheritance** with controlled per-section overrides ([theme-drawer](/web/src/components/edit-chrome/theme-drawer.tsx), tokens).

**D. Three-level templates** — Full-site, page-level, section-level templates (luxury agency, model agency, landing, etc.) — accelerate starts without abandoning structure.

**E. Design import / reference → governed sections** — Deferred large bet; architecture should avoid one-off HTML blobs so future import maps into section/block system.

---

## The ten pillars (market-grade)

Each pillar has **acceptance criteria** suitable for QA scripts and release gates.

### Pillar 1 — Foundation cleanup

Matches prior “Bucket A”: stabilize before adding power.

**Required**

- One canonical editor path (`?edit=1` EditShell); redirect/delete legacy `/admin/site-settings/sections|structure|pages` per [convergence §1](./builder-convergence-plan.md).
- No duplicate mounts (e.g. template gallery).
- Remove or relocate dead Page Settings tabs if not canonical.
- Wire **or delete** orphan AI/a11y actions — no dangling server actions.
- Document drawer exclusivity: `showExclusiveRightRailDrawer`, `dismissCompetingEditorChrome`, `closeAllRightRailDrawers` — every new drawer follows the mutex contract.

**Acceptance**

- Tester never asks “which builder?” or “why did this open an old editor?”
- No legacy bookmark should hit a competing surface or unexpected 404.
- Drawers do not stack unexpectedly.

**Verify:** `npm run typecheck`, `npm run lint`, tenant-touching → `npm run test:tenant-isolation`; smoke on real tenant host.

---

### Pillar 2 — True canvas editing

The canvas must feel like a real visual editor.

**Required**

- Canvas-level section drag-and-drop (mockup §9); semantics aligned with navigator reorder (`moveSectionTo` / slots — [edit-context](/web/src/components/edit-chrome/edit-context.tsx)).
- Visible drag handles on sections; obvious drop zones; premium selection outline ([selection-layer](/web/src/components/edit-chrome/selection-layer.tsx)).
- Inline add-section between sections; inline duplicate/delete/move where supported.
- Keyboard shortcuts aligned with [shortcuts registry](/web/src/components/edit-chrome/kit/shortcuts.ts) and [edit-shell](/web/src/components/edit-chrome/edit-shell.tsx).
- Click section → inspector; click text → inline editor; click image → media path.
- Undo/redo reliable after structural + inline edits.
- Profile MutationObserver / scroll paths on low-end devices.

**Acceptance**

- ~80% of a typical page can be built **from the canvas**, not admin forms.
- Navigator order **never disagrees** with canvas order after operations.

---

### Pillar 3 — Inline WYSIWYG editing

**Required**

- Floating toolbar (bold, italic, link, alignment, heading level as product allows).
- No raw storage markers visible while typing (Phase C — markers canonical in DB if needed).
- Headings, paragraphs, lists, links, CTA labels handled cleanly.
- Validation + placeholders for required fields; saves without refresh thrash.
- **AI rewrite** only after base editor is stable — scoped to governed fields, not layout soup.

**Acceptance**

- Operators edit visible copy like a live site, not a raw CMS schema.

---

### Pillar 4 — Premium section library and design rhythm

**Required**

- Categorized library, search, thumbnails, preview-before-insert where practical.
- Default curated set (~15–20); **Advanced** for rare types — **no flat 40+ wall** for normal users.
- Shared **SectionHead**, **CTA**, spacing scale, card/grid/media primitives — capability **#4**.
- Recommended category taxonomy (Hero, Talent showcase, Gallery/Media, Trust, Process, Booking, Pricing, FAQ, Editorial, Contact, Agency/About, Footer/Utility — adjust names to product voice).

**Acceptance**

- New user can assemble a **credible premium homepage in &lt; 15 minutes** from curated sections (session test).
- Library reads as one **design family**, not a database dump.

---

### Pillar 5 — Site shell editing (header / footer)

Strategic differentiator — [convergence Phase B](./builder-convergence-plan.md).

**Required**

- Header/footer selectable on canvas; inspector parity with body sections.
- Controls: logo, nav, CTA, social, locale switcher, mobile menu; footer columns, legal, contact/newsletter as applicable.
- Global shell model; publish invalidates every route using shell; optional tenant feature flag for rollout.

**Acceptance**

- Full branded experience (header + pages + footer) without developer; no stale shell after publish.

---

### Pillar 6 — Publish trust and recovery

**Required**

- Preflight end-to-end: headings, contrast, broken links, landmarks/a11y, required content, CTA destinations, alt text where applicable, **mobile layout warnings** when feasible.
- Findings clickable → jump to section ([publish-drawer](/web/src/components/edit-chrome/publish-drawer.tsx)).
- Clear publish summary; draft vs published clarity.
- Revision restore UX; explain **Undo = session** vs **Revisions = recovery**.

**Acceptance**

- Before publish, operator knows **what changed**, **what may break**, **what needs attention**, **what is safe**.

---

### Pillar 7 — Responsive editing (first-class)

**Required**

- Desktop / tablet / mobile as real design surfaces — overrides for spacing, alignment, visibility, order, crop, direction; hide/show by device where schema supports.
- Mobile stacking, mobile CTA/header behavior where product scope allows.
- QA bar: new sections reviewed at **all three** breakpoints.

**Acceptance**

- Mobile is a **design tool**, not a shrunk preview; desktop choices must not silently wreck mobile.

---

### Pillar 8 — Governed nested composition (future-proofing)

**Required**

- Decisions (schema, APIs, inspector) move toward `Page → Section → Layout → Block → Element` without shipping chaotic nesting day one.
- Revisit when Pillar 2–4 are stable.

**Acceptance**

- Flexibility increases over time **without** losing structure or performance.

---

### Pillar 9 — Templates and reusable blocks

**After** core v1 path is stable.

**Required (phased)**

- Full-site, page, and section templates; saved reusable blocks (CTA, trust, talent, header/footer variants).
- Template families (luxury agency, model agency, production, event staffing, portfolio, campaign LP, etc.).

**Acceptance**

- Strong starts without blank-page paralysis; reuse reduces duplicate work.

---

### Pillar 10 — AI inside the governed system

**Required**

- Wire preflight-adjacent helpers **or delete** — no half-mounted actions.
- Per-field rewrite stays typed and scoped.
- Future: section improvement, premium pass, hero variants, layout suggestions — **all map to existing components and tokens**.

**Acceptance**

- AI increases speed/quality **without** broken layouts or unsupported schema.

---

## Recommended execution order (do not reorder casually)

Winning sequence for maximum foundation:

1. **Pillar 1** — Foundation cleanup and routing convergence.  
2. **Pillar 2** — Canvas feel + drag/drop + selection polish + perf.  
3. **Pillar 3** — WYSIWYG.  
4. **Pillar 4** — Curated library + rhythm.  
5. **Pillar 5** — Header/footer shell.  
6. **Pillar 6** — Publish trust + revisions UX.  
7. **Pillar 7** — Responsive editing depth (parallel discovery earlier allowed; **full overrides** after trust + shell unless product insists).  
8. Performance, a11y, tenant safety (continuous, gates on every ship).  
9. **Pillar 9** — Templates / reusable blocks.  
10. **Pillar 10** + **Pillar 8** expansion — AI composition, nesting depth, design import — only when pillars 1–7 are credible.

**Cool extras** (comments, presence, approval workflows, eyedropper theme polish) — **after** the sequence above unless explicitly prioritized.

---

## Verification for every deliverable

- Mockup **§surface** ID when applicable.
- **Builder v1 capability #** when applicable.
- Smoke on **real tenant** (see [OPERATING.md](/OPERATING.md); host QA per [CLAUDE.md](/CLAUDE.md) for `agency_domains`).
- `npm run typecheck` && `npm run lint`; tenant/server paths → `npm run test:tenant-isolation`.
- Manual QA **desktop / tablet / mobile** for UI-facing pillars.
- No console errors; drawer mutex holds; no legacy route regression.

---

## Document history

- **2026-05** — Merged technical audit buckets with product pillars (composition, responsive-first, AI discipline, section families, templates, nesting roadmap) and explicit execution order.
