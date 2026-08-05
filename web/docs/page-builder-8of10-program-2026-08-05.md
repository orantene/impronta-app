# Page Builder: 5/10 to 8-9/10 execution program

**Created** 2026-08-05 · **Baseline** `main` @ `237113b55` (after the 9-PR remediation wave)
**Status** DRAFT, NOT STARTED. Awaiting the owner's goals before any wave runs.
**Predecessors** [`page-builder-minimal-build-plan-2026-07-09.md`](./page-builder-minimal-build-plan-2026-07-09.md) (44 PRs, done) · re-audit report artifact `da953eef-deb2-415b-b6d3-a930131da026`

---

## 0. How to run this

This file is the single source of truth for the program. It is written to be executed
by an integrator (me) driving background agents, with enough detail that a fresh
session can pick it up cold.

**To start a wave**, the owner says one of:

- `run wave 1` (a single wave)
- `run the program` (all waves in order, integrator gates between each)
- `run wave 1 and 2 in parallel` (only pairs marked PARALLEL-SAFE below)

**Between waves the integrator must**: rebase onto latest `main`, run the wave's
Definition of Done, update the Ledger in section 7, and report honestly (including
anything that regressed or was deferred).

**Nothing in this file merges to `main` without the owner's word.** Branch pushes
and PRs are fine; merges are not, per the standing shipping rule.

---

## 1. Where the score actually is

Scores are per-dimension and evidence-backed. "Overall" is not an average: a builder
that can silently lose work is capped at 5 regardless of everything else.

| Dimension | Audit (08-04) | Now (post 9 PRs) | Target | What still holds it down |
|---|---|---|---|---|
| Draft integrity | 3.5 | 6.0 | **9.0** | Non-homepage pages have none of the 2026 incident fixes |
| Editor UX | 6.0 | 6.5 | **8.5** | Four interactions to type; overlay occlusion; stale labels |
| Authz + security | 5.5 | 7.5 | **9.0** | Logo upload raw-FormData + unsanitized SVG |
| Performance | 5.5 | 6.5 | **8.5** | Curated typing re-renders 72 consumers; eager 25k-line panels |
| Code health | 6.0 | 7.0 | **8.5** | e2e serially coupled; god files unratcheted |
| Copy + i18n | 4.0 | 5.5 | **8.5** | ~1,000 hardcoded EN on hot surfaces |
| **Overall** | **5.0** | **6.5** | **8.5** | |

**Honest scoring rule** (from `feedback_paper_vs_honest_scoring`): per-dimension gains
do not sum into the overall. Overall moves when the *worst* dimension moves and no
dimension regresses. Do not claim a number without the evidence column filled in.

---

## 2. Waves

Each wave is independently shippable and independently valuable. Order is by value,
not by convenience.

### WAVE 1 — Draft trust to 9.0

**Why first**: this is the same class of silent loss we proved users hit on the
homepage, still live on every other page. It is the only remaining item that can
destroy work.

| # | Item | Evidence it is still open |
|---|---|---|
| 1.1 | `restorePageRevision` restores page fields but never sections or the builder tree | `pages.ts` has 0 references to `builderTree` or `cms_page_sections` |
| 1.2 | Post-publish revision gap: version bumps, no revision written at it, editor canvas empties | `page-composer-action.ts:243` writes revisions on one path only |
| 1.3 | `recoverBuilderTreeIfEmpty` (#310 guard) is referenced only from homepage modules | grep-verified |
| 1.4 | Pure-freeform pages cannot publish at all | `page-composer-action.ts:184` hard-fails on zero slot rows |
| 1.5 | Save/publish/restore are 4-call REST sequences with version bump FIRST, not transactional | `homepage.ts:871+`; header comment claims otherwise and is false |
| 1.6 | Duplicated tab shares the sessionStorage edit-session token, so cross-tab conflicts adopt as same-session | `presence-provider.tsx:181` |
| 1.7 | Freeform homepage load prefers a raw revision tree over the recovered one for 1-node trees | `composition-actions.ts:683` vs `recover-builder-tree.ts:65` |
| 1.8 | Open question: do inline text commits push history? Audit said no; code says yes via CANVAS-7B | needs a live re-check, not a code read |

**Shape**: 1 agent for 1.1 to 1.4 (they are one refactor: unify the generic page lane
with the hardened homepage lane), 1 agent for 1.5 to 1.7, integrator does 1.8 live.

**Definition of Done**
- On a **non-homepage** cms page, live on the QA tenant: edit, save, reload, edits persist.
- Restore a revision on a cms page: content actually comes back, and survives reload.
- Publish a cms page, then reload the editor: canvas is NOT empty.
- Build a page from freeform blocks only: publish succeeds.
- A killed request mid-save never leaves a bumped version with no revision (test with an injected failure, not by hoping).
- 1.8 answered with a live repro, and stated plainly either way.

**Risk**: touches the save spine that #992 just fixed. Every change needs the #992
regression tests green plus a fresh live repro of the original silent-loss sequence.

---

### WAVE 2 — Editor UX to 8.5

**Why**: this is what the operator feels every single day, and it is the dimension a
new tenant judges in their first five minutes.

| # | Item | Detail |
|---|---|---|
| 2.1 | Text editing takes 4 interactions and eats early keystrokes | click, double-click (arms nothing), double-click (arms editor, no caret), click (caret lands). Everything typed before the caret is silently lost. Target: one double-click into a live caret. |
| 2.2 | Nested-blocks popover spawns partially behind the left dock | header and first row clipped |
| 2.3 | Block-list labels go stale after a text edit | panel still shows the old copy after commit |
| 2.4 | Toolbar Duplicate does not paint on canvas until reload | panel count updates, canvas does not |
| 2.5 | Shortcut sheet advertises a conflict it silently resolves | `kit/shortcuts.ts` lists Alt+arrows twice with different meanings |

**Definition of Done**
- Double-click any text block once, type immediately, every character lands. Verified live, in a browser, with a keystroke-level check.
- Open the nested-blocks panel at three different canvas positions: never occluded.
- Duplicate paints immediately.
- **A new e2e spec covering the floating-toolbar lane** (the lane that had zero coverage and hid the undo bug). This is a hard requirement of this wave, not a nice-to-have.

---

### WAVE 3 — Performance to 8.5

| # | Item | Measurable claim to close |
|---|---|---|
| 3.1 | Curated-section typing writes `draftProps` into the context value per keystroke | 72 `useEditContext()` consumers re-render per character (`inspector-dock.tsx:639`) |
| 3.2 | Five bare range sliders commit per tick | `cta-banner-content.tsx:251`, `category-grid-content.tsx:280`, `featured-talent-content.tsx:541,555`, `talent-type-grid-content.tsx:639`, `style-panel.tsx:5799` (that last one is a full history entry per tick). Pattern to copy already exists: `DebouncedRangeInput` in `motion-panel.tsx:65`. |
| 3.3 | Prod pays ~5 full-tree walks per mutation for a dev-only audit event | guard is on the wrong side of the call |
| 3.4 | Every confirmed autosave synchronously stringifies up to 20 tree snapshots to localStorage | main-thread block on the save path |
| 3.5 | Undo waits a server round-trip per step | flush-then-pop serializes N saves on rapid undo |
| 3.6 | Style panel + friends (~25k lines) parsed eagerly at editor boot | `inspector-dock.tsx:63` static import; the deferred `next/dynamic` follow-up from July never shipped |

**Definition of Done**: a before/after measurement for 3.1 and 3.2 (React Profiler
commit count per keystroke, captured live), not just "it feels faster". Editor boot
chunk size before/after for 3.6. No render-output change: `render-output`,
`builder-node-editor-published-parity`, `render-perf-budget` all green.

---

### WAVE 4 — Copy and i18n to 8.5

| # | Surface | Approx strings | Note |
|---|---|---|---|
| 4.1 | Floating canvas control bars | ~148 | Hottest surface in the editor, zero `t()` today |
| 4.2 | Publish preflight | ~18 | On the publish path |
| 4.3 | AI panels (7 files) | ~38 | |
| 4.4 | Deep inspectors (layout/style/motion/data/builder-node-content) | ~620-890 | The long tail; split across 2 agents |
| 4.5 | **ES parity guard** | n/a | A static test that FAILS CI when a `t()`-wrapped string has no ES entry. Without this the tail regrows silently. Build this FIRST in the wave. |

**Definition of Done**: parity guard green and armed in CI; `useEditorLocale` reach
above 90% of user-visible strings in `edit-chrome`; a Spanish operator can complete
the core loop (add section, edit text, style it, publish) without meeting English.

---

### WAVE 5 — Security and code health to 9.0 / 8.5

| # | Item | Detail |
|---|---|---|
| 5.1 | Agency logo upload | Still the banned raw-FormData server action (unreachable 10MB cap) and still accepts SVG into a public bucket with no sanitize. Port to the signed pipeline; sanitize or reject SVG. Ensure the `ratchet/no-raw-file-formdata` guard covers it afterward. |
| 5.2 | RLS `is_staff_of_tenant` admits `pending_acceptance` to writes | Narrow write policies to `status = 'active'`. Migration: one timestamp, `date -u +%Y%m%d%H%M%S`, and `npm run db:push` is part of the commit. |
| 5.3 | e2e serial coupling | `builder-smoke.spec.ts` shares ONE draft across serial tests; scenario-B still `test.fixme` (3 fixmes total). This coupling is the root cause of every e2e fragility and of the toolbar lane having no coverage. Fix = per-test fresh seeded baseline. |
| 5.4 | `selection-layer.tsx` ~7,900 lines, no ratchet | Extract the #908 nested-panel UI (a clean seam) and add a line-count ratchet so it cannot silently regrow again. |
| 5.5 | `builder-node` blanket barrel | 24 `export *` lines drag ~12k lines plus the sections tree into 74 consumers including server routes. Split a types/registry entry for light consumers. |
| 5.6 | 3 dead modules, 549 lines, zero importers | `design-thumbnails.ts`, `starter-wireframes.tsx`, `inspectors/responsive-field-utils.tsx` |

---

### WAVE 6 — Quick bar completion

The bar shipped in #1001 but only mounts where the editor mounts.

| # | Item |
|---|---|
| 6.1 | Mount bar-only (no editor) on the tenant's other public pages: directory, profiles, any storefront route. Today an admin on `/directory` gets nothing. |
| 6.2 | Hub hosts show the label with no links. Decide: hub-appropriate destinations, or hide the nav entirely. |
| 6.3 | Add to the #991 HQ "Workspace UI" switch card so the platform can hide it per-deployment, matching the FAB and tour. |
| 6.4 | Mobile: the link row scrolls horizontally on narrow screens. Verify at 390px and decide if it should collapse to a menu. |

**PARALLEL-SAFE** with waves 1 to 5 (touches `edit-chrome-mount` and one new component only).

---

## 3. Non-negotiable execution rules

These are distilled from what actually went wrong in the 08-04/05 wave. An agent that
skips one of these produces work the integrator has to redo.

1. **Live QA decides, not tests.** The undo fix passed its unit tests in two
   successively wrong versions. Only the browser repro caught both. Any claim of the
   form "X now works for the operator" needs a live browser verification with a
   measured before and after. Tests prove the contract; they do not prove the UX.
2. **Never read a gate through `tail`.** A `tsc` check piped through `tail -3` hid a
   real error behind an npm notice and turned `main` red. Count matches the way CI
   does: `grep -cE 'error TS[0-9]+:'` over the *whole* output, and print the count.
3. **Rebase before you gate.** `main` moves under long-running agents. Rebase onto
   latest `origin/main`, re-run gates, then commit.
4. **Agents die. Salvage, do not restart.** Background agents were killed 3 times
   mid-work leaving 0 commits but real changes on disk. Before assuming a dead agent
   did nothing: `git -C <agent-worktree> status --short`. Rebase, fix what it left
   broken, gate, ship. Restarting from scratch throws away good work.
5. **One migration timestamp per agent**, generated at the start of work. If two
   collide, use the park-restore pattern and document it in the commit.
6. **Never quarantine a test that found a real bug.** Quarantine is for runner
   mismatches and stale fixtures. Fix the bug.
7. **The deploy gate is real.** Production advances only on green `main` CI. A red
   `main` blocks everyone. Fix red `main` before starting new work.
8. **House copy rules** apply to everything user-visible: no em dashes, section/block
   as the only structure nouns, never buyer/cart/pay-to-DM, no gold/rust/amber in
   admin chrome, no dead CTAs.

---

## 4. Per-wave gate (Definition of Done, mechanical)

Every wave, before the integrator reports it complete:

```bash
cd web
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -cE 'error TS[0-9]+:'   # must print 0
npm run lint                                                                                 # must exit 0
npm run test:builder && npm run test:builder-chrome && npm run test:builder-capabilities
node scripts/check-builder-test-lane-coverage.cjs                                            # every new test in a lane
```

Plus: the wave's own live-QA evidence, captured as concrete before/after values (not
prose), and a screenshot for anything visual.

After merge (owner's word required): watch `main` CI to completion, confirm the
production pointer advanced, then `npm run deploy:smoke`.

---

## 5. Agent dispatch template

Each wave's agents get a prompt built from this skeleton. Filling it in is the
integrator's job at dispatch time, using the wave table above.

```
You are implementing WAVE <N> item(s) <x.y> of the page-builder 8/10 program
(web/docs/page-builder-8of10-program-2026-08-05.md). Isolated worktree; do not
touch other worktrees.

SETUP: git fetch origin main && git switch -c <branch> origin/main && cd web && npm ci

THE DEFECT: <verified evidence from the wave table, with file:line>
WHY IT MATTERS: <user-visible consequence>
THE IN-REPO TEMPLATE: <the existing correct pattern to copy, with file:line>

RULES: read section 3 of the program file and follow every rule. In particular:
count tsc errors, never tail them; rebase before gating; live QA is not optional
for UX claims.

GATES: section 4 of the program file.
DELIVERABLE: commit(s), push, gh pr create --base main. DO NOT MERGE.
Final message: PR URL, 5-line summary, and an explicit list of what you did NOT
get to and why.
```

---

## 6. Sequencing and capacity

| Wave | Agents | Parallel-safe with | Est. |
|---|---|---|---|
| 1 Draft trust | 2 | 6 | 1 session |
| 2 Editor UX | 2 | 6 | 1 session |
| 3 Performance | 2 | 4, 6 | 1 session |
| 4 Copy + i18n | 3 | 3, 5, 6 | 1 session |
| 5 Security + health | 3 | 4, 6 | 1 session |
| 6 Quick bar | 1 | all | half session |

File-collision map (why some pairs are not parallel-safe):
- Waves 1 and 3 both touch `edit-context.tsx`. Never run together.
- Waves 2 and 3 both touch `selection-layer.tsx` and inspector content panels.
- Wave 5's e2e work and Wave 2's new e2e spec both touch `builder-smoke.spec.ts`:
  Wave 5 should land the independence refactor FIRST if both are queued.

---

## 7. Ledger

Updated by the integrator after every wave. This is the follow-up surface: a fresh
session reads this table to know exactly where the program stands.

| Wave | Status | Branch / PR | Landed | Live-QA evidence | Score move |
|---|---|---|---|---|---|
| 1 Draft trust | NOT STARTED | | | | 6.0 to _ |
| 2 Editor UX | NOT STARTED | | | | 6.5 to _ |
| 3 Performance | NOT STARTED | | | | 6.5 to _ |
| 4 Copy + i18n | NOT STARTED | | | | 5.5 to _ |
| 5 Security + health | NOT STARTED | | | | 7.5 / 7.0 to _ |
| 6 Quick bar | NOT STARTED | | | | n/a |

**Overall: 6.5.** Update only when a dimension's DoD is met AND no other dimension
regressed.

---

## 8. What this program deliberately does NOT do

Stated so nobody re-litigates them mid-flight:

- **No builder rewrite.** The engine and data model were 8/10 in the original audit
  and remain the strongest part of the system. Every wave is surgical.
- **No new features** beyond finishing the quick bar. The gap between 6.5 and 8.5 is
  entirely trust, feel, and reach, not surface area.
- **No re-litigating what the audit found SOLID**: the publish drawer and preflight,
  the mobile-overflow blocker, XSS render guards, cache discipline, selection a11y
  and the keyboard model, public bundle hygiene, tenant isolation. Leave them alone.
- **Not chasing 10/10.** 8.5 is "a professional tool a paying tenant trusts". The
  remaining 1.5 is polish with a much worse return per hour.

---

## 9. Known open questions the owner may want to answer first

1. **Priority order.** The waves are sequenced by my judgment of value. If the near-term
   goal is a specific launch or a specific tenant, that should reorder them.
2. **Spanish depth.** Wave 4's tail is large. Is full ES parity a launch requirement,
   or is core-loop coverage enough for now?
3. **Non-homepage pages.** Wave 1 assumes ordinary cms pages matter as much as
   homepages. If tenants overwhelmingly only edit the homepage, Wave 1 shrinks a lot.
4. **Perf target.** Is there a device or tenant size where the editor currently feels
   bad? A real reference case beats a synthetic profile.
