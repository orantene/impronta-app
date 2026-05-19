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
| After Wave 1 (CP2 + 1c + 1b + P2 + Lane 2) | ~68 | measured re-audit |
| After Phase 1d (drawers 31k→625) | ~73–75 est. | single biggest lever — 4 worst god-files decomposed |
| **After Phase 1e (pages 12k→16)** | **~75–77 est.** | *5th god-file gone; lint gate IMPROVED 78→71; formal re-audit pending* |
| Projected after 3 + 2-finish | ~77–80 | projection |
| Realistic structural ceiling | ~88–92 | 90→100 is negative-ROI vanity |

> **Phase 1d landed `3db9a2922`** — `talent 15.5k→275` (1a) · `messages 16k→73`
> (1c) · `state 9.5k→30` (1b) · `drawers 31k→625` (1d): **~73,000 lines of
> monolith dissolved** behind byte-stable barrels, provably zero behavior
> change. This is the structural core of the whole plan. Honest current
> estimate **~73–75** (formal re-audit deferred until 1e/3/2-finish land too).
> The test net is the *harness* that made landing these safe — it does not
> raise the score itself.

---

## 📋 MASTER LIST — every prompt, one place (ground-truthed 2026-05-19)

Status verified against `git`, not memory. **origin/phase-1 = `0c8feda1e`.**
"Moves score?" is the honest distinction: **test lanes do NOT move 78→100** —
they are the safety harness. Only the *structural* lanes move the number.

| # | Prompt / lane | Type | Moves score? | Status | Your action |
|---|---|---|---|---|---|
| 1 | Test: billing & commission | test net | no (harness) | ✅ **LANDED** `cf16505c6` | close chat — done |
| 2 | tests/server-actions | test net | no (harness) | ✅ **LANDED** `3bbf1023c` | close chat — done |
| 3 | Test: inquiry engine | test net | no (harness) | ✅ **LANDED** `f40f44499` — 48 pass/0 fail, suite 238/0-fail; 1 bug-flag | close chat — done |
| 4 | tests/pitch-engine | test net | no (harness) | ✅ **LANDED** `397c69dd1` (2 bug-flags) | close chat — done |
| 5 | tests/auth-isolation | test net | no (harness) | ✅ **LANDED** `d6064737b` — **🔒 found 3 HIGH security holes** | close chat — done; **read flags below** |
| 6 | field-catalog tests | test net | no (harness) | ✖ **NEVER LAUNCHED** (Lane 2 already shipped baseline) | optional — skip unless you want depth |
| 7 | **Phase 1d — drawers.tsx 31k decomp** | **structural** | **YES — biggest lever** | ✅ **LANDED `3db9a2922`** — full-tsc 4-relocated/0-new, public-surface identical | close chat — **done 🎉** |
| 8 | **Phase 1e — pages.tsx 12k decomp** | **structural** | **YES** | ✅ **LANDED `0c8feda1e`** — full-tsc 4-relocated/0-new, public-surface identical, **gate 78→71** | close chat — **done 🎉** |
| 9 | **Phase 2-finish — ThreadShell client** | **structural** | **YES** | ✅ **REPORTED** `f0f93842b` — client shipped+proven, admin deferred w/ evidence | none — queued wave |
| 10 | **Phase 3 — design-token codemod** | **structural** | **YES** | ✅ **REPORTED & READY** `f275561f0` — queued wave (suppressions regen) | none — queued wave |
| 11 | T2a — CI structural gate | infra | indirect | ▶ running, **0 commits** | keep open |
| 12 | T2b — data-access layer | infra | indirect | ▶ running, **0 commits** | keep open |
| — | T2c residue decomp | gated | — | ⛔ GATED on 1d+1e | do NOT start |
| — | T2d hygiene | last | — | ⛔ run LAST (0 commits — correctly parked) | do NOT start yet |
| — | Tier-3 RSC rework | future | — | not a prompt — months-scale, post-test-net | ignore for now |

**The headline (changed — big):** **5 of 6 test lanes + Phase 1d + Phase 1e
landed.** Five god-files now decomposed (talent/messages/state/drawers/pages —
≈85k lines dissolved). Score est. **~75–77** (was ~68). Remaining score-movers
**Phase 3 + 2-finish reported & ready**, landing one-at-a-time next (Phase 3
will conflict on `eslint-suppressions.json` → resolved by composed-tree regen,
not hand-merge — proven on 1e). auth-isolation still **surfaced 3 HIGH security
holes** (🔒 below — characterized, not fixed). Known issues, disclosed not
masked: (a) one **pre-existing test RED** on the branch; (b) **the real
`npm run lint` gate has carried ≈76 errors since `d9b13b62c` (pre-everything)**
— every lane's "BASE 0 errors" claim was wrong and I repeated it before
verifying (owned); the integration math still holds (1d +0, **1e −7**), the 76
is pre-existing (≈ pages.tsx 62 + profile-shell 14), T2d-bound, and 1e already
clawed 7 back. See ⚠️ Known reds for the full corrected measurement.

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
| 8 | `3bbf1023c` | **Server-actions characterization — 112 tests, zero-source** | cherry-pick (base advanced) · zero-source · scoped-tsc 0-err/245 MB · **2026-05-19** |
| — | `9ec…05af…9d7…` | tracker doc maintenance commits (docs-only FF) | docs-only |
| 9 | `397c69dd1` | **Pitch-engine deep characterization — 74 tests, zero-source** | cherry-pick · zero-source · scoped-tsc 0-err/266 MB · regression 100/96/0-fail · **2026-05-19** |
| 10 | `d6064737b` | **Auth-isolation security characterization — 80 tests, zero-source** | cherry-pick · zero-source · scoped-tsc 0-err/374 MB · 7 SECURITY flags · **2026-05-19** |
| 11 | `f40f44499` | **Inquiry-engine characterization — 4 files, zero-source** | cherry-pick · zero-source · scoped-tsc 0 · suite 238/0-fail · **2026-05-19** |
| 12 | `3db9a2922` | **🎯 Phase 1d — drawers.tsx 30,935→625 barrel + 29 modules** | cherry-pick · conflict-free · **FULL tsc 4-relocated/0-new** · public-surface BASE==HEAD · suppressions 0-removed/0-changed/+27-drawers-only · scoped (only drawers+suppr) · **2026-05-19** |
| 13 | `0c8feda1e` | **🎯 Phase 1e — pages.tsx 12,074→16 barrel + 25 modules** | cherry-pick · conflict-free · **FULL tsc 4-relocated/0-new/0-in-page-modules** · public-surface BASE==HEAD (7) · suppressions 0-removed/+24-page-modules/1-documented-profile-shell-accounting · **npm-run-lint gate 78→71 (improved)** · scoped · **2026-05-19** |

---

## 🔨 Structural lanes (these move the score) — in flight

| Lane | Scope | Worktree | State |
|---|---|---|---|
| Phase 1d | `drawers.tsx` ~31.5k decomp — **biggest remaining god-file** | `impronta-drawers-decomp` | running · no commits yet |
| Phase 1e | `pages.tsx` ~12k decomp | `impronta-pages-decomp` | running · no commits yet |
| Phase 2-finish | ThreadShell into admin + client surfaces | `impronta-ts-adopt` | in progress · **1 commit / 3 src files** |
| Phase 3 | design-token codemod (~8.7k inline styles) | `impronta-tokens` | ✅ **REPORTED & READY** — 3 commits / 24 src files (`f275561f0`); next to land (source-touching) |

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
| pitch-engine | `impronta-tests-pitch` | ✅ **DONE + LANDED `397c69dd1`** — 74 tests, 71 pass / 0 fail / 3 skip; full pitch regression 100/96/0-fail. 2 flags: expired pitch still accrues views/emits `viewed`; convert-idempotency double-inquiry risk (see 🐞) |
| auth-isolation | `impronta-tests-auth` | ✅ **DONE + LANDED `d6064737b`** — 80 tests, 73 pass / 0 fail / 7 SECURITY skip-flags (**3 HIGH** — see 🔒). Zero-source; pre-existing branch red proven unrelated |
| server-actions | `impronta-tests-sa` | ✅ **DONE + LANDED `3bbf1023c`** — 112 tests, 110 pass / 0 fail / 2 skip (skips = `server-only` alias unresolvable under `tsx --test` = testability boundary, **not bugs**). Pinned (not fixed) several documented quirks: no consistent guard/validation ordering across the layer (validate-first vs auth-first vs db-first — all proven zero-DB on fail path), `MEMBERSHIP_TIER_VALUES` leads `""`, `*EditorHref` write-path skips UUID-validation. Not bug-flags — characterization of existing behavior. |
| field-catalog | *(no branch — never launched)* | ✖ **NEVER LAUNCHED** — Lane 2 already shipped baseline engine coverage; optional depth only |

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
| pitch-engine | **convert-idempotency double-inquiry risk** — re-conversion guard requires *both* `status==='converted'` AND `converted_inquiry_id`; a converted-but-unlinked row re-enters conversion → can create a duplicate inquiry/booking |
| pitch-engine | an already-`expired` pitch still accrues views + emits `viewed` (`loadPitchByToken` returns `ok:true` for expired-status rows) |

Engine/Lane-2 characterization flags are tracked in the plan doc §test-gap.

---

## 🔒 SECURITY findings — auth-isolation lane (characterized, NOT fixed)

The auth-isolation lane did its job: it found **real** holes. All pinned via
`it.skip` (current behavior asserted; hardened behavior documented in the skip
reason). **Product-owner decision required — these are not auto-fixed.**

| Sev | Finding |
|---|---|
| 🔴 **HIGH** | `roster-seat-limit.checkRosterSeatAvailability` **FAILS OPEN** — a missing/unreadable `agencies` row (RLS denial, bogus/cross-tenant id, deleted agency, query error → `data:null`) yields `limit:null` ⇒ **unlimited seats**. Plan-tier monetization + resource guard evaporate exactly when they should hold. |
| 🔴 **HIGH** | `custom-domain-routing.isAcceptedVercelCname` **substring bypass** — `x.includes("vercel-dns")` accepts attacker hostnames (`vercel-dns.attacker.com`, `not-vercel-dns.evil.io`). |
| 🔴 **HIGH** | `admin-scope.resolveInquiryTenantForParticipant` **pre-acceptance leak** — only deny-lists `declined`/`removed`; an `invited`/`pending`/`''`/`null` participant still resolves the inquiry's tenant. Weaker than its "accepted participant" contract. |
| 🟠 MED | `scope.getTenantPortalScopeBySlug` — service-role (RLS-bypass) slug→tenant resolution with no caller-relationship proof inside the helper; every caller must enforce downstream, nothing structural guarantees it. |
| 🟠 MED | `scope.getPublicTenantScope` blind header trust — returns `{tenantId:<x-impronta-tenant-id>}` with no UUID validation. Mitigated by `proxy.ts` neutralizing the inbound header, but the mitigation is positional/exhaustiveness-dependent, not unconditional. |
| 🟢 LOW | `scope.resolveTenantFromHost` passes empty/`null` `tenant_id` row through verbatim (DB-constraint-gated; fail-closed today). |
| 🟢 LOW | `admin-scope.assertRowBelongsToTenant` whitespace-only id not normalized (junk→false; not breached). |

**Recommendation:** the 3 HIGH items are worth a dedicated hardening pass
*after* the structural lanes settle (they're behavior-pinned now, so a fix can
be proven safe). Not score work — risk work. Flagging loudly per mandate.

---

## ⚠️ Known reds on the branch (NOT caused by any test lane)

| Test | Status |
|---|---|
| `src/lib/saas/workspace-public-url.test.ts` → *"domain lock and plan model copy stay centralized in shared helpers"* | **FAILING on bare `origin/phase-1`** (empirically reproduced at `397c69dd1` with zero test-lane files present). A structural-centralization guard that is currently violated — introduced by earlier landed work, not by the additive test lanes. Needs a separate root-cause pass; honest disclosure, not masked. |
| **`npm run lint` gate baseline ≈ 76 errors since `d9b13b62c` — agents' "BASE = 0 errors" was NEVER true** | **Honesty correction (measured 2026-05-19, 3 detached probes):** real gate = `d9b13b62c` **76 errors** (`✖ 525 problems (76 errors, 449 warnings)`) → post-1d **78** (+2 = the billing & pitch *test*-file errors; 1d's `drawers/*` = **0**) → post-1e **71** (**1e *reduced* it by 7** — pages.tsx baseline errors decomposed away, suppressions regen correct). Every lane report claimed "lint BASE 0 errors"; that was wrong (likely read exit-code / "0 *new*" — not the gate's error count), and I repeated the framing before verifying. **Integration math still holds** — each lane is before==after-or-better on the *real* gate (1d +0, 1e −7) — but the 76 is a genuine **pre-existing** condition (≈ pages.tsx 62 + profile-shell.tsx 14, predates all remediation). My earlier test-lane verify-each used scoped-tsc not `npm run lint` — **owned miss**, now corrected (full-gate probes added). Fix path: **T2d hygiene** ratchets the suppressions baseline down; 1e already clawed 7 back. |

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
