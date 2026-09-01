# Builder 2027 — ship gate

The gate for the Builder 2027 program: what runs, where it runs, and why the split is what it is.
Plan: `~/.cursor/plans/builder_2027_full_exec_b9b689af.plan.md`. Created Phase 0, 2026-09-01.

## The split, and why

`qa:builder-2027-ship` **cannot run in GitHub Actions.** It chains Playwright `qa:impronta-*` lanes that need a dev server, seeded tenant data, and live Supabase credentials the workflow does not carry. So it is a **local pre-merge gate**, run by the executor before every phase PR.

A local-only gate rots. This repo has the scar: `check:field-catalog-frozen` sat in the `ci` aggregate for months while the workflow never invoked it, which is why `check:ci-lane-parity` exists. But parity only matches `test|check|verify|eval:*` — a `qa:*` meta-script is invisible to it.

So the program runs **two** things:

| What | Where | Proves |
|---|---|---|
| `qa:builder-2027-ship` | Local, before every phase PR | The code actually passes |
| `check:builder-2027-gate` (+ `-selftest`) | **CI**, every PR | The gate is still well-formed |

CI cannot run the gate, but it can prove the gate still references every lane it claims, that no lane was renamed into a silent no-op, and that each phase's new verification is wired in the moment its script exists.

## `qa:builder-2027-ship` — the 17 chained lanes

Standing per-commit gate (10, all required by the integrity guard):

`typecheck` · `lint` · `verify:server-actions` · `test:builder` · `test:builder-chrome` · `test:builder-capabilities` · `test:publish-preflight` · `verify:builder-ownership` · `test:size-ratchet` · `check:builder-test-lane-coverage`

Program guards (3): `perf:builder-budget` · `check:ci-lane-parity` · `check:builder-2027-gate`

Live/e2e (4): `qa:impronta-section-build` · `qa:impronta-freeform-renderer` · `qa:impronta-builder-wave3` · `qa:impronta-registered-host-matrix-local`

Fidelity (`e2e/fidelity/fidelity.spec.ts`) is **already** a CI job and is deliberately not duplicated here.

## `check:builder-2027-gate` — the three invariants

1. `qa:builder-2027-ship` exists.
2. Every `npm run <script>` it references is a real script. A rename or typo turns a lane into a silent no-op that still reports success.
3. All 10 REQUIRED lanes are chained, **and** every self-tightening lane that now exists in `package.json` is chained.

Invariant 3 is the one that earns its keep. These three lanes do not exist yet:

| Lane | Lands in | Rule |
|---|---|---|
| `verify:no-embed-bridges` | Phase 8B | absent = fine; present-but-unchained = red |
| `check:no-legacy-pages` | Phase 8-1b | same |
| `test:e2e:builder-2027-anchor-smoke` | Phase 11 | same |

Creating the script is not enough. Forgetting to wire it into the ship gate turns CI red that same day, rather than being discovered at Phase 12 when the gate proves less than it appears to.

**Mutation-verified** (2026-09-01): dropping a required lane, referencing a typo'd lane, landing a phase lane without chaining it, and deleting the gate outright each produce exit 1; the restored state is exit 0. The `--selftest` covers the matchers themselves and runs in CI ahead of the real check.

## Per-phase additions

Each phase adds its own lanes on top of the standing gate. Recorded here as they land.

| Phase | Adds | Status |
|---|---|---|
| 0 | `check:builder-2027-gate`, `check:builder-2027-gate-selftest`, `qa:builder-2027-ship` | landed |
| 2A | `test:builder-node-bindings`, `test:node-presentation` per new kind | pending |
| 8B | `verify:no-embed-bridges` — live crawl + static + DB | pending |
| 8-1b | `check:no-legacy-pages` | pending |
| 11 | `test:e2e:builder-2027-anchor-smoke` | pending |

## Baseline

Recorded on `main` @ `8d5e46a9d` at the start of Phase 0. See `builder-2027-qa-log.md` for the result table and any pre-existing failures the program inherits.
