# Automation draft — resume the 48 journeys program

Cursor Automations start a **fresh agent with no memory of this conversation**. This file is the handoff.

## When it fires

Cron, or after CI green on `cursor/journeys-program-c4d3` / `main` for this program.

## What the new agent must read first

1. [`PLAN.md`](PLAN.md) — the 20-task plan. Do not write a replacement plan.
2. [`START-HERE.md`](START-HERE.md) — claim, blockers, next action.
3. [`ledger.md`](ledger.md) — take the next unblocked task; stale claim after 6 hours.

## What to do

Continue the **existing** 20 tasks (P0-01 … P2-05 plus W-AUDIT). Sequence: P0, then P1 ∥ P2, then stop at the P2 boundary unless the ledger already opened P3.

Never run `verify:capacity-concurrency` against production. Never seed Impronta. Never mark awaiting-external work as passed.

## Checkpoint

Update the ledger, commit `<surface>: <terse what>`, push the branch, update the PR.
