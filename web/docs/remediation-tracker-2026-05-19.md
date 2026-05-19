# Remediation Tracker — the 78→100 climb (living scoreboard)

**Updated: 2026-05-19.** Companion to `remediation-plan-2026-05-19.md` (the binding
spec). This file is the *status board* — I update it every time a lane reports
or lands. Honest numbers only; no vanity rounding (per the audit mandate).

---

## Score trajectory (measured, not aspirational)

| Checkpoint | Score | Basis |
|---|---|---|
| Baseline | **54** | original audit |
| After CP1 (Phase 0 safety net) | ~60 | re-audit |
| After Wave 1 (CP2 + 1c + 1b + P2 + Lane 2) | **~68** | measured re-audit — *this is where we are* |
| Projected after 1d + 1e + 2-finish + 3 | ~76–78 | projection |
| Realistic structural ceiling | ~88–92 | 90→100 is negative-ROI vanity |

> "78→100" is shorthand for the remaining climb. The honest current number is
> **~68 measured**. The test net (below) does not raise the score by itself —
> it is the *safety harness* that lets the score-moving structural lanes land
> without silent regressions.

---

## ✅ Landed on origin/phase-1 — verified clean fast-forwards

| # | Commit | Lane | Proof |
|---|---|---|---|
| 1 | `714a19c73` | Phase 0 CP1 net (+ Phase 1a talent.tsx 15.5k→275) | FF, verified |
| 2 | `be6db1def` | CP2-wave (collapse dead initiator_role + FieldEditor) | FF |
| 3 | `94ffda5e9` `deb31a270` | Phase 1c messages.tsx 16k→73 + stash + integ fix | FF |
| 4 | `a87629120` | Phase 1b state.tsx 9.5k→30 decomp | FF |
| 5 | `0f12c7ba2` | Phase 2 ThreadShell primitive + talent-inbox adoption | FF |
| 6 | `d9b13b62c` | Lane 2 engine characterization (inquiry/coord/lifecycle/pitch) | FF |
| 7 | `cf16505c6` | **Billing characterization — 87 tests, zero-source** | FF · zero-source · tsc-verified · **2026-05-19** |

---

## 🔨 Structural lanes (these move the score) — in flight

| Lane | Scope | Worktree | State |
|---|---|---|---|
| Phase 1d | `drawers.tsx` ~31.5k decomp — **biggest remaining god-file** | `impronta-drawers-decomp` | running · no commits yet |
| Phase 1e | `pages.tsx` ~12k decomp | `impronta-pages-decomp` | running · no commits yet |
| Phase 2-finish | ThreadShell into admin + client surfaces | `impronta-ts-adopt` | running · no commits yet |
| Phase 3 | design-token codemod (~8.7k inline styles) | `impronta-tokens` | **commits present (`f275561f0`) — not yet reported** |

## 🧱 Infra / quality lanes — in flight

| Lane | Scope | Worktree | State |
|---|---|---|---|
| T2a | CI structural quality gate | `impronta-ci` | running · no commits yet |
| T2b | data-access layer + generated Supabase types (~535 `.from()`) | `impronta-data-layer` | running · no commits yet |

## 🧪 Test net — 6 zero-source parallel lanes (cannot break source)

| Lane | Worktree | State |
|---|---|---|
| billing | `impronta-tests-billing` | ✅ **DONE + LANDED `cf16505c6`** — 85 pass / 2 skip-flags / 0 fail |
| inquiry-engine | `impronta-tests-inq` | ⏳ tests written (4 files, 51 cases: 48 pass / 3 skip incl. 1 bug-flag) · **zero-source** · suite 238 = 232 pass/0 fail/6 skip, zero regressions · **NOT committed** — hard-gated on clean tsc; tsc OOM-deferred by concurrent-lane contention, verdict pending |
| pitch-engine | `impronta-tests-pitch` | running — *Lane 2 already shipped baseline; this is depth* |
| auth-isolation | `impronta-tests-auth` | running |
| server-actions | `impronta-tests-sa` | running |
| field-catalog | *(no worktree observed)* | unconfirmed — may not be launched |

---

## ⛔ Gated / deferred / do-not-start

- **T2c residue decomp** (primitives.tsx 8.8k, talent-drawers.tsx 7k) — GATED on
  Phase 1d **and** 1e landing. Starting early = guaranteed rebase hell.
- **T2d hygiene** (hook-dep suppressions, 182 console.log, prune suppressions
  baseline) — run **LAST**, after structure settles. `impronta-hygiene` parked.
- **Tier-3 RSC / "use client" rework** — months-scale; needs product-owner
  scheduling *after* the test net. Not a lane, not a prompt.

---

## 🐞 Suspected bugs surfaced by characterization (filed, NOT fixed)

ADD-test-only mandate → these are pinned with `it.skip("… looks wrong — reported")`,
behavior left exactly as-is until you decide.

| From | Flag |
|---|---|
| billing | NaN `platform_take` override bypasses the range guard (`typeof NaN==="number"`) → surfaces as a misleading `lanes_do_not_sum` instead of `platform_take_out_of_range` (points operators at line-item pricing, not the bad override) |
| billing | `formatCommissionSnapshot` rounds money to whole units (`maximumFractionDigits:0`) → `$50.01` renders `"$50"`; the four displayed lanes won't visibly reconcile to gross |
| inquiry-engine | `describeCrossTenantContext` returns the dangling string `"Routed to "` when `isCrossTenant:true` + empty parties (pinned via `it.skip`; not yet committed pending gate) |

Engine/Lane-2 characterization flags are tracked in the plan doc §test-gap.

---

## ⚙️ Operational reality — why the test lanes report slowly + serially

Every test lane hard-gates on a clean `tsc --noEmit` (binding §5.5). `tsc` on
this codebase is ~2–4 GB RAM. With 4–5 lanes racing it simultaneously the
machine memory-thrashes and the OOM killer SIGTERMs runs (exit 144) — observed
2026-05-19 (sa + pitch + auth + p3-rebase all `tsc` at once, ~11M pageouts).

**This is not breakage.** Test lanes are zero-source and parallel-safe — they
cannot collide or regress anything. The *only* cost is wall-clock: lanes
effectively serialize on the tsc gate and retry. They are self-healing; they
report one at a time as each wins the memory lottery for its tsc run.
Implication for the operator: expect staggered, not simultaneous, completion;
do not launch *more* tsc-gating lanes while several are mid-gate; nothing to fix.

## Integrator protocol (how lanes land — unchanged)

Each parked lane, when it reports: I (integrator) **verify-each on the stacked
tree** (zero-source diff · FF-ancestor proof · tsc zero-new · run new tests) →
**FF-only push** to `origin/phase-1` (no force, no merge commit, never push
through a conflict) → **before==after audit** of the delta. One wave at a time.
This is the standing AUTHORIZATION GRANT for this remediation series.
