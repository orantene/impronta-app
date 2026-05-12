# Builder deep audit — product, UX, technical, visual, QA (2026-05-09)

**Execution roadmap:** Day-to-day prioritization now lives in **[builder-execution-plan-2026.md](./builder-execution-plan-2026.md)** (phases 0–10, PR-sized tasks, readiness gates). This document remains the evidence record and discovery detail.

**Related:** [builder-convergence-plan.md](./builder-convergence-plan.md), [builder-experience-execution-plan.md](./builder-experience-execution-plan.md), `docs/mockups/builder-experience.html`.

**Verification run this session**

| Command | Result |
|---------|--------|
| `npm run typecheck` (`web/`) | Pass |
| `npm run test:tenant-isolation` | Pass |
| `npm run lint` (`web/`) | **Fail baseline:** hundreds of pre-existing issues across the repo (not isolated to edit-chrome). Treat lint debt separately from builder readiness. |
| Browser QA at 1440 / ~820 / ~390 | **Not automated here.** Manual pass recommended using a tenant host in `agency_domains` per `CLAUDE.md`. |

**Code fix landed during this audit (low-risk)**

- **Viewport switcher a11y:** `topbar.tsx` — `role="group"` + `aria-label="Canvas preview width"` on the segmented control; each device button gets matching **`aria-label`**, **`aria-pressed`**. Improves keyboard/screen-reader parity for preview widths.

---

## 1. Executive summary

### Overall builder health

The builder is **past prototype** for core homepage/CMS composition: **EditShell**, **selection**, **navigator**, **inspector**, **publish**, **revisions**, **preflight wiring**, **tenant-scoped actions**, and a **real builder-node model** (types + operations + legacy synthesis from section props). It is **not yet best-in-market premium**: **site shell (header/footer) as first-class editable regions**, **fully persuasive publish trust UX**, **consistent nested composition across all section families**, and **polished responsive builder chrome** remain gaps tracked in the convergence plan.

### Biggest blockers (premium bar)

1. **Site-wide shell editing (Phase B)** — Capability **#1** in the convergence doc; without it the product feels like “page body only.”
2. **Honest nested composition** — Types support deep trees (`container`, `split`, `carousel`, …), but **many live sections still expose “fake” child nodes** derived from flat section props (`deriveLegacySectionChildNodes` / `legacy-section-tree.ts`). Users see Headline/CTA chips but **cannot freely reorder/add/remove** the way a Webflow-style builder implies.
3. **Lint / QA baseline** — Full-package `npm run lint` does not pass repo-wide; shipping depends on scoped gates or incremental cleanup.
4. **`agency_domains` QA hosts** — Preview URLs that are not registered hosts will 404 at middleware; operators must test on aliased or production hosts.

### Biggest UX gaps

- **Draft vs published mental model** — Autosave exists but **“what is live?”** could be clearer for non-technical users without reading chrome subtleties.
- **Navigator vs canvas vs inspector** — Powerful but **easy to overwhelm**; onboarding copy is thin.
- **Section library** — Strong Phase D direction (`composition-library.tsx`); still risks **cognitive load** until Advanced gate + categories match operator vocabulary everywhere.

### Biggest visual quality gaps

- Mixed **kit surfaces** (Tailwind storefront vs inline-token chrome) — intentional but must stay disciplined for **premium cohesion**.
- **Device preview** is **layout simulation**, not full per-breakpoint author overrides for every legacy section field.

### Biggest technical risks

- **`router.refresh()` churn** under rapid edits (audit item; debouncing partially addressed in places).
- **Synthetic builder nodes vs persisted tree** — Two pathways must stay in sync (`syncBuilderTreeSectionChildren`, `applyFieldEdit`, `persistBuilderTree`).
- **AI discipline** — `suggestLayoutImprovement` was an orphan server action (**removed 2026-05**); unified AI UX remains post-v1.

### Highest-impact improvements (ranked)

1. Ship **Phase B shell** when safe + **cache invalidation** for shell publishes.
2. **Section variants + governed blocks** before unlimited nesting (see section 11 below).
3. **Continue convergence**: single editor path (workspace Website + `?edit=1`) — redirects adjusted toward `/{slug}/admin/website` for legacy bookmarks.
4. **Preflight + publish copy** — Make blocking vs warning obvious; SR announcements for failures (partially present via edit-shell toasts).
5. **Performance**: lazy drawers (partially done), batch refresh, profile selection layer on low-end devices.

---

## 2. Critical broken items

| Area | Problem | User impact | Severity | Suggested fix | Status |
|------|---------|-------------|----------|---------------|--------|
| QA / CI | Full `npm run lint` fails with hundreds of issues repo-wide | Cannot use lint as global merge gate | **High** (process) | Scoped lint on touched paths; chip away baseline | Needs work |
| Preview QA | `*.vercel.app` / unregistered hosts → middleware 404 | “Builder broken” on raw preview URL | **High** | Document + test only on registered hosts (`CLAUDE.md`) | Documented |
| Site shell | Header/footer not editable as body sections | Incomplete site control | **Critical** (product) | Phase B per convergence plan | Deferred (major) |
| Nested hero “nodes” | Children **derived from props**, not free composition | User expects drag-reorder of headline vs CTA like Figma | **High** (expectations) | Variants + governed blocks + clearer UI copy | Needs work |
| AI | `suggestLayoutImprovement` had no UI home | Orphan capability | **Medium** | Removed 2026-05; reinstate with unified AI panel | **Removed** |

---

## 3. UX and visual quality issues

| Surface | What feels wrong | Why it matters | Recommended improvement | Status |
|---------|------------------|----------------|-------------------------|--------|
| Website admin (`/{slug}/admin/website`) | Was unclear page cards did nothing | Users think builder is broken | Wired clicks → storefront `?edit=1`; helper copy; empty states | **Fixed** (prior change set) |
| Top bar | Device toggle relied on `title` only | SR users | `aria-label` + `aria-pressed` + group label | **Fixed** |
| Publish drawer | Dense checklist | Fear of publishing | Progressive disclosure; stronger “blocking vs advisory” | Needs work |
| Inspector | Technical labels on builder nodes | Non-technical operators | Plain-language subtitles per tab | Needs work |
| Command palette | Dense feature surface | Discovery | Keep palette; improve grouping copy | Needs work |

---

## 4. Responsive issues

| Screen | Surface | Problem | Fix | Status |
|--------|---------|---------|-----|--------|
| ~390px | Right rail drawers | Drawer width vs thumb reach | Bottom-sheet patterns already in library overlay; align other drawers over time | Needs work |
| ~820px | Inspector + navigator + canvas | Horizontal pressure | Collapse navigator by default on tablet breakpoint option | Needs work |
| 1440px | Device preview | Preview frame accurate but **not** full breakpoint authoring for all legacy props | Document; ship tokens + overrides incrementally | Deferred |

---

## 5. Publish and trust issues

| Problem | Risk | Fix | Status |
|---------|------|-----|--------|
| Preflight severity mixed with UX expectations | Users ignore warnings | Stronger blocking semantics + summary sentence | Needs work |
| Revisions without diff | Restore anxiety | Copy + optional summary (convergence plan revision diff milestone) | Partially addressed in revisions drawer copy |
| Undo vs revisions | Recovery confusion | Cmd-Z vs Restore explained | Partially addressed in context + drawer |

---

## 6. Performance issues

| Area | Cause (known) | Impact | Fix | Status |
|------|-----------------|--------|-----|--------|
| Drawers | Large client bundles | Slow open | Dynamic import rare drawers (partially implemented in `edit-shell.tsx`) | Partial |
| Selection layer | MutationObserver + scroll listeners | Jank on huge pages | rAF throttle / prune observers | Needs work |
| `router.refresh()` | Frequent mutations | Flash/thrash | Debounce batch refresh | Needs work |

---

## 7. Accessibility issues

| Area | Problem | Fix | Status |
|------|---------|-----|--------|
| Viewport switcher | Missing explicit SR semantics | Group + `aria-pressed` | **Fixed** |
| Drawers | Focus trap completeness | Audit each drawer against modal pattern | Needs work |
| Publish failures | SR announcements | Align with `MutationErrorToast` patterns (`aria-live`) | Partial |

---

## 8. Tenant safety / route safety issues

| Route / action | Risk | Fix | Status |
|----------------|------|-----|--------|
| Composition save actions | Cross-tenant write | Guarded server-side + scope tests | OK — isolation tests pass |
| Share / preview tokens | Token scope | Existing JWT + claims path | Needs periodic audit |
| Legacy `/admin/site-settings/*` | Wrong destination | Redirect to `/{slug}/admin/website` | Adjusted per operator workflow |

---

## 9. Immediate fixes completed (this audit pass)

1. **Viewport switcher** — Accessible **`role="group"`**, **`aria-label`**, per-button **`aria-pressed`** (`web/src/components/edit-chrome/topbar.tsx`).
2. **Verification** — `npm run typecheck` ✅, `npm run test:tenant-isolation` ✅.

*(Earlier in the same initiative: workspace **Website** surface wiring for opening the visual editor, legacy redirect alignment — see git history / related PR.)*

---

## 10. Remaining backlog

### Must fix before marketing as premium SaaS builder

- Phase **B** shell editing + invalidation.
- Clarify **nested composition story** vs legacy sections (UX + product truth).
- **Responsive authoring** beyond viewport preview (incremental).

### Should fix soon

- Drawer **focus traps** end-to-end.
- **router.refresh** batching.
- **Lint** baseline reduction or scoped CI gate.

### Can wait

- Full **revision diff** (mockup surface 16).
- Advanced **AI layout suggest** panel.

### Future advanced builder

- Full **Page → Section → Layout → Block → Element** with governance.
- **Per-device overrides** for all elements.
- **Design tokens** globally surfaced.

---

## 11. Final recommendation

### Is the builder ready for real users?

**Ready for staffed / pilot agencies** with training and **correct QA hosts**, **not** ready as a self-serve “no docs” premium SaaS for arbitrary non-technical owners until shell + trust + composition story mature.

### Is it only ready for internal testing?

**No** — it can ship to **trusted tenants** with support; position it as **professional internal-grade** until Phase B + polish land.

### What must finish before “premium SaaS feature” positioning?

1. Editable **header/footer** or honest framing if deferred.
2. **Publish trust** narrative end-to-end (preflight + recovery copy + SR).
3. **Performance** pass on large pages.
4. **Responsive builder chrome** polish at 390 / 834 / 1440.
5. **Composition clarity** — users must never think child picks are full layout freedom when they are field-backed.

### Top 5 next actions

1. Execute **Phase B shell** per `builder-convergence-plan.md` + cache audit (`tagFor` / revalidate).
2. **Product copy pass** on navigator / inspector / publish (“what is selected / what will publish”).
3. **Nested model roadmap**: variants + governed blocks (`NestedBlocksCard` patterns) before unlimited nesting.
4. **Performance**: profile selection-layer + debounce refresh.
5. **Accessibility sweep**: drawers + palette focus restore + publish `aria-live`.

---

## 12. Nested composition — dedicated audit

### Truth: three levels

| Level | Meaning | Today |
|-------|---------|--------|
| **1 — Field editing** | Edit props inside a fixed schema | **Dominant** for legacy sections (hero, CTA banner, etc.). |
| **2 — Child element editing** | Select synthetic or real nodes; limited reorder/add under rules | **Partial** — real nodes where builder tree persists; **synthetic** nodes mirror props (`deriveLegacySectionChildNodes`). |
| **3 — Nested composition** | Add/remove/reorder containers, columns, blocks freely | **Architecture exists** (`builder-node/types.ts`, `operations.ts`, inspector `BuilderNodeContentInspector`) but **not uniformly available** across all section templates. |

**Evidence — synthetic children:** `legacy-section-tree.ts` builds `heading` / `paragraph` / `button` nodes from **hero props** (e.g. `heroChildNodes`). Those IDs are stable conventions (`:heading:headline`), not arbitrary inserted subtrees.

**Evidence — real nodes:** `BuilderSectionNode` may contain **`children`** for containers, splits, carousels, etc., validated by `BUILDER_NODE_REGISTRY`.

### Section-type truth table (honest defaults)

Replace “Partial” with your QA notes per tenant template.

| Section type | Child selection real? | Child reorder? | Add child elements? | Layout variants? | Responsive child control? | Current level | Gap |
|--------------|----------------------|----------------|---------------------|------------------|---------------------------|---------------|-----|
| Hero | **Partial** — synthetic nodes from props | **Limited** — reorder maps to prop order only where implemented | **No** arbitrary inserts | **Partial** — section presets / props | **Partial** — mostly section-level | **1 → low 2** | True split hero needs composition or variants |
| Gallery | **Partial** | **Partial** | **Partial** | **Partial** | **Partial** | **1–2** | Depends on template |
| Slider / carousel | **Partial** — builder `carousel` kind exists | **Partial** | **Partial** | **Partial** | **Partial** | **2** where wired | Else **1** |
| CTA banner | **Partial** synthetic | **Limited** | **Rare** | Props | Limited | **1** | Variants |
| Talent grid | **Mostly 1** field/bindings | No free child graph | No | Template | Limited | **1** | Governance |
| Testimonial | **1** | No | No | Props | Limited | **1** | Blocks |
| FAQ | **Partial** if accordion nodes used | **Partial** | **Partial** | Accordion patterns | Partial | **1–2** | Data-driven lists |
| Contact | **1** | Forms fields | Limited | Props | Limited | **1** | Structure |

### Answers to audit questions (concise)

1. **Are child nodes real?** — **Mixed.** Legacy sections: **selection targets map to props**. Advanced compositions: **real nodes** in persisted builder tree.
2. **Reorder children?** — Only where **move operations** apply to **persisted** siblings; synthetic ordering usually mirrors **prop structure**, not free DOM-like reorder.
3. **Add children inside section?** — **Where registry + inspector expose insert** (`insertBuilderNode`, `NestedBlocksCard`) — yes; **not** for every legacy template.
4. **Change layout inside section?** — **Variants + props + builder nodes** — partial; not universal “pick split layout” on every hero.
5. **Background / layers?** — Section-dependent; hero/media templates vary; **no universal layer stack UI** yet.
6. **Sliders at child level?** — **Possible in model**; verify per section renderer + inspector wiring.
7. **Layout tab child order?** — **layout-panel.tsx** targets advanced nodes; legacy sections often **section-level only**.
8. **Responsive tab child behavior?** — **Style tokens** support responsive maps on nodes (`BuilderNodeStyle.responsive`); legacy sections may only preview viewport.

### Architecture recommendation (safest path)

1. **Keep** section-schema model for stability.
2. **Introduce governed composition presets** (already seeded via `BUILDER_NODE_COMPOSITION_PRESETS` patterns) and **section variants** before unlimited nesting.
3. **Promote** high-value layouts (split hero, card grid) via **variants + slots**, not raw arbitrary trees at first.
4. **Gradually migrate** legacy templates from pure props → **slot-backed builder subtrees** where ROI is highest.
5. **Do not** expose unconstrained nesting until validation + UX for reorder/add/remove is bulletproof.

This matches **“Section → Layout → Slot → Element”** as the **governed** stepping stone toward Level 3.

---

## 13. Definition of done (audit)

- [x] Major surfaces reviewed against codebase (shell limitation acknowledged).
- [x] Nested composition honestly assessed (props-backed vs tree-backed).
- [x] `typecheck` + `tenant-isolation` run; **lint** outcome documented.
- [ ] Full browser matrix — **operator must run** on registered tenant host.
- [x] Low-risk fix: viewport **a11y** shipped.
- [x] Roadmap and backlog captured above.

---

*End of report.*
