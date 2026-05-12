# Builder roadmap — unified execution plan (2026)

**Single source of truth** for the builder: locked phases, PR tasks, readiness gates, honesty principle, implementation status, first-PR guidance, and changelog — **edit only this file** for roadmap changes.

**Canonical working roadmap for Tulala / Impronta.** Use this for daily prioritization. Detailed evidence and discovery lives in [builder-deep-audit-2026-05-09.md](./builder-deep-audit-2026-05-09.md). Strategic alignment: [builder-convergence-plan.md](./builder-convergence-plan.md). Surface scorecard: [builder-experience-execution-plan.md](./builder-experience-execution-plan.md).

**Advanced Mode is gated on 7A. Phase 5 templates do not equal Advanced Mode.**

## Strategic framing and execution truth

### Strategic stance

- **Phase 7 is not “done” because `BuilderNode` (or builder infrastructure) exists.** **Advanced Mode begins only when Phase 7A (Element Library MVP)** ships. The “advanced builder” story is **gated on 7A**, not on Phase 5 template polish alone.
- **Simple Mode** — templates, inserter, and Phase 5 flows: polished pages without governed **element** primitives.
- **Advanced Mode** — begins at **7A**: blank/minimal section → insert **elements** from a governed library → reorder → edit → publish → hard refresh → **persists**, with an **honest** builder tree (no synthetic “layers”).

### Guardrails

| Trap | Rule |
|------|------|
| Docs vs reality | Updating the roadmap **≠** shipping; verify against code and QA. |
| Templates vs element library | **Section templates ≠ element library.** Do not treat template volume as “library MVP.” |
| Milestones before 7A | Do **not** make **template count expansion** the main milestone **ahead of 7A** unless product escalates. |
| Fake layers | Do not present **field-backed** props as **reorderable child nodes**; stay aligned with section 7 (honest UI) and [`legacy-section-tree.ts`](../src/lib/site-admin/builder-node/legacy-section-tree.ts). |
| Phase numbers vs build order | **Phase 6 (shell)** and **Phase 7A** are **different tracks** — dependency wins, not numeric order. |

### First 7A demo target (acceptance)

On a **registered tenant host** (see [AGENTS.md](../../AGENTS.md), [OPERATING.md](../../OPERATING.md), [web/AGENTS.md](../AGENTS.md), and [Phase 0 registered-host QA](./phase-0-qa-registered-host.md)):

The **first true product proof** for 7A must follow **First 7A proof must use Blank Section** below — **not** Hero, **not** a starter template, and **not** a locked section preset. Quick exploratory demos may use a minimal scaffold only when labeled **non-shipping**.

Every element inserted through the Element Library must pass the **7A Reality Test** (below).

If any step fails, **7A is not done**.

### Governed composition: 7A–7D (product framing)

Communicate nested composition as **sub-phases**, not one blob named “Phase 7”:

| Subphase | Name | Goal (one line) |
|----------|------|-----------------|
| **7A** | Element Library MVP | Real persisted nodes from a library; insert/reorder; honest inspector — **mandatory** before “Advanced Mode” claims. |
| **7B** | Hero pilot | First vertical composition pilot (variants, slots, media). Current roadmap “Phase 7 Hero” tasks belong **here**; **does not replace 7A**. |
| **7C** | Repeat pattern | CTA, gallery, slider, testimonials, talent grid, contact — same governance pattern as Hero. |
| **7D** | Governance scale | Depth limits, allowed parents, validation, perf budgets as composition spreads. |

Phases **8–10** in §3 stay as written (responsive authoring, perf/a11y, post-v1).

### PR task IDs

Full task rows (files, risk, test) live in **§4** — **Phase 7A — Element Library MVP** (P7A-0 … P7A-7) and **Phase 7B — Governed Hero** (P7B-1, P7B-2). Use **P7B-*** for Hero-only work so it is never mistaken for the element-library MVP.

### What 7A is not

Claiming **7A** requires real library-backed **persisted** elements — not any of the following:

- More **ready-made section templates** (that is Phase 5 / library density, not 7A).
- **Synthetic child rows** derived from legacy flat props.
- A **visual list of fields** pretending to be layers.
- A **Hero-only variant picker** (that is **7B**, on top of 7A).
- A **template gallery** relabeled as “element library.”

### 7A MVP element allow-list

Lock first-ship scope to:

**In MVP (kinds):** Blank Section, Container, **Card** (`card`), **CTA group** (`cta_group`), Columns (`split`), Heading, Paragraph, Button, Image, Divider, Spacer — each maps to a real `BuilderNodeKind` and persisted tree node.

**Composition note:** Container and Columns remain general-purpose layout primitives; Card and CTA group add **named surfaces** (bounded panel + inline actions row) while staying nestable like containers.

**Not in MVP:** Video, Forms, Slider items, dynamic repeater cards, arbitrary custom code — pull forward only by explicit product call.

### Persistence truth (7A)

7A nodes must persist through the **same builder tree / snapshot path** used for **draft and publish** (the path real sections use today). If an element exists only in **client-only state**, **localStorage**, **inspector draft props without persisted nodes**, or a **synthetic legacy projection**, **7A is not shipped**.

### Migration rule (legacy sections)

**Do not break** current shipped sections. **Legacy sections stay supported.** 7A lands on **blank/custom** composition surfaces first. **7A must not rewrite** existing Hero, CTA, Gallery, Talent Grid, Contact, or similar legacy sections — those migrate **later** through **7B / 7C**. **Do not rewrite all legacy sections inside the first 7A PRs.**

### Simple vs Advanced Mode UX rule

- **Simple Mode** is the **default** for non-technical users (templates, starters, Phase 5 library).
- **Advanced Mode** is **opt-in inside the builder**, beginning with **Blank Section / Custom Section** flows that expose **real element composition**.
- The UI must **say plainly** when the user is editing a **ready-made section** versus **composing real persisted elements**, so we never imply Webflow-level freedom without the data model.

### No destructive QA reset (Impronta)

Impronta is both the **QA tenant** and a **real brand surface**. QA cleanup must **prefer draft-only reset** (discard draft `cms_page_sections`, use runbooks). **Do not** clear **published** homepage snapshots or **purge** production sections unless the user **explicitly** asks for blank-canvas destructive testing.

### Roadmap revision checklist

Ongoing hygiene:

- [ ] Append a **changelog** row after substantive roadmap edits.
- [ ] If code ships with roadmap edits, run **`npm run typecheck`** (and scoped lint / `npm run ci` per AGENTS.md).

---

## Phase 7A guardrails (execution)

These guardrails prevent **7A** from becoming another **fake layer** system or an internal registry dressed as a library.

### 7A Reality Test

For **every** element inserted through the **Element Library**, verify **before** claiming 7A shipped:

| Check | Requirement |
|-------|-------------|
| Persisted identity | It has a **real persisted** builder/node ID on the **server-backed** tree (not props-only illusion). |
| Navigator | It appears in the **navigator** as a **real** node — not a synthetic row from legacy flat props. |
| Selection | It can be **selected independently** from sibling nodes. |
| Edit | It can be **edited independently** (inspector drives **persisted** fields / children). |
| Reorder | It can be **reordered** wherever governance allows (navigator **and** canvas stay aligned). |
| Draft | Changes **survive draft save** / autosave path used by real sections. |
| Publish | Changes **survive publish** (snapshot matches intent). |
| Reopen | After **hard refresh** or **reopen**, the tree **matches** what was edited — **no client-only recovery**. |
| Not legacy-derived | It is **not** represented **only** as derived children from **legacy section props** without persisted nodes. |
| Not client-only | It is **not** **local-only** / transient UI state without persisted backing. |

If **any** check fails for **any** allow-list element, **7A is not shipped**.

### First 7A proof must use Blank Section

**Blank Section is the first product proof.** The **first Advanced Mode proof** must **not** use Hero, a **starter template**, or a **locked section preset**.

Minimum sequence on a **registered host**:

1. Insert **Blank Section** / **custom blank** composition surface (not a marketing starter).
2. **Add** at least **Heading**, **Paragraph**, **Button**, **Image**, and **Divider** or **Spacer** — each as **persisted** nodes from the library.
3. **Reorder** nodes within governance rules.
4. **Edit** each independently; confirm inspector honesty.
5. **Publish** → **hard refresh** → **reopen** → confirm **identical** persisted tree.

**Why:** Starting from Hero or templates lets the team slide back into **template wiring** instead of **real architecture**.

### 7A Gate 0 — persistence checklist (historical discipline)

**Originally:** Library UI (**P7A-1**) was intentionally **after** **P7A-0** so insert flows did not land on broken persistence.

**Today:** **P7A-0** paths and **P7A-1** UI are **in the codebase**. Treat the bullets below as **regression / review criteria** when changing draft, publish, or tree validation — not as a blocker to new UI work.

When auditing or refactoring persistence, confirm:

- **Persisted node shape** for library inserts (IDs, types, parent pointers).
- **Allowed parent/child rules** (see governance table below).
- **Draft save path** for mutations.
- **Publish snapshot path** (what SSR/routes read).
- **Reopen/read path** after refresh (RSC + client reconcile).
- **Tenant scoping** (RLS / agency isolation).
- **Undo/redo expectation** (explicit MVP behavior — even if “limited”).
- **Kill switch / tenant feature flag** path (safe disable without destroying legacy pages).
- **Non-interference** with existing legacy sections (no mandatory migration inside 7A).

### P7A-0 deliverable format

**P7A-0 must produce a concrete technical deliverable** — not architecture vibes. Before **P7A-1**, the output should be **written down and/or coded** to the point another engineer can implement UI against it without guessing.

**1. BuilderNode persistence contract**

- **Node shape** — fields for type, payload, metadata.
- **IDs** — stable identity for persisted nodes (draft + publish).
- **Parent/child relationship** — how nesting is stored and validated.
- **Ordering** — sibling order key / array semantics.
- **Allowed node types** — enum or equivalent aligned with allow-list.
- **Style/content payload location** — where typography/spacing/content live vs structural props.

**2. Allowed parent/child matrix** — explicit for **Blank Section**, **Container**, **Columns**, **Column**, **Card**, **CTA Group** (and how it ties to the **Parent / child governance** table below — **frozen** as schema rules / validation, not prose-only).

**3. Draft mutation path** — how **insert / update / move / delete** persist **before** publish (server actions, RPC shape, optimistic behavior if any).

**4. Publish snapshot path** — how the **custom tree** becomes **public output** (what tables/snapshots SSR reads).

**5. Reopen/read path** — how **SSR / RSC / client** load the **same tree** after **hard refresh** (no orphan client-only state).

**6. Renderer path** — where each **MVP element** renders from; how **unknown / invalid** nodes **fail safely** (no white-screen / silent drop).

**7. Inspector routing** — how selecting **Heading** vs **Button** vs **Image** routes to the **correct** inspector surface.

**8. Navigator routing** — how **real** nodes appear in the tree; how **synthetic legacy** rows stay **visually distinct** (honesty).

**9. Feature flag / kill switch** — how **7A is disabled per tenant** without damaging **existing** pages.

**10. Test proof**

- **`npm run typecheck`**
- **`npm run test:tenant-isolation`** when server/tenant paths touched
- **One manual** draft → publish → reopen proof for a **seed node** (or smallest persisted insert) **if possible** before UI ramp.

**Acceptance for P7A-0**

We know **exactly**:

- **Where** custom element nodes **persist**.
- **How** they **render**.
- **How** they **publish**.
- **How** they **reopen** after refresh.
- **How** they are **scoped** by tenant.
- **How** to **disable** the feature safely.

→ **Only then is P7A-1 safe to start.**

**P7A-0 close-out:** End with one explicit line — **`Proceed to P7A-1`** **or** **`Blocked because ___`** (specific blocker, owner, next step).

### 7A Inspector MVP (lock scope)

Do **not** ship animation suites, forms, video, arbitrary **custom CSS**, or arbitrary code in **7A**. Lock inspectors to:

| Element | Controls (MVP) |
|---------|------------------|
| **Heading** | Text, level, alignment, color, size, spacing |
| **Paragraph** | Text, alignment, color, size, spacing |
| **Button** | Label, URL, style, size, alignment, open in new tab |
| **Image** | Source, alt text, width, radius, alignment |
| **Container** | Width, padding, gap, alignment |
| **Columns** | Column count, gap, ratio, mobile stack |

*(Divider, Spacer, Card, CTA Group: minimal geometric/spacing + content fields only — no new subsystem per component beyond this discipline.)*

### Parent / child governance (7A)

Allowed structure **for 7A** (evolves in **7B/7C** with review):

| Parent | Allowed children |
|--------|------------------|
| **Blank Section** | Container, Heading, Paragraph, Button, Image, Divider, Spacer, Columns, Card |
| **Container** | Heading, Paragraph, Button, Image, Divider, Spacer, Columns, Card, CTA Group |
| **Columns** | Column only |
| **Column** | Heading, Paragraph, Button, Image, Divider, Spacer, Card, CTA Group |
| **Card** | Heading, Paragraph, Button, Image |
| **CTA Group** | Button only |

Invalid drops should **fail closed** (no silent coercion).

### No legacy migration inside 7A

**7A does not migrate or rewrite** existing Hero, CTA, Gallery, Talent Grid, Contact, or similar sections. It lands on **Blank Section / Custom Section** first. **Existing sections migrate later** through **7B** and **7C** with explicit plans.

### Feature flag / kill switch (required)

**7A ships behind a tenant feature flag** until **publish / hard refresh / reopen** QA is stable on real tenants. If rendering or persistence is wrong, operators need a **safe disable** path that **does not** corrupt existing published pages.

### Element Library UX standard

The **Add Element** experience must feel like a **premium builder**, not a **developer registry**:

- **Categories:** Layout, Text, Media, Actions, Structure (or equivalent plain-language buckets).
- **Names:** user-facing (**Heading**, **Text**, **Button**, **Image**, **Divider**, **Spacer**, **Columns**…) — **no raw internal node type strings** in the default UI.
- **Short descriptions** under each choice where helpful.
- **Small preview or icon** per item.
- **Disabled** choices only with a **clear** reason (governance, plan, or parent mismatch).
- **Premium density** — calm spacing, readable hierarchy; not a flat dump of types.

### Simple Mode must stay clean

**Advanced Mode is opt-in.** **Simple Mode** remains the default path: **premium ready-made sections** and **starters** (Phase 5). Users reach element composition through **Blank Section / Custom Section** (or explicit Advanced entry) — **never** by forcing non-technical users through raw element assembly.

### 7A Demo Evidence

The **first 7A proof** must include **screenshots or a short screen recording** — text-only claims are **not** enough for product-ready acceptance.

Capture **all** of the following:

1. **Blank Section** inserted (composition surface visible).
2. **Heading**, **Paragraph**, **Button**, **Image**, and **Divider** or **Spacer** inserted as **real persisted** elements (not props theatre).
3. **Navigator** showing those nodes as **real** tree entries.
4. **Inspector** editing **one** selected element **independently** of siblings.
5. A **reorder** action (navigator and/or canvas, per governance).
6. **Publish**.
7. **Hard refresh** / **reopen** session.
8. The **same custom section** still **renders correctly** and matches persisted structure.

Without **visual proof**, **7A is not accepted** as product-ready (“works in code” is insufficient).

### 7A Design Guardrails

Element Library MVP must be **flexible but not visually unsafe**. Defaults must be **premium**, not raw HTML chaos:

- **Heading** — sensible default **size** and **line-height**.
- **Paragraph** — readable **max width** (or governed measure).
- **Button** — uses **brand tokens** (not ad-hoc hex soup).
- **Image** — safe default **radius** / crop framing.
- **Container** — **governed spacing** (padding/gap presets tied to design system).
- **Columns** — sensible **gap**, **ratio**, and **mobile stack** defaults.
- **Divider / Spacer** — **controlled presets** only — not arbitrary pixel sliders that invite ugly layouts.

Default-inserted elements should look **polished**, not “developer playground.” The goal is **not only** “can insert elements” — it is **insert elements and still ship a premium page** inside governed defaults.

---

## Planning freeze

After this roadmap update, **no new broad builder planning documents** should be created until **P7A-2…4 are accepted** against the **7A Reality Test** (with demo evidence) **or** **implementation exposes a real blocker** that requires a scoped doc.

**Allowed next work:**

- Impronta **QA baseline** cleanup (non-destructive where possible).
- **Core loop** verification (add → edit → reorder → publish → reopen) on a **registered host**.
- **P7A-2 / P7A-3 / P7A-4** — honest selection, reorder parity, full round-trip acceptance (fix QA gaps).
- **Critical bug fixes** discovered during those tasks.

**Not allowed:**

- More **abstract roadmap reshuffling** without shipped code.
- **Template expansion** as the **main** milestone (that is **not** Element Library MVP).
- New **“future builder”** essays **without** matching implementation progress.
- **Hero-only composition** pretending to be **Element Library MVP** — Hero is **P7B**, **after** **7A** primitives exist.

**Why:** Otherwise agents (and humans) can keep producing excellent documents while **builder QA and acceptance** stall.

---

## Current execution priority (final order)

1. Stabilize **Impronta QA baseline** (non-destructive where possible).
2. **Registered-host proof:** **add → edit → reorder → publish → hard refresh → reopen** + **7A Demo Evidence** (screens or recording).
3. **Accept P7A-2 / P7A-3 / P7A-4** — honest selection, navigator/canvas reorder parity, persisted round-trip — against **7A Reality Test**; fix gaps QA finds.
4. **P7A-5…7** as needed — kill switch hardening, regression hooks, doc truth.
5. Convert **Hero under P7B only after** 7A is **accepted** with evidence (not “code exists”).
6. Resume **Phase 6 shell** / header-footer parity **without** a parallel fake component model.

**Product direction:** **Simple Mode** = premium ready-made sections and starters. **Advanced Mode** = **Blank Section** + **Element Library** + **real persisted elements**.

**No more broad planning** unless implementation exposes a **blocker** — see **Planning freeze** above.

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
- **Real-browser QA on registered tenant hosts** was **not completed** in the automated audit session (`agency_domains`; see [AGENTS.md](../../AGENTS.md), [OPERATING.md](../../OPERATING.md)). Treat this as **Phase 0 gate**.
- **`npm run lint` repo-wide** is **baseline debt**, not builder readiness; use **scoped lint** on touched paths until baseline improves.
- **Parallel truth:** Phases advance **in parallel**; status is **per-phase**, not one linear step.
- **Stabilization bridge:** Phase **0–3** issues (insert/canvas, iframe preview, publish trust) can **block demos** even while 7A is scheduled — track them explicitly.

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

### Phase 7 — Advanced Mode foundation

Phase 7 is split into **7A–7D**. **Do not claim Phase 7 is shipped** until each subphase passes its own acceptance gate. **Having builder infrastructure or `BuilderNode` types is not Phase 7 complete.**

**Model:** **Section → Layout → Slot → Element.** No Webflow-freeform until governance proves out.

#### Phase 7A — Element Library MVP

**Goal:** Governed insert, reorder, edit, publish, and reopen for **real persisted** elements from the **allow-list** (Strategic framing), starting from **blank/custom** composition — **before** Hero-specific vertical work.

**Acceptance:** **First 7A demo target** passes on a registered host; **persistence truth** holds; UI never fakes layers for props-only data.

#### Phase 7B — Governed Hero pilot

**Goal:** Hero as the first **vertical** composition pilot — **only after 7A primitives are real.** Variants (centered, split, image left/right), background image/gradient/color, overlay, eyebrow, headline, subheadline, CTA group, media, badge, optional form; **safe** reorder; responsive order; hide/show per device.

**Acceptance:** Hero **consumes the same element/slot/persistence model as 7A** — not a parallel “Hero-only” fake stack; UI stays honest (see **§7 Important product principle** below).

#### Phase 7C — Repeat pattern

**Goal:** CTA banner, gallery, slider, testimonials, talent grid, contact — **same governance pattern** as Hero, reusing 7A primitives.

#### Phase 7D — Governance scale

**Goal:** Depth limits, allowed parents, validation, perf budgets as composition spreads.

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
| P1-2 | Audit orphan actions; wire or remove per convergence — **done:** removed unused `suggestLayoutImprovement` + `loadAiUsageSummary` (2026-05; see changelog) | `web/src/lib/site-admin/edit-mode/` | Med | No dead publish/AI entry points | `npm run ci` |
| P1-3 | Drawer mutex regression checklist | [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md), PR template | Low | New drawers follow mutex | Code review |

### Phase 2 — Trust / copy

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P2-1 | Publish drawer: blocking vs advisory copy hierarchy | [publish-drawer.tsx](../src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../src/components/edit-chrome/PublishPreflight.tsx) | Low | Non-technical copy | Manual |
| P2-2 | Draft vs published indicator pass | [topbar.tsx](../src/components/edit-chrome/topbar.tsx) (`LiveSitePublishedChip` + `SaveStatus`), [edit-context.tsx](../src/components/edit-chrome/edit-context.tsx), [edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx), [`composition-actions.ts`](../src/lib/site-admin/edit-mode/composition-actions.ts) (`liveSitePublishedAt` from `cms_pages.published_at`) | Low | Clear state | Manual |
| P2-3 | Publish failure `aria-live` parity | [publish-drawer.tsx](../src/components/edit-chrome/publish-drawer.tsx), [PublishPreflight.tsx](../src/components/edit-chrome/PublishPreflight.tsx), [edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx) | Low | SR hears failures + preflight / gate banners | VoiceOver spot |

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

### Phase 7A — Element Library MVP

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P7A-0 | Builder-node schema + persistence contracts + **P7A-0 deliverable format** (concrete spec, not notes) | builder-node, edit-mode actions, migrations as needed | **High** | Deliverable + acceptance met; **Proceed / Blocked** close-out | Tenant isolation + typecheck |
| P7A-1 | Element registry / library UI foundation (blank section → pick element) — **shipped** | composition UI, library chrome, [`mvp-allow-list.ts`](../src/lib/site-admin/builder-node/mvp-allow-list.ts) | **High** | Insert creates **persisted** nodes; **product acceptance** = passes **7A Reality Test** on registered host | Manual + tests |
| P7A-2 | Slot targeting + honest selection for library nodes | inspector, selection-layer, navigator | **High** | Inspector matches **actual** tree | Manual |
| P7A-3 | Reorder / move parity (navigator + canvas) | edit-context, selection-layer | **High** | Same order both surfaces | Manual |
| P7A-4 | Draft → publish → hard refresh → reopen | composition actions, page reads | **High** | Tree matches persisted snapshot | Manual |
| P7A-5 | Tenant **feature flag / kill switch** (required for 7A rollout) | feature flags, shell | Med | **7A stays off until stable**; disable path does not break legacy pages | Manual + tests |
| P7A-6 | QA / regression hooks (smoke, critical paths) | e2e, builder tests | Med | Regressions caught in CI or checklist | CI / manual |
| P7A-7 | Doc + changelog alignment | `web/docs/` | Low | Roadmap reflects shipped truth | Review |

### Phase 7B — Governed Hero pilot

| Task ID | Task | Files likely involved | Risk | Acceptance | Test |
|---------|------|------------------------|------|------------|------|
| P7B-1 | Hero variant + governed slot schema | hero section, [legacy-section-tree.ts](../src/lib/site-admin/builder-node/legacy-section-tree.ts), builder-node | **High** | Honest UI; builds on **7A** primitives | Manual |
| P7B-2 | Inspector: Hero layout/slot controls vs props-only | [inspector-dock](../src/components/edit-chrome/inspector-dock.tsx), builders | **High** | Matches **§7** honesty table | Manual |

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
- **7A demo gate:** Before claiming “element library shipped,” the **First 7A demo target** (Strategic framing above) passes end-to-end.

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
- **7A + 7B:** Element Library MVP (7A) complete and Hero pilot (7B) on **honest** governed composition — not props-only “layers.”
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

## Implementation status (rolled summary)

| Phase | Status | Notes |
|-------|--------|--------|
| **0** | Partial | P0-2 CMS draft canvas landed; **automation** (`test:e2e:registered-host`, curl to https://tulala.digital) proves `agency_domains` path. **Human matrix** (390 / ~820 / 1440, insert, publish, console) still required per [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md). **Local human QA** ([builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md)): first pass failed internal/pilot/premium gates; Pass 1–2 retests improved insert→canvas, mobile frame, page-scoped heading probe; **clean baseline page**, reliable local load (**BUG-001**), and trustworthy publish loop (**BUG-005**) still open. |
| **1** | Partial | Legacy redirects + `?panel=` (incl. library); converge orphan admin links incrementally. |
| **2** | Partial | Publish drawer + save pill (**Draft up to date** / unsaved / saving tooltips) + tenant-branded top bar (**Tulala Builder** + site name); Publish / **More** menus (`role="menu"` + trigger ids); inspector tab hints; drawers + modals; navigator empty states. |
| **3** | Partial | `moveSectionTo` shared with canvas + navigator; scroll-into-view after drop; navigator rail `aria-labelledby`; drop polish ongoing. |
| **4–5** | Partial / open | Library: empty-search recovery + “no section types” banner when kits/starters still match; category UX + advanced copy ([composition-library.tsx](../src/components/edit-chrome/composition-library.tsx)); inline WYSIWYG: floating toolbar, canvas overlay, link popover. |
| **6** | Partial | Header/footer sections + shell republish on publish; **`storefront` cache bust** with shell ([composition-actions.ts](../src/lib/site-admin/edit-mode/composition-actions.ts)); full parity per [phase-b-site-shell.md](./phase-b-site-shell.md). |
| **7** | Partial | **Code:** allow-list kinds, draft/publish tree paths, nested insert governance, Free draft save + publish preflight, Card / CTA group kinds ([§7A MVP](#7a-mvp-element-allow-list)). **Product:** **7A not claimed shipped** until **7A Reality Test** + demo evidence on a registered host. **P7B** Hero remains **after** 7A acceptance. |
| **8** | Partial | Viewport switcher `title` clarifies layout simulation vs per-section responsive fields; device preview + mobile chrome hint; per-breakpoint authoring ongoing. |
| **9** | Partial | Coalesced `router.refresh` via `queueRouterRefresh` ([edit-context.tsx](../src/components/edit-chrome/edit-context.tsx)); labelled drawers/overlays + assertive errors on key flows; `Drawer` focus restore + hidden closed state (`aria-hidden`, no pointer hit-target) per [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md). |

---

## 8. First PR recommendation (prioritized)

**Product direction:** **Advanced Mode is 7A-first.** Primary engineering track is **Element Library MVP** (P7A-*), not Hero-only composition. Hero belongs to **P7B** and assumes **7A primitives are real.**

**Status:** **P0-2** CMS insert → canvas and **Phase 2** publish-trust copy are **landed**. **P7A-0** persistence contract doc + server paths and **P7A-1** element library (registry, inserts, picker, shipped catalog, Free vs Advanced gates, draft save guard, publish preflight) are **in codebase**. Remaining Phase 2 risk: publish blocking when canvas and persisted state disagree — track with [BUG-005](./builder-human-qa-run-2026-05-09.md).

**Next priorities:**

1. **Human QA (blocking “7A shipped”):** Stabilize **Impronta** baseline (prefer **draft-only** reset). Run **add → edit → reorder → publish → hard refresh → reopen** on a **registered host** and capture **7A Demo Evidence** (screens or recording — see §7A guardrails).

2. **P7A-2 / P7A-3 / P7A-4 acceptance:** Validate **honest selection** (inspector ↔ persisted tree), **navigator/canvas reorder** for library-backed nodes, and **full round-trip** per **7A Reality Test** — fix gaps QA finds (insert/canvas iframe issues: [BUG-002 / BUG-003](./builder-human-qa-run-2026-05-09.md)).

3. **P7B** governed Hero — **only after** 7A is accepted with evidence, not as a substitute for element primitives.

**Parallel (non-code):** Phase **0** registered-host viewport matrix ([phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md)) remains **required** before declaring pilot-ready.

### Continue-mode execution queue (Cursor + doc alignment)

Use this subsection for **session-to-session** sequencing. Canonical definitions stay in the PR tables above and in [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) (do not treat this list as a second backlog file — update statuses in **one** place per workflow: either Cursor todos **or** the plan YAML when you are explicitly syncing the mirror).

**Three task shapes (do not conflate them):**

| Shape | Meaning | “Done” |
|-------|---------|--------|
| **`verify-p*-*`** | Doc/code reconciliation | Closed when the implementation table + changelog row match reality |
| **`pr-p*-*`** | Product acceptance (often **manual** or VoiceOver) | Closed when humans sign off on the acceptance column, even if code already exists |
| **`exec-*` / `p7a-*` / gates / `acc-*` / `7c-*` / `pv1-*`** | Execution, QA evidence, or future verticals | Per-item exit criteria in the plan row |

**Human-only (cannot mark `pr-*` done from CI alone):** `pr-p0-1`, `exec-p0-registered-host`, `exec-p0-edit-loop` (evidence on registered host), `gate-*`, `acc-ph*`, `qa-bug-*`, most **`pr-p2-*`…`pr-p9-*`** until spot-checks recorded.

**Code-first queue (next engineering slices — work top to bottom; adjust after QA):**

| Seq | ID | Focus | Exit (implementation) | After that |
|----:|----|--------|-------------------------|------------|
| 1 | **`pr-p2-1`** | Publish blocker vs advisory | Landed in [`publish-drawer.tsx`](../src/components/edit-chrome/publish-drawer.tsx) / [`PublishPreflight.tsx`](../src/components/edit-chrome/PublishPreflight.tsx); close **`pr-p2-1`** when manual read of copy + one publish-blocked path looks right | VoiceOver spot optional |
| 2 | **`pr-p2-2`** | Draft vs published clarity | [`topbar.tsx`](../src/components/edit-chrome/topbar.tsx) **`LiveSitePublishedChip`** (live `published_at` next to `SaveStatus`) + composition `liveSitePublishedAt`; close **`pr-p2-2`** after manual glance on homepage + one inner page | Re-open only if product wants richer diff copy |
| 3 | **`pr-p2-3`** | Publish failure SR | Assertive publish errors + global mutation toast (`aria-atomic`); preflight + precondition banners + in-flight announcer in drawer / [`PublishPreflight.tsx`](../src/components/edit-chrome/PublishPreflight.tsx) — close **`pr-p2-3`** after VoiceOver on fail path + blocked publish | VoiceOver |
| 4 | **`p7a-1-empty-states`** | Library load failure UX | [`composition-library.tsx`](../src/components/edit-chrome/composition-library.tsx) surfaces `compositionError` / `compositionLoading` + **Try again**; [`element-library-insert-picker.tsx`](../src/components/edit-chrome/element-library-insert-picker.tsx) empty / no-match `aria-atomic` — close after manual fail + retry on registered host | Manual |
| 5 | **`exec-p7a-2-selection` / `p7a-2-multi-select`** | Honest selection | Stale id rejection in [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx); **inspector** skips one-frame ghost `selectedBuilderNodeId` vs [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx) `builderTree` (`selectionTreeMismatch` → skeleton) | Registered-host QA |
| 6 | **`exec-p7a-3-reorder` / `p7a-3-undo`** | Reorder parity + undo | Lib tests shipped; remaining = product sign-off + undo coherence if product requires | QA |
| 7 | **`exec-p7a-4-roundtrip` / `p7a-4-cache`** | Publish + reopen truth | Automated slices in `p7a-reorder-publish-parity.test.ts`; human **7A Reality Test** still authoritative | Evidence doc |
| 8 | **`pr-p9-1`** | `router.refresh` audit | **Edit-chrome slice:** [`theme-drawer.tsx`](../src/components/edit-chrome/theme-drawer.tsx), [`starter-template-gallery-overlay.tsx`](../src/components/edit-chrome/starter-template-gallery-overlay.tsx), [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx), [`SiteHeaderInspector.tsx`](../src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx), [`empty-canvas-starter.tsx`](../src/components/edit-chrome/empty-canvas-starter.tsx) use **`queueRouterRefresh`** from context (`empty-canvas` falls back to raw refresh when `useMaybeEditContext()` is null). **`edit-pill.tsx`** unchanged (mounts before provider). **`pr-p9-1`** still tracks profile + any non-edit-chrome callers. | Profile / CI |
| 9 | **`pr-p3-2`** | Drop polish | **Code:** [`selection-layer.tsx`](../src/components/edit-chrome/selection-layer.tsx) — richer section drop line (inset highlight, caps for allowed + blocked), `prefers-reduced-motion` for rail/drop/chip transitions + drag-ghost tilt, `grabbing` cursor while dragging, nested **Canvas blocks** insert line aligned to same blue language; **drop-cap pulse** (1.4 s scale + opacity breathe on valid end-cap dots, motion-gated) + **drag-ghost spawn fade-in** via single injected `<style>` keyframe block. **`pr-p3-2`** still = manual “premium feel” sign-off on a registered host. | Manual |
| 10 | **`pr-p6-2`** | `tagFor` / revalidate audit | Cross-check all shell + section publish paths vs [phase-b-site-shell.md](./phase-b-site-shell.md) | Smoke + tenant isolation when touched |

**Park until 7A accepted:** `pr-p7b-*`, `p7b-var-*`, all **`7c-*`**, all **`pv1-*`**, `shell-no-fake-model`, `strat-*` (unless copy is blocking a ship).

**Continue ritual:** pick the **lowest Seq** with an open Cursor todo → set **`in_progress`** → ship or document waiver → **`completed`** → add a **one-line changelog** row when behavior or acceptance meaning changed.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-12 | **P3-2 (canvas drop polish — code slice):** [`selection-layer.tsx`](../src/components/edit-chrome/selection-layer.tsx) — section reorder **drop line** (4px, softer multi-stop gradient, inset highlight, end caps for **allowed and blocked** targets); **drag ghost** deeper shadow + `translateZ(0)`; **`prefers-reduced-motion`** gates position transitions on hover ring / rail / drop line and removes ghost tilt; **`document.body` cursor `grabbing`** during active drag; **Nested blocks** panel insert gap uses the same gradient language. **`pr-p3-2`** remains for human polish sign-off. |
| 2026-05-12 | **P9-1 (edit-chrome `queueRouterRefresh` audit):** [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx) exposes **`queueRouterRefresh`** on context; [`theme-drawer.tsx`](../src/components/edit-chrome/theme-drawer.tsx), [`starter-template-gallery-overlay.tsx`](../src/components/edit-chrome/starter-template-gallery-overlay.tsx), [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx) (autosave success), [`SiteHeaderInspector.tsx`](../src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx), and [`empty-canvas-starter.tsx`](../src/components/edit-chrome/empty-canvas-starter.tsx) (`useMaybeEditContext` + raw refresh only when absent) call it instead of ad-hoc **`router.refresh()`**. [`edit-pill.tsx`](../src/components/edit-chrome/edit-pill.tsx) still refreshes directly (pre-provider). **`pr-p9-1`** remains for profiling / remaining surfaces. |
| 2026-05-12 | **P7A-2 (inspector honesty):** [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx) — when `selectedBuilderNodeId` is set but the id is **missing from `builderTree`** (race before [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx) clears the override), render **`InspectorSkeleton`** instead of **`ContentTab`**; load-error strip gains **`aria-atomic`**. |
| 2026-05-12 | **P7A-1 empty / load states:** [`composition-library.tsx`](../src/components/edit-chrome/composition-library.tsx) — `compositionError` assertive banner + **Try again** (`refreshComposition`), loading line while `compositionLoading`, search disabled + `aria-describedby` when catalog failed; empty-body + insert-error `aria-atomic`; kits-only search banner `aria-live="polite"`. [`element-library-insert-picker.tsx`](../src/components/edit-chrome/element-library-insert-picker.tsx) — `aria-atomic` on empty catalog + no search hits. |
| 2026-05-12 | **P2-3 publish SR polish:** [`publish-drawer.tsx`](../src/components/edit-chrome/publish-drawer.tsx) — polite `role="status"` regions for missing-slot / unsaved banners, `aria-atomic` on assertive publish errors + publish-blocked list, screen-reader line when publish is in flight, `aria-busy` + contextual `aria-label` on **Publish now**. [`PublishPreflight.tsx`](../src/components/edit-chrome/PublishPreflight.tsx) — live regions for loading / fetch failure / clean + `sr-only` preflight result summary. [`edit-shell.tsx`](../src/components/edit-chrome/edit-shell.tsx) — `aria-atomic` on global mutation toast. |
| 2026-05-12 | **P2-2 live publish hint:** Builder top bar shows **`Live · …`** next to draft save status — [`composition-actions.ts`](../src/lib/site-admin/edit-mode/composition-actions.ts) threads `cms_pages.published_at` as `liveSitePublishedAt`; [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx) / [`edit-shell.tsx`](../src/components/edit-chrome/edit-shell.tsx) / [`topbar.tsx`](../src/components/edit-chrome/topbar.tsx) surface it with tooltips + `aria-label`. Refreshes after `refreshComposition` (including post-publish). |
| 2026-05-14 | **Continue-mode queue:** Added **§8 Continue-mode execution queue** — clarifies `verify-*` vs `pr-*` vs execution ids, lists the next **code-first** slices (P2 polish → 7A honesty → P9-1 audit → P3-2 / P6-2), and parks 7B / 7C / post-v1 until 7A acceptance. |
| 2026-05-09 | **Orphan `critiquePage`:** Removed unused **`critiquePage`** (+ `CritiqueFinding` / `CritiqueResult` / prompt) from [`ai-generate-action.ts`](../src/lib/site-admin/edit-mode/ai-generate-action.ts); dropped `listSectionsForStaff` import (only used by that action). Post-v1 unified AI panel may reinstate a critique flow with a real UI. |
| 2026-05-09 | **P1-3 PR template:** [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — conditional **Edit chrome — drawer / overlay mutex** checklist links [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md) so PRs touching `web/src/components/edit-chrome/` repeat the same gates as the doc’s PR checklist. [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`pr-p1-3` → completed**. |
| 2026-05-09 | **P1-2 orphan actions:** Removed unused **`suggestLayoutImprovement`** (+ types) from [`ai-generate-action.ts`](../src/lib/site-admin/edit-mode/ai-generate-action.ts); deleted [`ai-usage-summary-action.ts`](../src/lib/site-admin/edit-mode/ai-usage-summary-action.ts) (`loadAiUsageSummary` had no importers). [`publish-preflight-action.ts`](../src/lib/site-admin/edit-mode/publish-preflight-action.ts) header comment updated. [builder-convergence-plan.md](./builder-convergence-plan.md) §1 REMOVE + Phase 0 task + post-v1 bullets updated. [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`pr-p1-2` → completed**. |
| 2026-05-09 | **Cursor plan sync (verify-p0-1):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p0-1` → completed** as honest reconciliation: **P0-1** is defined only as the human [registered-host viewport matrix](./phase-0-qa-registered-host.md) (390 / ~820 / 1440); matrix cells were **still empty** at reconciliation; automation substitutes + last-run log live in that same doc. **`pr-p0-1` stays pending** until Pass/Fail are recorded on a production-like registered host (or an explicit waiver + approver is recorded here per Phase 0 doc). [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) adds a short **Roadmap reconciliation** note under the matrix. |
| 2026-05-09 | **Cursor plan sync (verify-p8-1…p9-2):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p8-1` → completed:** **P8-1** section breakpoint visibility — `presentation.visibility` (`always` / `desktop-only` / `mobile-only` / `hidden`) in [`presentation.ts`](../src/lib/site-admin/sections/shared/presentation.ts), navigator + [`setSectionVisibilityAction`](../src/lib/site-admin/edit-mode/section-actions.ts); builder-node per-viewport presentation in [`style-panel.tsx`](../src/components/edit-chrome/inspectors/style-panel.tsx). **`verify-p8-2` → completed:** **P8-2** mobile canvas width **390** (tablet **834**) in [`edit-shell.tsx`](../src/components/edit-chrome/edit-shell.tsx) `DEVICE_WIDTHS` + iframe host notes; topbar preview width control. **`verify-p9-1` → completed:** **P9-1** [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx) **`queueRouterRefresh`** (P9-1 comment) RAF-coalesces composition-path bursts; other modules still call `router.refresh()` directly (inspector, theme drawer, overlays) — **`pr-p9-1`** remains cross-surface audit. **`verify-p9-2` → completed:** **P9-2** [`kit/drawer.tsx`](../src/components/edit-chrome/kit/drawer.tsx) implements **`restoreFocusOnClose`** and documents **no in-drawer focus trap** (see [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md)); modals use `aria-modal`. **`pr-p8-*` / `pr-p9-*`** stay for manual / keyboard acceptance. |
| 2026-05-09 | **Cursor plan sync (verify-p6-1 / verify-p6-2):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p6-1` → completed:** **P6-1** header uses synthetic [`SITE_HEADER_SELECTION_ID`](../src/lib/site-admin/site-header/selection-id.ts) + [`public-header.tsx`](../src/components/public-header.tsx) `data-cms-section` wrapper in edit mode; [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx) routes to [`SiteHeaderInspector`](../src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx). Footer is the real **`site_footer`** composition row (registry editor + `ShellLockedState` when `canEditSiteShell` is false, same as header). **`verify-p6-2` → completed:** **P6-2** cache busts — theme publish via [`saveDesignDraft` / `publishDesign`](../src/lib/site-admin/server/design.ts) (`updateTag(tagFor(…, "branding"))`, `storefront`); nav publish [`publishNavigationMenu`](../src/lib/site-admin/server/navigation.ts) (`updateTag(tagFor(…, "navigation"))`); persisted section rows [`upsertSection`](../src/lib/site-admin/server/sections.ts) (`sections` + `sections-all`). [`site-header/actions.ts`](../src/lib/site-admin/site-header/actions.ts) documents hybrid preview (`router.refresh` for renderer-driven header changes). **`pr-p6-1` / `pr-p6-2`** stay for manual smoke, tenant tests, and full **`tagFor` surface audit** per roadmap. |
| 2026-05-09 | **Cursor plan sync (verify-p4-1…p5-2):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p4-1` → completed:** **P4-1** canvas inline text uses [`CanvasEditOverlay`](../src/components/edit-chrome/rich-editor/CanvasEditOverlay.tsx) + Lexical [`RichEditor`](../src/components/edit-chrome/rich-editor/RichEditor.tsx) (see [`inline-editor.tsx`](../src/components/edit-chrome/inline-editor.tsx) file header); markers round-trip via transformers with [`transformers.test.ts`](../src/components/edit-chrome/rich-editor/transformers/transformers.test.ts). **`verify-p4-2` → completed:** **P4-2** link editing reuses [`LinkPicker`](../src/lib/site-admin/sections/shared/LinkPicker.tsx) (structured kinds + [`validateLinkUrl`](../src/lib/site-admin/edit-mode/link-validate-action.ts)) from [`LinkPickerPopover`](../src/components/edit-chrome/rich-editor/plugins/LinkPickerPopover.tsx). **`verify-p5-1` → completed:** **P5-1** Advanced gating + recovery copy in [`composition-library.tsx`](../src/components/edit-chrome/composition-library.tsx) (`showAdvanced`, category tabs, “Show advanced sections”). **`verify-p5-2` → completed:** **P5-2** starter defaults are governed by [`section-template-starters`](../src/lib/site-admin/sections/shared/section-template-starters.ts) + [`section-template-starters.test.ts`](../src/lib/site-admin/sections/shared/section-template-starters.test.ts) (registered types + schema parse); **editorial / top-starter polish** stays on **`pr-p5-2`**. Roadmap **manual** acceptance remains on **`pr-p4-1`…`pr-p5-2`**. |
| 2026-05-14 | **Cursor plan sync (verify-p3-1 / verify-p3-2):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p3-1` → completed:** **P3-1** canvas section drag and navigator section DnD both call shared [`moveSectionTo`](../src/components/edit-chrome/edit-context.tsx) (canvas [`selection-layer.tsx`](../src/components/edit-chrome/selection-layer.tsx) `computeDrop` + `moveSectionTo`; navigator [`navigator-panel.tsx`](../src/components/edit-chrome/navigator-panel.tsx) `resolveSectionDropTarget` + `commitSectionMoveTo`). Same-slot no-op rules align with `moveSectionTo`’s pre-removal index math. **`verify-p3-2` → completed:** **P3-2** baseline drop indicator / drag affordances exist on canvas (`indicatorY` / slot gating in `selection-layer`); “premium feel” polish remains on **`pr-p3-2`** (manual). |
| 2026-05-12 | **Cursor plan sync (verify-p2-1…p2-3):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p2-1` → completed:** **P2-1** blocking vs advisory publish copy + preflight gating lives in [`publish-drawer.tsx`](../src/components/edit-chrome/publish-drawer.tsx) / [`PublishPreflight.tsx`](../src/components/edit-chrome/PublishPreflight.tsx) (`preflightBlockingErrors`, disabled publish, “Publish blocked”). **`verify-p2-2` → completed:** **P2-2** draft vs published trust copy + `aria-live` on save states in [`topbar.tsx`](../src/components/edit-chrome/topbar.tsx) (`SaveStatus`, **Draft up to date**). **`verify-p2-3` → completed:** **P2-3** SR surfaces — publish drawer `role="alert"` / `aria-live="assertive"` on hard errors + `role="status"` / polite on blockers ([`publish-drawer.tsx`](../src/components/edit-chrome/publish-drawer.tsx)); global mutation failures [`edit-shell.tsx`](../src/components/edit-chrome/edit-shell.tsx) (`mutation-toast`, assertive). Roadmap **manual / VoiceOver** acceptance stays on **`pr-p2-1`…`pr-p2-3`**. |
| 2026-05-12 | **Cursor plan sync (verify-p0-2 / verify-p1-3):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — **`verify-p0-2` → completed:** **P0-2** insert→canvas path has strong **automation** (`test:e2e:impronta-*` insert/starter/DSH/phase0-edit-loop, `selection-layer` + `pageVersion` mitigations per changelog); **registered-host matrix + human regressions** stay under **P0-1** / `pr-p0-2`. **`verify-p1-3` → completed:** [DRAWER-MUTEX.md](../src/components/edit-chrome/DRAWER-MUTEX.md) reconciliation section documents mutex ownership in [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx); **`pr-p1-3` stays pending** as ongoing PR checklist for new drawers. |
| 2026-05-12 | **Convergence doc sync (P1-2 audit):** [builder-convergence-plan.md](./builder-convergence-plan.md) §1 — `aria-landmark` **wired** into publish preflight; legacy `/admin/site-settings/{structure,sections,pages}` **thin redirects** + EditShell **`?panel=`** behavior documented; **`suggestLayoutImprovement` / `loadAiUsageSummary`** remain explicitly deferred (post-v1). [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — `verify-p1-2` → **completed** (`pr-p1-2` stays **pending** until those two are wired or removed). |
| 2026-05-12 | **Cursor plan sync (verify-p0-3):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — `verify-p0-3` → **completed** (`pr-p0-3` already **completed**; [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) §Deferred bugs table matches roadmap **P0-3**). |
| 2026-05-12 | **Cursor plan sync (P1-1):** [`.cursor/plans/builder-phase-truth-roadmap.plan.md`](../../.cursor/plans/builder-phase-truth-roadmap.plan.md) — `pr-p1-1` + `verify-p1-1` → **completed** after audit of [`legacy-site-settings-redirect.ts`](../src/lib/site-admin/legacy-site-settings-redirect.ts) + `admin/site-settings/**/page.tsx` redirect stubs (workspace Website / Settings / storefront `?edit=1` targets). |
| 2026-05-14 | **`qa:impronta-navigator-sanity`:** [`package.json`](../package.json) bundles **child reorder** + **layers collapse/search** e2e + `test:builder-node-bindings`; linked from [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) + [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) bash block. |
| 2026-05-12 | **QA continuity:** [builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md) **Pass 6** records green `npm run test:e2e:impronta-directory-search-hero` (local `:3000` + dev sign-in). [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) automation table updated. Roadmap `.cursor/plans/builder-phase-truth-roadmap.plan.md` — `exec-bugs-canvas-iframe` → **completed** (mitigated by e2e + prior render fixes; **registered-host matrix + 7A Reality Test** still human-required). [`scripts/dev.sh`](../../scripts/dev.sh) reminds devs that `/impronta` path-tenant needs **`localhost` Host**, not `app.local:3102`. |
| 2026-05-12 | **P0-3 + e2e navigator:** [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) **Deferred bugs** table lists BUG-001…008 with links. [`smoke.spec.ts`](../e2e/smoke.spec.ts) adds `expandNavigatorSectionChildList(page,…)` (no-op when already expanded; **Expand all** fallback). **Phase 0 publish** is **opt-in** (`PLAYWRIGHT_IMPRONTA_PHASE0_PUBLISH=1` / `qa:impronta-phase0-edit-loop:full`); `awaitPublishDrawerReadyToPublish` surfaces **Publish blocked** text on failure. Roadmap `pr-p0-3` → **completed**. |
| 2026-05-13 | **Navigator e2e hygiene:** [`smoke.spec.ts`](../e2e/smoke.spec.ts) — **layers collapse + search** drops brittle per-row DOM count after collapse when selection keeps layers open; **child reorder** renamed to action-button-only path (move down + targeted move up; no synthetic drag). Added [`test:e2e:impronta-navigator-child-reorder`](../package.json) + canonical [`test:e2e:impronta-navigator-layers-collapse-search`](../package.json) (`test:e2e:impronta-navigator-layer-filtering` aliases it for `qa:impronta-builder-wave2` / older docs). |
| 2026-05-12 | **Phase 0 e2e publish leg:** Default `test:e2e:impronta-phase0-edit-loop` asserts **reorder + reload** only; **publish/reopen** runs when `PLAYWRIGHT_IMPRONTA_PHASE0_PUBLISH=1` (`npm run test:e2e:impronta-phase0-edit-loop:full` in [`package.json`](../package.json)). Preflight blockers on QA-heavy drafts are **data**, not navigator regressions. |
| 2026-05-12 | **`qa:impronta-phase0-edit-loop:full`:** Chains `reset:impronta-homepage:draft -- --apply` + full Phase 0 Playwright + `test:builder-node-bindings`; documented in [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md). |
| 2026-05-13 | **BUG-003 / BUG-004 / BUG-005 (slices):** Playwright [`smoke.spec.ts`](../e2e/smoke.spec.ts) asserts Directory Search Hero on desktop and in **`iframe[title="mobile preview"]`**. [`reset-impronta-homepage.ts`](../scripts/reset-impronta-homepage.ts) adds **`--help`** (see [`impronta-local-qa-homepage-baseline.md`](./impronta-local-qa-homepage-baseline.md)). Save/preview honesty: [`DraftSavedToast`](../src/components/edit-chrome/edit-shell.tsx) + [`SaveStatus`](../src/components/edit-chrome/topbar.tsx) tooltips; **Draft saved** on [`SaveChip`](../src/components/edit-chrome/kit/savechip.tsx), [`PanelSaveChip`](../src/components/edit-chrome/inspectors/kit/panel-save-chip.tsx), [`SiteHeaderInspector`](../src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx). **`npm run ci`** passes at this commit. |
| 2026-05-12 | **BUG-002 (persisted tree):** [`resolveSnapshotBuilderTree`](../src/lib/site-admin/builder-node/snapshot-tree.ts) reconciles against authoritative [`LegacySnapshotSlot`](../src/lib/site-admin/builder-node/legacy-section-tree.ts) rows when any slot address is missing from the validated client `builderTree` (e.g. `createAndInsertSectionAction` saves new `slots` with a stale tree). [`HomepageCmsSections`](../src/components/home/homepage-cms-sections.tsx) then resolves bindings for every row after draft save / `router.refresh`. Tests in [`builder-node.test.ts`](../src/lib/site-admin/builder-node/builder-node.test.ts). **Human:** re-run Directory Search Hero insert on a registered host to confirm canvas matches inspector (mitigations for scroll/iframe remain separate). |
| 2026-05-11 | **P7A-4 (automated slice):** [`p7a-reorder-publish-parity.test.ts`](../src/lib/site-admin/builder-node/p7a-reorder-publish-parity.test.ts) adds **`blank_section`** path — composition-owned row starts empty, insert heading + paragraph, gap reorder, [`resolveSnapshotBuilderTreeForPublish`](../src/lib/site-admin/builder-node/snapshot-tree.ts) stays **ok** (aligns with **First 7A proof** doc; still not a substitute for DB + browser reopen). |
| 2026-05-10 | **P7A-3 (automated + UI):** [`siblingDropGapToMoveIndex`](../src/lib/site-admin/builder-node/sibling-drop-gap.ts) lives in **lib** (single source of truth); navigator, canvas nested-blocks panel, and inspector import it. **CI:** [`sibling-drop-gap.test.ts`](../src/lib/site-admin/builder-node/sibling-drop-gap.test.ts) exhaustively matches **every same-parent gap** (3 siblings) + one cross-parent case against [`moveBuilderNode`](../src/lib/site-admin/builder-node/operations.ts). Remaining **P7A-3 product sign-off:** optional registered-host spot-check (iframe/mobile) per Phase 0 matrix — not a code gap. |
| 2026-05-10 | **P7A-4 (automated slice):** [`p7a-reorder-publish-parity.test.ts`](../src/lib/site-admin/builder-node/p7a-reorder-publish-parity.test.ts) — insert three paragraphs under a legacy hero section row, reorder with gap semantics, assert [`resolveSnapshotBuilderTreeForPublish`](../src/lib/site-admin/builder-node/snapshot-tree.ts) still **ok**. Does **not** replace end-to-end DB draft revision + `publishHomepage` + browser reopen (still **human** for final 7A Reality Test). |
| 2026-05-10 | **blank_section registry hygiene:** `blank_section` added to role-binding [`CASES`](../src/lib/site-admin/builder-node/builder-node-role-bindings.test.ts), [`style-panel.tsx`](../src/components/edit-chrome/inspectors/style-panel.tsx) role map, and explicit branch in [`deriveLegacySectionChildNodes`](../src/lib/site-admin/builder-node/legacy-section-tree.ts) so `npm run test:builder-node-bindings` tracks the new section type. |
| 2026-05-10 | **P7A-2 (partial, code):** `selectBuilderNode` + selection-sync effect reject **stale ids** not present in the reconciled `builderTree` (`treeContainsBuilderNodeId` in [`builder-node-content-utils.ts`](../src/components/edit-chrome/inspectors/builder-node-content-utils.ts)). **Full P7A-2 acceptance** still requires manual **inspector ↔ tree** QA on a registered host (roadmap table). |
| 2026-05-10 | **CI sanity:** `npm run test:builder-capabilities` → **68/68 pass** on repo HEAD. This validates helpers/policies only — **Phase 0 registered-host matrix**, **exec-p0-edit-loop** evidence, and **P7A-2…4** acceptance remain **human / integration** work per §Current execution priority. The Cursor YAML plan (`.cursor/plans/builder-phase-truth-roadmap.plan.md`) lists **~100 `pending`** todos — execute in roadmap order; statuses live in that file + Cursor UI (batch completion is **multi-session**). |
| 2026-05-09 | **Changelog hygiene:** Tag **(Historical)** rows that described **Gate 0 → P7A-1** sequencing so they are not read as current policy. |
| 2026-05-09 | **Gate 0 + planning freeze + §7A task table:** Gate 0 reframed as **post-ship regression checklist**; planning freeze / **Current execution priority** / **P7A-1** row aligned with **P7A-0+P7A-1 in code** and **next = QA + P7A-2…4 acceptance**. |
| 2026-05-09 | **§8 + Phase 7 implementation row:** Reflect **P7A-0 / P7A-1 landed in code**; next = human QA + **P7A-2…4** acceptance vs **7A Reality Test** (not Gate 0 blocking P7A-1). |
| 2026-05-09 | **Tests:** [`builder-node.test.ts`](../src/lib/site-admin/builder-node/builder-node.test.ts) asserts registry allow-lists + validation rejects container-under-card and heading-under-cta_group. |
| 2026-05-09 | **Child governance (Card / CTA group):** registry aligned with § parent/child table — [`CARD_CHILD_KINDS`](../src/lib/site-admin/builder-node/registry.ts) (heading, paragraph, button, image); [`CTA_GROUP_CHILD_KINDS`](../src/lib/site-admin/builder-node/registry.ts) (button only). |
| 2026-05-09 | **7A kinds — Card + CTA group:** [`card` / `cta_group`](../src/lib/site-admin/builder-node/types.ts) registered in [`registry.ts`](../src/lib/site-admin/builder-node/registry.ts), [`createBuilderNode`](../src/lib/site-admin/builder-node/create.ts) defaults, [`render.tsx`](../src/lib/site-admin/builder-node/render.tsx), Layout tab ([`layout-panel.tsx`](../src/components/edit-chrome/inspectors/layout-panel.tsx)), MVP catalog ([`mvp-allow-list.ts`](../src/lib/site-admin/builder-node/mvp-allow-list.ts)). |
| 2026-05-09 | **Element library search aliases:** [`elementLibrarySearchExtraTerms`](../src/lib/site-admin/builder-node/mvp-allow-list.ts) (card/cta/columns/…) wired into [`ElementLibraryInsertPicker`](../src/components/edit-chrome/element-library-insert-picker.tsx) haystack — roadmap labels without new node kinds. |
| 2026-05-09 | **Publish preflight (Free):** [`runPublishPreflight`](../src/lib/site-admin/edit-mode/publish-preflight-action.ts) compares draft nested builder-node ids vs last published composition **`published_homepage_snapshot` / `published_page_snapshot`** **per CMS section id** via [`collectFreePlanPublishNestedViolations`](../src/lib/site-admin/builder-node/free-plan-builder-tree-guard.ts). Homepage: locale only; **inner pages:** [`PublishPreflight`](../src/components/edit-chrome/PublishPreflight.tsx) passes `pageId`. Skips when that page was never published. |
| 2026-05-09 | **Defense in depth (Free vs Advanced):** [`enforceFreePlanNestedBuilderDraftGuard`](../src/lib/site-admin/server/free-plan-draft-save-guard.ts) rejects draft saves that introduce **new nested builder-node ids** vs the prior draft revision (mirrors client insert/paste/duplicate); uses [`loadResolvedDraftBuilderTreeForPageVersion`](../src/lib/site-admin/server/draft-revision-builder-tree.ts) + [`assertFreePlanAllowsNestedBuilderMutation`](../src/lib/site-admin/builder-node/free-plan-builder-tree-guard.ts). Wired into [`saveHomepageDraftComposition`](../src/lib/site-admin/server/homepage.ts) + non-homepage [`saveHomepageCompositionAction`](../src/lib/site-admin/edit-mode/composition-actions.ts) (`input.pageId`). |
| 2026-05-09 | **P7A-1:** **Shipped 7A insert catalog** — [`SHIPPED_ELEMENT_INSERT_KINDS`](../src/lib/site-admin/builder-node/mvp-allow-list.ts) + [`filterKindsForShippedElementCatalog`](../src/lib/site-admin/builder-node/mvp-allow-list.ts); [`gateNestedInsertKinds`](../src/lib/site-admin/builder-node/element-library-policy.ts) composes catalog ∩ **advanced** for nested inserts ([`navigator-panel.tsx`](../src/components/edit-chrome/navigator-panel.tsx), [`selection-layer.tsx`](../src/components/edit-chrome/selection-layer.tsx), [`builder-node-content.tsx`](../src/components/edit-chrome/inspectors/builder-node-content.tsx)). Structure **Insert block here** uses [`ElementLibraryInsertPicker`](../src/components/edit-chrome/element-library-insert-picker.tsx) **`inspector`** variant (search + categories; section packs unchanged). |
| 2026-05-09 | **P7A-1:** [`ElementLibraryInsertPicker`](../src/components/edit-chrome/element-library-insert-picker.tsx) (search + categories from [`mvp-allow-list.ts`](../src/lib/site-admin/builder-node/mvp-allow-list.ts)); [`assertAdvancedLibraryAllowsOperation`](../src/lib/site-admin/builder-node/element-library-policy.ts) enforces **insert/paste/duplicate** on paid plans inside [`guardBuilderNodeMutation`](../src/components/edit-chrome/edit-context.tsx). |
| 2026-05-09 | **P7A-1 partial:** [`filterKindsForAdvancedElementLibrary`](../src/lib/site-admin/builder-node/element-library-policy.ts) wires **free vs paid** on nested block inserts ([`navigator-panel.tsx`](../src/components/edit-chrome/navigator-panel.tsx), [`selection-layer.tsx`](../src/components/edit-chrome/selection-layer.tsx), [`builder-node-content.tsx`](../src/components/edit-chrome/inspectors/builder-node-content.tsx)). |
| 2026-05-09 | **P7A-0 technical deliverable:** [p7a-0-persistence-contract.md](./p7a-0-persistence-contract.md) — tables + paths; **`divider`** builder node + [`element-library-policy.ts`](../src/lib/site-admin/builder-node/element-library-policy.ts) / [`advancedElementLibraryEnabled`](../src/components/edit-chrome/edit-context.tsx) rollout gate. |
| 2026-05-09 | **(Historical)** **P7A-0 deliverable format:** concrete outputs (persistence, matrix, draft/publish/reopen/renderer/inspector/navigator, flag, tests) + acceptance bullets + **Proceed / Blocked** close-out before P7A-1 — *sequencing note from before library UI shipped; deliverable format still applies for reviews.* |
| 2026-05-09 | **(Historical)** **Planning freeze** + **7A Demo Evidence** + **7A Design Guardrails**; no broad planning until **P7A-0 + P7A-1** ship — *both tracks have since landed in code; current freeze targets **P7A-2…4 acceptance** — see **Planning freeze** above.* |
| 2026-05-09 | **(Historical)** **Phase 7A guardrails:** **7A Reality Test**; **Blank Section first proof**; **Gate 0 before P7A-1**; **Inspector MVP**; parent/child governance; no legacy migration in 7A; feature flag; **Simple Mode stays default**. Priority **P7A-0 then P7A-1** — *superseded by **§7A Gate 0**, **§Planning freeze**, and **§Current execution priority** after P7A-1 shipped.* |
| 2026-05-09 | **7A-first roadmap:** §3 Phase 7 rewritten (**Advanced Mode foundation**, **7A Element Library MVP before 7B Hero**); §4 **P7A-0…P7A-7** + **P7B-1/P7B-2**; §8 First PR → **P7A** track; added **allow-list**, **persistence truth**, **migration rule**, **Simple vs Advanced UX**, **no destructive QA reset**, **Current execution priority**; heart line (**Advanced Mode gated on 7A**); refs → **AGENTS.md** / **OPERATING.md** / Phase 0 QA docs (not CLAUDE-only). |
| 2026-05-09 | **Unified roadmap + Cursor Plans:** Strategic framing (7A–7D, P7A/P7B, guardrails) merged into this file; title updated. Full mirror for Cursor: [.cursor/plans/builder-phase-truth-roadmap.plan.md](../.cursor/plans/builder-phase-truth-roadmap.plan.md) (YAML frontmatter; links adjusted). **Edit roadmap content here**; refresh the `.plan.md` copy after substantive edits. |
| 2026-05-09 | Initial canonical roadmap; supersedes ad-hoc mixing of audit/backlog/phases for day-to-day execution. |
| 2026-05-09 | P0-2: CMS draft canvas — `loadPageForRender` + select inserted section + `await router.refresh()` ([page-reads](../src/lib/site-admin/server/page-reads.ts), [edit-context](../src/components/edit-chrome/edit-context.tsx)). |
| 2026-05-09 | P6-2 / P9-1: Shell publish revalidates `storefront`; edit context coalesces `router.refresh` (`queueRouterRefresh`). P8-2: narrow-screen builder hint. § Implementation status table added. |
| 2026-05-09 | P2/P5: Revisions drawer `aria-labelledby` + load error `aria-live`; composition library helper copy under search. `phase-b-site-shell.md` cache note updated. |
| 2026-05-09 | P2/P9 a11y: Page settings, Theme, Assets, Comments, Schedule drawers + section picker (`aria-labelledby` / `titleId`); error banners `aria-live`; mobile library sheet `role="dialog"`. |
| 2026-05-09 | P2/P9 a11y: Media picker modal (`aria-modal`, labelled heading, alert errors); inline section popover labelled title + insert errors `aria-live`. |
| 2026-05-09 | P2/P9 a11y: Starter template gallery + workspace template apply/archive dialogs use `aria-labelledby`; command palette uses sr-only title + `aria-labelledby`. |
| 2026-05-09 | P2/P9 / P4: Color picker dialog `aria-modal` + labelled title; eyedropper error `aria-live`; kit/starter review overlays as dialogs; rich-text link popover dialog labeling. |
| 2026-05-09 | P4: Rich-text floating toolbar `role="toolbar"` + `aria-label`; canvas inline-edit overlay `role="region"` + `aria-label`. |
| 2026-05-09 | P0: `test:e2e:registered-host` (default `tulala.digital`) + curl log in phase-0 doc. P5: library full-empty + partial-empty search copy. P8: viewport group `title` (preview vs responsive fields). |
| 2026-05-09 | P2: Publish drawer copy — autosave vs publish vs public; `role="status"` + `aria-live` on publish-blocked list. |
| 2026-05-09 | P2: Top bar `SaveStatus` — polite live region on save states; steady label **Draft up to date** + clearer tooltips (draft vs published). |
| 2026-05-09 | P2: Inspector tab hover hints (`DrawerTab` `title` prop + `INSPECTOR_TAB_HINT` map). |
| 2026-05-09 | P9-2: `Drawer` restores focus to pre-open `activeElement` on close (`restoreFocusOnClose`, optional opt-out). |
| 2026-05-09 | P9 / a11y: closed `Drawer` panels use `aria-hidden` + `pointer-events: none` while off-screen. |
| 2026-05-09 | P3/P9: Structure navigator `<aside>` named via `aria-labelledby` (`structure-navigator-label`). |
| 2026-05-09 | P2/P9: Publish split control `role="group"` `aria-label="Publish"`; primary Publish button `title` (preflight + go live). |
| 2026-05-09 | P2/P9: Publish chevron dropdown — `role="menu"`, `aria-expanded` / `aria-controls`, separator roles; menu item Space key fixed. |
| 2026-05-09 | P2/P9: More menu (`⋯`) — `TbIconBtn` optional menu attrs; `aria-labelledby` + separator on dropdown. |
| 2026-05-09 | P2: Publish + More top-bar menus — **Escape** closes menu (capture); More menu exits Share sub-step first. |
| 2026-05-09 | P2/P9: Page picker menu — `id` + `aria-labelledby` (trigger ↔ menu); Escape-to-close (already wired). Agent QA: typecheck + tenant + builder-capabilities + publish-preflight + Playwright smokes pass. |
| 2026-05-09 | Agent: full `npm run ci` **fails at repo-wide ESLint** (~759 findings — baseline debt across prototypes/admin/etc.). Same session: scoped `eslint topbar.tsx` + CI subsets **pass**. |
| 2026-05-09 | **Human QA (local `/impronta?edit=1`):** Full narrative + BUG-001–008 + Pass 1–2 retests in [builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md). Gates remain **fail** until clean Scenario 2 + publish/reopen on a reset baseline; Implementation status § Phase 0 updated. |
| 2026-05-09 | **Local QA baseline:** Runbook [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) — SQL inspect + discard homepage **draft** `cms_page_sections` so builder falls back to published composition. |
| 2026-05-09 | **P2 trust:** Edit topbar shows **Tulala Builder** + tenant public name (`agency_business_identity.public_name`) so product vs storefront context is obvious (human QA BUG-006). `OPERATING.md` § deploy ladder notes `NODE_OPTIONS` heap workaround for local Next OOM (BUG-001). |
| 2026-05-09 | **P5 starter review:** Human labels — **Editing approach** (+ plain-language blurb per `editModel`), **Section type** / **Content source**, **What you can change**, **Fine-tune in inspector**; capability badge **Data** → **Live data** ([composition-library.tsx](../src/components/edit-chrome/composition-library.tsx); human QA BUG-008). |
| 2026-05-09 | **P5 library density:** Kit/starter facet filters (Kind, Source, Plan…) **collapsed by default** behind **More filters for kits & starters**; badge shows active filter count when collapsed; opening library resets facets + disclosure (**BUG-007**). Fixed missing reset of **Control** (`starterCapabilityFilter`) when library reopens. |
| 2026-05-09 | **P2 publish trust (BUG-005):** Top bar steady save pill **All changes saved** → **Draft up to date** + clearer `title` / `aria-label`. Publish drawer “What publishing does” adds a line that **saving ≠ live**, suggests canvas scroll + Preview + preflight before publish ([topbar.tsx](../src/components/edit-chrome/topbar.tsx), [publish-drawer.tsx](../src/components/edit-chrome/publish-drawer.tsx)). |
| 2026-05-09 | **P8:** Viewport switcher group `title` — preview width is layout simulation; breakpoint editing stays in the inspector ([topbar.tsx](../src/components/edit-chrome/topbar.tsx)). First PR § updated — next focus insert/canvas + mobile iframe reliability vs duplicate publish-copy PR. |
| 2026-05-09 | **P3 / BUG-003:** Device preview `<iframe>` key now includes **`pageVersion`** so tablet/mobile preview remounts after draft mutations (`router.refresh()` does not refresh nested iframe documents). Wired from `EditShellInner` → `DeviceFrameSurface` ([edit-shell.tsx](../src/components/edit-chrome/edit-shell.tsx)). |
| 2026-05-09 | **P3 / BUG-002 (mitigation):** Selection-layer auto-scroll retries **`[data-cms-section]`** longer (30×100ms) and re-runs when **`pageVersion`** changes so post-insert scroll/selection rings catch slow RSC/streaming after `router.refresh()` ([selection-layer.tsx](../src/components/edit-chrome/selection-layer.tsx)). |
