# Phase 0 — Registered-host QA matrix

Per [builder-execution-plan-2026.md §4](builder-execution-plan-2026.md) **P0-1**. Preview URLs under `*.vercel.app` do **not** hit app routes until aliased to a host in `public.agency_domains` ([middleware](../../CLAUDE.md)).

## Preconditions

- Tenant host present in `agency_domains` (e.g. production alias domain).
- Authenticated builder session (agency admin).

**Automation cannot replace this doc:** filling the matrix requires a human on a registered host. To **waive** Phase 0 for a release, record the risk note + approver in **Deferred bugs** and update [builder-execution-plan-2026.md § Implementation status](./builder-execution-plan-2026.md).

## Viewport matrix

For each width, complete the checklist and note **Pass / Fail** and **Issue ID** (ticket or PR).

| Width | Insert section visible on canvas | Navigator sync | Publish succeeds | No console errors on insert/publish |
|-------|-----------------------------------|------------------|------------------|--------------------------------------|
| ~390px | Pass | Pass | **Fail** — [BUG-010](./builder-human-qa-run-2026-05-09.md) (re-test after `topbar` scroll strip + `test:e2e:impronta-topbar-publish-narrow`) | **Fail** — [BUG-009](./builder-human-qa-run-2026-05-09.md) |
| ~820px | Pass | Pass | **Fail** — [BUG-010](./builder-human-qa-run-2026-05-09.md) | **Fail** — [BUG-009](./builder-human-qa-run-2026-05-09.md) |
| ~1440px | Pass (draft 7A w/ temp blank section) | Pass | **Fail** — [BUG-004](./builder-human-qa-run-2026-05-09.md) / preflight (masonry URL overflow + section count) | **Fail** — [BUG-009](./builder-human-qa-run-2026-05-09.md) |

**Evidence (2026-05-13):** `https://improntamodels.com` — Chrome 148 — logs under [`qa-evidence/2026-05-13-registered-host/`](./qa-evidence/2026-05-13-registered-host/). **Batch 03 / 7A acceptance:** not closed until matrix + publish path are green or waived with approver (see [`builder-execution-batches.md`](./builder-execution-batches.md) §Batch 03).

**Roadmap reconciliation:** Cursor plan item `verify-p0-1` tracks “doc vs roadmap truth,” not that every cell is **Pass**. Filling Pass/Fail (or recording an explicit waiver + approver in [builder-execution-plan-2026.md](./builder-execution-plan-2026.md)) remains **`pr-p0-1`** until product accepts the matrix or waives risk.

### Builder continuation (five-step queue)

Use this after **BUG-010 / BUG-009 / BUG-004** mitigations are on a **registered host** you can load (see [CLAUDE.md](../../CLAUDE.md) — raw `*.vercel.app` previews do not hit tenant routes).

| Step | Owner | Action |
|------|--------|--------|
| 1 | Eng | Ship builder fixes (topbar scroll, client Speed Insights, preflight URL hygiene); run `cd web && npm run qa:impronta-registered-host-matrix-local` before promote. |
| 2 | Human | Re-run the **viewport matrix** above on `improntamodels.com` (or your QA tenant); update Pass/Fail + date in §Viewport matrix and [builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md) if BUG rows move. |
| 3 | Human | **7A Reality Test** (blank section → library insert → reorder → publish → hard refresh → reopen); attach evidence under `web/docs/qa-evidence/` and note `gate-qa-7a-demo` in [builder-execution-plan-2026.md](./builder-execution-plan-2026.md). |
| 4 | Human + Eng | **BUG-004** class: if publish still blocks, run [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) draft reset or clean long URLs in content; file new issues if preflight is wrong, not just noisy drafts. |
| 5 | Human | After Batch 03 is **Done** or explicitly waived: [Batch 04](./builder-execution-batches.md) `pr-*` manual sweep (VoiceOver + polish sign-offs). |

### Steps (repeat per viewport)

1. Open site workspace → live preview / builder for a CMS page (`/p/...`).
2. Insert a new section (library or duplicate).
3. Confirm new section appears **on canvas** without full page reload; navigator lists it in same order.
4. Open publish drawer; run preflight; publish (or dry-run if staging policy forbids live publish).
5. Open DevTools console; confirm no **errors** (warnings acceptable if documented).

## Deferred bugs (P0-3)

Tracked human-QA / engineering backlog (see [builder-human-qa-run-2026-05-09.md](./builder-human-qa-run-2026-05-09.md)). **This table does not waive** the viewport matrix in §Viewport matrix — add an explicit waiver row + approver only if you intentionally skip P0-1 per [builder-execution-plan-2026.md](./builder-execution-plan-2026.md).

| Severity | Summary | Owner | Link |
|----------|---------|-------|------|
| Critical | BUG-001 — Local `next dev` slow / heap OOM on heavy builder routes | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) |
| Critical | BUG-002 — Navigator/inspector vs canvas for inserted starters (DSH covered by `test:e2e:impronta-directory-search-hero`; other starters still human) | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) |
| Critical | BUG-003 — Device preview iframe blank for some selections (mitigations in code + DSH e2e) | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) |
| High | BUG-004 — Polluted / duplicate homepage draft makes subjective QA noisy | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) · [Baseline reset](./impronta-local-qa-homepage-baseline.md) |
| High | BUG-005 — Publish / “saved” trust when canvas still wrong (preflight + copy slices landed; full loop human-gated) | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) |
| High | BUG-006 — Tulala shell vs Impronta tenant brand clarity in edit chrome | Web | [Human QA run](./builder-human-qa-run-2026-05-09.md) · mitigation: [`topbar.tsx`](../src/components/edit-chrome/topbar.tsx) `BrandMark` shows **site · page** (slug fallback) |
| Medium | BUG-007 — Add-section library density for first-time users | TBD | [Human QA run](./builder-human-qa-run-2026-05-09.md) |
| Medium | BUG-008 — Technical labels in review / metadata surfaces | Web | [Human QA run](./builder-human-qa-run-2026-05-09.md) · mitigation: [`composition-library.tsx`](../src/components/edit-chrome/composition-library.tsx) kit/tile/review copy (2026-05-14) |
| Medium | BUG-009 — Registered-host console noise (404/400, Speed Insights `script.js` MIME, React #418) | Web | [Human QA run](./builder-human-qa-run-2026-05-09.md) · mitigation: client-only [`ClientSpeedInsights`](../src/components/analytics/client-speed-insights.tsx) |
| High | BUG-010 — Publish control off-screen / unreachable on ~390 / ~820 builder viewports | Web | [Human QA run](./builder-human-qa-run-2026-05-09.md) · mitigation: [`topbar.tsx`](../src/components/edit-chrome/topbar.tsx) horizontal scroll + `test:e2e:impronta-topbar-publish-narrow` |

## Automated substitute (local dev only)

**Dirty local homepage:** If Impronta `/impronta?edit=1` is full of duplicate QA sections, see [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) (inspect SQL + optional draft reset) before scoring human scenarios.

Not a replacement for registered-host QA. From repo root:

```bash
cd web && npm run test:e2e:browser-health
cd web && npm run test:e2e:registered-host   # loads https://tulala.digital — verifies no middleware host block (override with PLAYWRIGHT_REGISTERED_HOST_URL)
cd web && npm run test:e2e:impronta-local   # requires dev stack + seed
cd web && npm run test:e2e:impronta-phase0-edit-loop   # reorder + reload (publish skipped unless PLAYWRIGHT_IMPRONTA_PHASE0_PUBLISH=1)
cd web && npm run test:e2e:impronta-navigator-child-reorder
cd web && npm run test:e2e:impronta-navigator-layers-collapse-search   # same Playwright filter as test:e2e:impronta-navigator-layer-filtering
cd web && npm run qa:impronta-navigator-sanity   # both navigator tests above + test:builder-node-bindings
cd web && npm run qa:impronta-phase0-edit-loop:full   # destructive: draft reset + publish e2e + builder-node tests (see impronta-local-qa-homepage-baseline.md)
cd web && npm run qa:impronta-registered-host-matrix-local   # typecheck + narrow topbar + Phase 0 edit loop + blank_section (run before re-doing registered-host matrix after BUG-010 deploy)
```

Record last run date and result here:

| Date | Command | Result |
|------|---------|--------|
| 2026-05-09 | `npm run test:e2e:browser-health` | Pass (Chromium) |
| 2026-05-09 | HTTPS GET https://tulala.digital (curl) | HTTP 200; HTML body does not contain Host not registered |
| 2026-05-09 | `npm run test:e2e:registered-host` | Pass (Chromium) — default URL `https://tulala.digital` |
| 2026-05-09 | `npm run typecheck` + `npm run test:tenant-isolation` + `npm run test:builder-capabilities` + `npm run test:publish-preflight` + `test:e2e:browser-health` + `test:e2e:registered-host` (single batch) | Pass (local) |
| 2026-05-12 | `cd web && npm run test:e2e:impronta-directory-search-hero` (requires local Next on `:3000` + dev sign-in env) | Pass (Chromium) — Directory Search Hero insert; desktop canvas + mobile preview iframe |
| 2026-05-12 | `cd web && npm run test:e2e:impronta-phase0-edit-loop` | Pass (Chromium) — reorder + reload persistence; **publish/reopen leg skipped by default** (preflight blockers on typical polluted drafts). Full loop: `npm run reset:impronta-homepage:draft -- --apply` then `npm run test:e2e:impronta-phase0-edit-loop:full`. |
| 2026-05-12 | `cd web && npm run qa:impronta-phase0-edit-loop:full` | Chains draft-only reset + full Phase 0 e2e + `test:builder-node-bindings` — run only when you accept DB writes (see [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md)). |
| 2026-05-13 | `cd web && npm run test:e2e:impronta-navigator-child-reorder` | Pass (Chromium) — same-parent move down + move up |
| 2026-05-13 | `cd web && npm run test:e2e:impronta-navigator-layers-collapse-search` (alias `test:e2e:impronta-navigator-layer-filtering`) | Pass (Chromium) — expand all / collapse all + layer search |
| 2026-05-14 | `cd web && npm run test:e2e:impronta-topbar-publish-narrow` | Local guard for BUG-010 — Publish stays within viewport width after topbar horizontal scroll at 390 / 820. |

## Sign-off

- [ ] Matrix completed on production-like registered host.
- [ ] Blockers logged or fixed before Phase 6 / Phase 7.
