# Builder execution roadmap — 2026

**Canonical working roadmap for Tulala / Impronta.** Use this for daily prioritization. Detailed evidence and discovery lives in [builder-deep-audit-2026-05-09.md](./builder-deep-audit-2026-05-09.md). Strategic alignment: [builder-convergence-plan.md](./builder-convergence-plan.md). Surface scorecard: [builder-experience-execution-plan.md](./builder-experience-execution-plan.md).

---

## 1. Product goal

We are building a **premium 2026 visual page/site builder** where a **non-technical** agency owner, operator, coordinator, or talent business can **create and publish premium branded pages without a developer**.

The builder must feel:

- **Visual** — editing happens on the live canvas, not abstract forms.
- **Fast** — responsive chrome, smooth drag, reliable typing.
- **Premium** — spacing, typography, motion, and panels at product-grade polish.
- **Responsive** — trustworthy preview and eventual **responsive authoring** (not preview-only).
- **Safe to publish** — clear draft vs live, preflight, recovery, no scary ambiguity.
- **Easy for non-technical users** — plain language, obvious selection, honest affordances.
- **Powerful enough** for future **governed nested composition** (Section → Layout → Slot → Element).
- **Honest** about **field editing** vs **real child-element editing** vs **true nested composition** — see section 7.

---

## 2. Current reality (short)

- The editor is **past prototype**: EditShell, navigator, inspector, drawers, publish, revisions, section insert, and **builder-node** architecture are **largely implemented**.
- **Some** child selections map to **real persisted nodes**; **many legacy sections** still expose **synthetic children** derived from flat props ([legacy-section-tree.ts](../src/lib/site-admin/builder-node/legacy-section-tree.ts)); see audit §12.
- **Editable header/footer shell** (Phase B / convergence capability **#1**) remains the **largest product gap** vs “full site builder.”
- **Real-browser QA on registered tenant hosts** was **not completed** in the automated audit session (`agency_domains` / `CLAUDE.md`). Treat this as **Phase 0 gate**.
- **`npm run lint` repo-wide** is **baseline debt**, not builder readiness; use **scoped lint** on touched paths until baseline improves.

---

## 3. Locked execution phases

### Phase 0 — Real tenant browser QA

**Before large feature work:** exercise the builder on a **registered tenant host** (not raw `*.vercel.app` unless aliased into `agency_domains`).

**Test:** ~390px mobile, ~820px tablet, ~1440px desktop; real `?edit=1`; publish; preview; navigator; inspector; section library; drawers; header/footer **visibility**; console + network.

**Deliverable:** QA notes; bugs found / fixed / deferred; optional screenshots.

**P0-2 fix (landed in code):** CMS `/p/…` pages used **published** snapshots for SSR while edit mode updates **draft** `cms_page_sections`, so the navigator matched client state but the **canvas did not** until publish. **Implemented:** [`loadPageForRender`](../src/lib/site-admin/server/page-reads.ts) mirrors homepage [`loadHomepageForRender`](../src/lib/site-admin/server/homepage-reads.ts) — draft-first composition when preview or in-place edit is active. [`insertSection` / `duplicateSection`](../src/components/edit-chrome/edit-context.tsx) select the new section and **`await router.refresh()`** so DOM and [`selection-layer`](../src/components/edit-chrome/selection-layer.tsx) scroll behave consistently.

**Still required (human QA):** Phase 0 checklist on a **registered tenant host** to confirm behavior at 390 / ~820 / 1440 and log any follow-ups.

---

### Phase 1 — Hygiene and convergence

**Goal:** One canonical builder path; no broken legacy surfaces.

**Scope:** Legacy route redirects ([legacy-site-settings-redirect](../src/lib/site-admin/legacy-site-settings-redirect.ts)); duplicate mounts / orphan actions per convergence checklist; dead UI removed or hidden; [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md); no stacked right-rail drawers; `?panel=` / deep links ([edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx)); bookmarks don’t 404.

**Acceptance:** Single obvious path into the editor; every visible control works or is hidden; no dangling server actions users can hit; no confusing legacy routes.

---

### Phase 2 — Premium trust and UX copy

**Goal:** Safe, understandable builder — **before** deep architecture churn.

**Scope:** Draft vs published clarity; publish drawer + **blocking vs advisory** preflight ([publish-drawer.tsx](../src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../src/components/edit-chrome/PublishPreflight.tsx)); revisions / restore copy ([revisions-drawer.tsx](../src/components/edit-chrome/revisions-drawer.tsx)); inspector plain-language labels ([inspector-dock.tsx](../src/components/edit-chrome/inspector-dock.tsx)); navigator selected-state clarity ([navigator-panel.tsx](../src/components/edit-chrome/navigator-panel.tsx)); empty/error states; **`aria-live`** / toasts for publish failures ([edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx)); drawer **focus trap + focus restore**.

**Acceptance:** A non-technical user understands **what is selected, what changed, what is saved, what is unpublished, and what publish will do.**

---

### Phase 3 — Canvas feel

**Goal:** Canvas is the **primary** editing surface.

**Scope:** Canvas section reorder ([selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx)); drop zones and handles; **same move semantics** as navigator (`moveSectionTo` / [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx)); add between sections ([composition-inserter](../src/components/edit-chrome/composition-inserter.tsx)); duplicate/delete; selection polish; scroll stability; undo/redo after reorder; low-end device spot-check.

**Acceptance:** Rearrange visually; **navigator and canvas order stay aligned**; drag/drop feels predictable and premium.

---

### Phase 4 — Inline WYSIWYG

**Goal:** Editing feels like editing the **live page**.

**Scope:** [inline-editor.tsx](../src/components/edit-chrome/inline-editor.tsx); floating toolbar; hide raw markers while typing; headings, paragraphs, links, CTAs; placeholders; reliable autosave; AI rewrite **only** inside disciplined field flows ([ai-generate-action](../src/lib/site-admin/edit-mode/ai-generate-action.ts) policy).

**Acceptance:** Operators edit visible copy without thinking in schemas.

---

### Phase 5 — Section library premiumization

**Goal:** Inserter feels like a **design library**, not a registry dump.

**Scope:** [composition-library.tsx](../src/components/edit-chrome/composition-library.tsx); categories; search; thumbnails; ~15–20 core defaults + **Advanced** gate; strong defaults; shared **SectionHead**, CTA, spacing/card/grid primitives ([section template starters](../src/lib/site-admin/sections/shared/)).

**Acceptance:** New user can assemble a **polished homepage in under ~15 minutes**; library is understandable to **business** users.

---

### Phase 6 — Editable site shell

**Goal:** **Full site builder**, not page-body-only.

**Scope:** Phase B per [builder-convergence-plan.md](./builder-convergence-plan.md) and [phase-b-site-shell.md](./phase-b-site-shell.md): selectable header/footer; inspector parity; logo, nav, CTA, mobile menu; footer columns, legal, social, contact; shell publish; **cache invalidation** across tenant routes; tenant **feature flag** if needed.

**Acceptance:** Operators edit the **whole branded experience**; shell publishes safely; **no stale shell** on tenant routes.

---

### Phase 7 — Governed nested composition

**Goal:** Real layout flexibility **without** unlimited nesting chaos.

**Model:** **Section → Layout → Slot → Element.** No Webflow-freeform until governance proves out.

**Pilot:** **Hero** first — variants (centered, split, image left/right), background image/gradient/color, overlay, eyebrow, headline, subheadline, CTA group, media, badge, optional form; **safe** reorder; responsive order; hide/show per device.

**Acceptance:** Hero is **not** only flat props + synthetic nodes; users change structure via **governed** layout/slots; UI stays **honest** (section 7).

**Then repeat:** CTA banner, gallery, slider, testimonials, talent grid, contact — same pattern.

---

### Phase 8 — Responsive authoring

**Goal:** Beyond viewport preview — **intentional** mobile/tablet/desktop.

**Scope:** Per-device spacing, alignment, visibility, stack order, image focal/crop, CTA visibility, columns, slider behavior where applicable; builder chrome usable at **390 / ~820 / 1440**.

**Acceptance:** Mobile is **designed**, not inherited broken; chrome stays usable at all three widths.

---

### Phase 9 — Performance and accessibility

**Goal:** Fast and inclusive.

**Scope:** Selection-layer profiling ([selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx)); MutationObserver / scroll listener cost; `router.refresh()` batching; lazy rare drawers ([edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx)); LCP in edit mode; focus traps/restore; reduced motion ([motion-panel](../src/components/edit-chrome/inspectors/motion-panel.tsx)); SR announcements.

**Acceptance:** Large pages usable; drag/typing don’t lag; keyboard + SR viable on major flows.

---

### Phase 10 — Post-v1 extras

**Do not block premium core** unless product escalates:

- Full revision visual diff; deep comments/presence; share analytics; prototype import; arbitrary AI layout generation; HSL/eyedropper theme polish; design-reference import.

---

## 4. PR-sized task tables

Use task IDs in commits/PR titles when helpful (e.g. `feat(edit-chrome): P3-2 drop zone polish`).

### Phase 0 — QA

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P0-1 | Run real-host QA matrix (390/820/1440) and log bugs | — | Low | QA doc / ticket list | Manual |
| P0-2 | Repro + fix: new section in nav but not on canvas (CMS page) | [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx), insert action, RSC cache, [selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx) scroll | Med | Insert → section visible without hard refresh | Manual + typecheck |
| P0-3 | Document deferred bugs with severity | `docs/` or Linear | Low | Each item has owner | Review |

### Phase 1 — Hygiene

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P1-1 | Verify legacy `/admin/site-settings/*` → workspace Website | [legacy-site-settings-redirect.ts](../src/lib/site-admin/legacy-site-settings-redirect.ts) | Low | No 404 on bookmarks | Manual |
| P1-2 | Audit orphan actions; wire or remove per convergence | `web/src/lib/site-admin/edit-mode/` | Med | No dead publish/AI entry points | Lint scope + tenant tests if actions |
| P1-3 | Drawer mutex regression checklist | [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md), PR template | Low | New drawers follow mutex | Code review |

### Phase 2 — Trust / copy

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P2-1 | Publish drawer: blocking vs advisory copy hierarchy | [publish-drawer.tsx](../src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../src/components/edit-chrome/PublishPreflight.tsx) | Low | Non-technical copy | Manual |
| P2-2 | Draft vs published indicator pass | [topbar.tsx](../src/components/edit-chrome/topbar.tsx), [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx) | Low | Clear state | Manual |
| P2-3 | Publish failure `aria-live` parity | [edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx) | Low | SR hears failures | VoiceOver spot |

### Phase 3 — Canvas

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P3-1 | Canvas drag parity with navigator | [selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx), [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx) | Med | Same order both surfaces | Manual |
| P3-2 | Drop zone / handle visual polish | [selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx), kit | Low | Premium feel | Manual |

### Phase 4 — WYSIWYG

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P4-1 | Toolbar + marker cleanup | [inline-editor.tsx](../src/components/edit-chrome/inline-editor.tsx) | Med | No raw markers | Manual |
| P4-2 | Link/CTA inline safety | inline editor + actions | Med | Safe edits | Manual |

### Phase 5 — Library

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P5-1 | Advanced gate + category copy pass | [composition-library.tsx](../src/components/edit-chrome/composition-library.tsx) | Low | No flat 40-type wall | Manual |
| P5-2 | Default content quality for top starters | template starters | Med | Polished insert | Manual |

### Phase 6 — Shell

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P6-1 | Shell selection + inspect MVP | Public shell components, edit chrome | **High** | Header/footer selectable | Manual + tenant tests |
| P6-2 | Shell publish + `tagFor` / revalidate audit | [phase-b-site-shell.md](./phase-b-site-shell.md), site-admin | **High** | No stale shell | Smoke + isolation |

### Phase 7 — Governed Hero

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P7-1 | Hero variant + slot schema (governed) | hero section, [legacy-section-tree.ts](../src/lib/site-admin/builder-node/legacy-section-tree.ts), builder-node | **High** | Honest UI | Manual |
| P7-2 | Inspector: layout/slot controls vs props-only | [inspector-dock](../src/components/edit-chrome/inspector-dock.tsx), builders | **High** | Matches section 7 | Manual |

### Phase 8 — Responsive authoring

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P8-1 | Per-breakpoint visibility MVP | builder node style, inspectors | Med | Mobile hides work | Manual |
| P8-2 | Builder chrome 390px pass | edit-shell, drawers | Med | Usable | Manual |

### Phase 9 — Perf / a11y

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P9-1 | `router.refresh` batch / debounce audit | [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx) | Med | Less thrash | Profile |
| P9-2 | Drawer focus trap audit | drawers, [kit](../src/components/edit-chrome/kit/) | Med | Focus restored | Keyboard |

### Phase 10 — Post-v1

Track in [builder-excellence-execution-plan.md](./builder-excellence-execution-plan.md); pull forward only by product call.

---

## 5. Readiness gates

### Internal QA ready

- `npm run typecheck` passes.
- `npm run test:tenant-isolation` passes when tenant/server paths touched.
- Main builder routes work on a **registered** host.
- No major console errors in smoke.
- **Phase 0 real-host QA** completed (or explicitly waived with risk note).

### Pilot agency ready

- Publish flow feels **safe** (Phase 2 minimum).
- Header/footer either **editable** (Phase 6 progress) or **clearly communicated** limitation.
- Mobile / tablet / desktop QA done once.
- Section library **usable** for real pages.
- Support knows **known limitations** (honesty principle).

### Premium self-serve ready

- Header/footer **editable** and publish-safe.
- Publish trust + recovery complete.
- Responsive authoring **strong** (Phase 8).
- Hero + key sections on **governed** composition path (Phase 7).
- Onboarding/empty states clear.
- No major broken controls.
- Performance acceptable on **large** pages.

---

## 6. Do not do yet (unless escalated)

- Unlimited arbitrary nesting.
- Full multiplayer presence.
- Full visual revision diff (beyond restore UX).
- Prototype import.
- AI-generated **arbitrary** layouts (bypassing section system).
- Full Webflow-style freeform canvas.
- Advanced theme eyedropper / HSL polish as a **blocker**.

**Governed flexibility first; chaos later.**

---

## 7. Important product principle (honest UI)

| Under the hood | Present it as |
|----------------|---------------|
| Field inside fixed section schema | **Field editing** — forms, labels, no fake “layers.” |
| Real reorderable/patchable child in builder tree | **Child-element editing** — list, reorder, nest within rules. |
| Governed Section → Layout → Slot → Element | **Layout composition** — variants, slots, clear limits. |

Do **not** imply Webflow/Figma-level freedom until the **data model and mutations** support it.

---

## 8. First PR recommendation (prioritized)

**Status:** The **P0-2 CMS insert → canvas** fix above is **implemented**; treat **Phase 2 starter — publish trust copy** as the next **code** PR unless QA surfaces regressions.

**Next suggested merges:**

1. **Phase 2 starter:** Publish drawer / preflight hierarchy + draft vs published clarity (**low risk**, no architecture churn).

2. **Parallel (non-code):** Phase **0** registered-host QA checklist — **required** before declaring pilot-ready.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-09 | Initial canonical roadmap; supersedes ad-hoc mixing of audit/backlog/phases for day-to-day execution. |
| 2026-05-09 | P0-2: CMS draft canvas — `loadPageForRender` + select inserted section + `await router.refresh()` ([page-reads](../src/lib/site-admin/server/page-reads.ts), [edit-context](../src/components/edit-chrome/edit-context.tsx)). |
