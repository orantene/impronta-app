# Builder execution batches (agent-oriented)

**Purpose:** Replace dozens of atomic Cursor todos with **few large runs**. Each batch is one coherent “take this list, execute, report evidence” unit for humans or agents.

**Canonical sequencing** still lives in [`builder-execution-plan-2026.md`](./builder-execution-plan-2026.md) §8 **Continue-mode execution queue** — batches here **group** those rows; they do not replace acceptance criteria in the roadmap.

**Branch / gates (always):** `phase-1` (per [`AGENTS.md`](../../AGENTS.md)). After edits: `npm run typecheck && npm run lint`. If middleware, tenant, RLS, `web/src/lib/saas/`, or publish/cache paths change: `npm run ci` and `npm run test:tenant-isolation`.

---

## Batch DONE — 7A prerequisites (code landed; human gates remain)

**Exit:** Repo already contains these; batch is **closed** for engineering unless regression.

| Area | Delivered (high level) |
|------|-------------------------|
| Library UX | P7A-1 empty / error / SR states (`composition-library`, `element-library-insert-picker`) |
| Selection | P7A-2 inspector skeleton + honest `selectedBuilderNodeId` (`edit-context`, `builder-node-content-utils`, tests) |
| Refresh | P9-1 edit-chrome `queueRouterRefresh` wiring (theme, overlays, inspector, shell inspector, empty-canvas fallback) |
| Canvas polish | P3-2 drop line / ghost / motion (`selection-layer`) — **manual** “premium feel” still on [`pr-p3-2`](./builder-execution-plan-2026.md) |
| Shell cache | P6-2 `publishPageSnapshot` + backfill `storefront` bust (`page-composer-action`, `site-shell-backfill-action`) — **manual** smoke on [`pr-p6-2`](./builder-execution-plan-2026.md) |
| Automated 7A-4 | `p7a-reorder-publish-parity.test.ts` — nested reorder, `blank_section`, cross-section, cross-slot body→footer |

**Still open after this batch:** registered-host 7A Reality Test, VoiceOver spots, profiling (`pr-p9-1`).

---

## Batch 01 — Phase 0 + host baseline (human + e2e heavy)

**Goal:** Impronta baseline trustworthy on **real host** + documented matrix.

**Includes (former todos / plan rows):** `exec-p0-edit-loop`, `exec-p0-registered-host`, `pr-p0-1`, `pr-p0-2`, `gate-qa-registered-host`, `gate-qa-phase0-waive`, `acc-ph0`, `qa-bug-001` … `qa-bug-008` (resolve or explicit defer in [`builder-human-qa-run-2026-05-09.md`](./builder-human-qa-run-2026-05-09.md) / [`phase-0-qa-registered-host.md`](./phase-0-qa-registered-host.md)).

**Process:**

0. **Local e2e:** With `PLAYWRIGHT_BASE_URL` pointing at **`localhost` / `127.0.0.1`**, Playwright auto-starts **`npm run dev`** when nothing is listening (see [`playwright.config.ts`](../playwright.config.ts); opt out with **`PLAYWRIGHT_SKIP_WEBSERVER=1`**). With `PLAYWRIGHT_USE_DEV_SIGNIN=1`, **`GET /api/dev/signin`** must return **200** — set `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` in `web/.env.local` if defaults in [`e2e/smoke.spec.ts`](../e2e/smoke.spec.ts) are wrong for your machine. For **`app.local:3102`** Impronta flows, start [`scripts/dev.sh`](../../scripts/dev.sh) (proxy + upstream) yourself; Playwright does not start the proxy.
1. Run local e2e: `cd web && npm run test:e2e:impronta-phase0-edit-loop` (and optional publish leg: `npm run test:e2e:impronta-phase0-edit-loop:full` or `npm run qa:impronta-phase0-edit-loop:full` per [`package.json`](../package.json)).
2. Run / record **registered-host** matrix viewports (390 / ~820 / 1440).
3. Log Pass/Fail or waiver with approver in Phase 0 doc; sync BUG table.

**Done when:** Matrix cells filled or waived + Phase 0 doc says so + BUG rows not silently stale.

---

## Batch 02 — 7A builder code (large code pass)

**Goal:** Close remaining **code-first** 7A gaps before claiming library shipped.

**Includes:** `p7a-2-multi-select`, `p7a-3-undo`, `exec-p7a-3-reorder` (if new gaps vs lib tests), `p7a-4-cache` / RSC alignment tests, `pr-p3-1` (canvas vs navigator `moveSectionTo` parity check), any new `p7a-reorder-publish-parity` / `builder-node` tests found during QA.

**Process:**

1. Read §8 seq 5–7 + [`p7a-0-persistence-contract.md`](./p7a-0-persistence-contract.md) if touching save paths.
2. Implement in **small commits** per [`AGENTS.md`](../../AGENTS.md) surfaces (`feat(edit-chrome):`, `feat(api):`).
3. `npm run typecheck && npm run lint` (+ `ci` / `test:tenant-isolation` if required).

**Done when:** Changelog rows + tests cover new behavior; no open **code** item under seq 6–7 except explicitly deferred.

---

## Batch 03 — 7A proof + pilot honesty (human blocking)

**Goal:** **7A Reality Test** + demo evidence so §8 can mark 7A “accepted”.

**Status (2026-05-15 sync):** **Not complete** for registered-host acceptance. Last matrix snapshot: [`phase-0-qa-registered-host.md`](./phase-0-qa-registered-host.md) (Fail cells tied to **BUG-010** / **BUG-004** / **BUG-009** until re-tested on production). Evidence pack: [`qa-evidence/2026-05-13-registered-host/`](./qa-evidence/2026-05-13-registered-host/). **Mitigations in tree (2026-05-14):** topbar horizontal scroll + `test:e2e:impronta-topbar-publish-narrow`, preflight URL hygiene, client-only Speed Insights, **BUG-006** brand line, publish-trust / SR copy — see [builder-execution-plan-2026.md](./builder-execution-plan-2026.md) changelog.

**Local only (does not waive Phase 0):** [`qa-evidence/phase0-localhost-2026-05-13.md`](./qa-evidence/phase0-localhost-2026-05-13.md) + screenshots — viewport dry-run; 7A flow was blocked on stuck saving until **`safeAction`** wrapping on composition/starter saves; re-run locally after merge.

**Promote / verify:** Follow deploy ladder in [`OPERATING.md`](../../OPERATING.md) §3 (`vercel promote` pre-launch) and ghost-domain **alias** notes in [`CLAUDE.md`](../../CLAUDE.md); raw `*.vercel.app` still will not hit tenant middleware — QA on **`improntamodels.com`** (or another registered host). Then update the §Viewport matrix + deferred BUG table honestly.

**Includes:** `exec-p7a-4-roundtrip`, `gate-qa-7a-demo`, `acc-ph7a`, `pr-p3-2` (premium drop feel), optional `pr-p2-*` / `pr-p9-*` spot-checks if blocking narrative.

**Process:**

1. Registered host (not raw `*.vercel.app` — see [`CLAUDE.md`](../../CLAUDE.md)): draft → edit → reorder → publish → hard refresh → reopen; tree matches.
2. Capture short evidence (screens/recording) referenced from roadmap or Phase 0 doc.

**Done when:** Evidence attached + roadmap §8 / gates updated honestly.

---

## Batch 04 — Builder `pr-*` manual sweep (Phase 2–6 + 8–9)

**Goal:** One **sitting** to burn down **manual** `pr-*` items that are code-complete but not signed off.

**Includes:** `pr-p2-1`, `pr-p2-2`, `pr-p2-3` (VoiceOver), `pr-p4-1`, `pr-p4-2`, `pr-p5-1`, `pr-p5-2`, `pr-p6-1`, `pr-p6-2`, `pr-p8-1`, `pr-p8-2`, `pr-p9-2` — plus linked `p6-spot-*` if run together with shell.

**Process:** Checklist per item in roadmap table; mark waived only with named risk.

**Done when:** Each row has **Pass / Waive+approver / Blocked** note in a single tracking doc or roadmap changelog.

**Operating checklist (pick up after Batch 03 evidence is honest):**

1. Open [builder-execution-plan-2026.md §4](./builder-execution-plan-2026.md) — use the **PR task IDs** table as the row list (files + risk + test hints live there).
2. For each `pr-p2-*` / `pr-p4-*` / … row in scope: run the **manual** step (VoiceOver, drag feel, shell smoke, etc.), then append one **changelog** line in § Implementation status with **Pass**, **Waive (name + risk)**, or **Blocked (symptom)**.
3. Do **not** start **7C** or **open-ended P7B inner-tree / slot work** until Batch 03 closes **7A acceptance** — Batch 04 stays polish on shipped code. **Exception:** a **bounded Hero layout pilot** (P7B — enum on existing Hero row) may exist on `phase-1`; it does **not** satisfy 7A or replace the Reality Test.

---

## Batch 05 — Pilot + premium gates + acc phases 3–6

**Goal:** Consolidate **pilot** and **premium** gates + acceptance phases that depend on 7A/Phase 0 being green.

**Includes:** `gate-pilot-*`, `gate-premium-*`, `acc-ph3`, `acc-ph4`, `acc-ph5`, `acc-ph6` (and `acc-ph1–2` if not done earlier).

**Done when:** Each gate has explicit status; contradictions escalated per [`AGENTS.md`](../../AGENTS.md).

---

## Batch 06 — 7B / 7C — **pilot slice shipped; expansion still gated**

**Shipped on `phase-1` (2026-05-13):** **P7B pilot** — Hero **layout variants** (`centered` \| `split-left` \| `split-right`) on the existing Hero section (schema + inspector + `data-hero-layout` CSS). Honest model: **props on the legacy Hero row**, not synthetic navigator children.

**Still parked until 7A accepted:** **7C** repeat patterns, **P7B-2+** governed inner slots / builder-node tree on Hero, **`p7b-var-*`**, **`acc-ph7b`**, broad **`7c-*`** — do not treat the pilot as **Advanced Mode (7A)** complete.

**Includes (when un-parked):** All `7c-*`, `pr-p7b-*` (beyond layout enum), `p7b-var-*`, `acc-ph7b`.

**Process:** **Batch 03** remains the acceptance gate; use the Hero pilot for product feedback only.

---

## Batch 07 — Post-v1 + strategy + P6 spots

**Goal:** Backlog burn when v1 shipped — not pre-launch critical path.

**Includes:** `pv1-*`, `strat-*`, `shell-no-fake-model`, `p6-spot-*`, `acc-ph8`, `acc-ph9`.

---

## How agents should use this file

1. Pick **one batch** (lowest number with open work).
2. Open the **Includes** list — map to files via [`builder-execution-plan-2026.md`](./builder-execution-plan-2026.md) and code search.
3. Finish with **one summary**: evidence links, commits, what remains.
4. Update **Cursor todos** to match only the **batch** rows (this file + todo tool stay in sync).

Last updated: 2026-05-15 (Batch 03 promote path + P7B pilot vs park alignment).
