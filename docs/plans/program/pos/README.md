# POS design & execution program — Start Here / Resume Execution

**Revision:** deck v3.3 (9 Sep 2026) · records on branch `docs/pos-program-2026-09` (worktree off `origin/main` 7661c795d) · commit follows this file.
**Depends on:** draft PR #1934 `cursor/journeys-program-c4d3` — head `a6b04b8c60`, updated 2026-09-09 15:22Z, **CONFLICTING with main**, 100 commits / 496 files. It holds all POS code, visits, Mercado Pago collection, outbox, the 48 case files, `START-HERE.md`, `ledger.md`, `scenario-matrix.md`, `scenario-register-404.md`. Nothing POS is on `main`. Its `START-HERE.md` "Honest count" (0/48 cases) is the truth for case status; this folder does not restate it differently.
**Approval state:** designs, coverage records and this plan are complete and authorized. **Application implementation is NOT authorized yet.** Nothing here touched production, applied migrations or ran live money.

## What is authoritative
| Question | Where |
|---|---|
| Task status, order, dependencies | `execution-plan.md` (v2) · linked view `tracker.md` §1 |
| Which scenarios exist and which apply to POS | `tracker.md` §2 (404 blueprint scenarios by family) and §3 (240 case-role records) — two kinds of coverage, never summed |
| Case progress | `case-progress.md` (mirrors PR #1934 `scenario-matrix.md`) |
| Modes and the 48-case map | `modes.md` |
| Product journeys and their screens/code/tests | `coverage-matrix.md` · `screen-index.md` |
| Every visible action | `actions.md` |
| Baseline (designed / implemented / connected / verified / awaiting external / missing) | `baseline.md` |
| Corrections and honesty | `v3.1-corrections.md`, `preserved-changed-added-unverified.md` |
| Decisions and external dependencies | `decisions.md` |
| Validation | `node scripts/program/validate-pos-program.mjs` (task ids, cycles, next-ready, orphan rows) |

## Resume order
1. Read PR #1934 `START-HERE.md`, then this README, then `tracker.md`.
2. Confirm revision: `git log -1 origin/main`, `gh pr view 1934 --json headRefOid,mergeable`. If the PR moved or merged, update `baseline.md` before picking work.
3. Run the validator. Pick the highest-priority **ready** task in `execution-plan.md` whose deps are done; implement; run its checks; write evidence at the named path; update `tracker.md` status and `case-progress.md`; continue. Two failed same-approach attempts → different approach or mark blocked with the exact cause and take independent work.
4. Parallel lanes only where the `Owns` column is disjoint and the gate queues allow (lint cap 1, tests cap 2, typecheck serialised). Dev servers need a CPU lease.

## Checks (present in the repo)
```
cd web && npm run typecheck && npm run lint
cd web && npm run test:money && npm run test:capacity
cd web && npm run journeys:audit           # PR #1934 only · isolated qa-journeys · refuses production
cd web && npm run verify:capacity-concurrency   # manual · needs .env.vercel.local · never CI
node scripts/program/validate-pos-program.mjs   # this program's records
```

## Statuses
Not started · Implementing · In active audit · Implemented, awaiting focused verification · QA failed · Blocked by defect · Awaiting external verification · Verified in test environment · Release verified. Scenario results additionally carry **untested** and **not applicable (reason)**.

## Blockers today
See `decisions.md` §External dependencies. Summary: PR conflict (POS-1.1a), Stripe test keys absent in isolated env, no Mercado Pago sandbox, no tablet run, no schema for waitlists / credits / gift cards / memberships / payment links / resources.

## Next action
Owner approval → run the first cycle in `execution-plan.md` §First ready execution cycle: POS-1.1a → 1.1b → 1.1c → 1.2 → 2.1a → 2.1 → 1.7, with POS-1.6, 5.0a, 1.5, 3.8 in parallel on disjoint files.

## Back office (added 9 Sep 2026)

- Back-office deck: `Tulala-Workspace-BackOffice.pdf` (52 pages) — the workspace pages that supply the POS modes and the live website (catalog, menu structure, classes sessions, roster availability, spaces & layouts, events venue/event day, settings for POS/payments/roles/policies, payments reconciliation). Codes `W00`–`W35` in screen-index.md; W26–W35 = the People model (D-POS-9, see people-model.md).

## Audit 2026-09-09

- Owner-supplied mockup audit (F01–F34, D01–D25) → `audit-2026-09-09-disposition.md` (ledger) and `audit/2026-09-09-mockup-audit-source.md`. Navigation decision taken (W36–W38); Schedule = Sessions (W39–W40). Master blueprint PDF 267 pages in five parts.

## Final coverage pass (2026-09-09)

- `coverage-final.md` — screen/flow → role → entry → devices → ids → prototype → gap, with Completed / Needs correction / Missing and optional polish separated. Mobile workspace (MW00–MW37), My work, role screens (G08, K09, K10), outside-sidebar and shared states (W53–W59). Design handoff closes here; implementation follows the existing approval state.
