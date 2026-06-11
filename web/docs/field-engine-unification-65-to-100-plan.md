# Field-Engine Unification — 65 → 100 Execution Plan

> **Audience:** an autonomous orchestrator ("engineering manager") agent that dispatches developer sub-agents to drive the Tulala/Impronta profile-field engine from **one-source-of-truth score ≈ 65/100 to 100/100**.
> **Authored:** 2026-06-11, from the field-engine final QA + one-database audit (see `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_field_engine_unification.md`).
> **Status of the codebase when this plan was written:** Height-field consolidation already shipped (PR #311, `main` `d28da9d9c`). Everything below is still TODO.

---

## 0. Mission

Make **`public.profile_field_definitions`** (+ its value store `talent_profile_field_values`) the **single authoritative description and storage** for every talent profile field. "Done / 100" means:

1. The legacy **System A** registry (`public.field_definitions`) and its value store (`public.field_values`) are **gone**.
2. The **bidirectional mirror** (`web/src/lib/fields/legacy-mirror.ts`) is **gone**.
3. Every field's value has **exactly one authoritative home**, and the registry **describes** that home (`storage_mode` = `field_values` | `dedicated`). Legitimate dedicated carve-outs (dob, names, languages, nationality, home_country, media, availability, contact) are **kept and documented as intentional**, not crammed into one table.
4. **Drift is structurally impossible** — CI + DB guards fail the build if a second field system, an unregistered column write, or a `field_values` write reappears.

This is a **multi-PR program**. Ship one focused PR per task. Never batch irreversible steps.

---

## 1. Ground truth (the current two-database reality)

| System | Registry | Value store | Authoritative for |
|---|---|---|---|
| **B (target)** | `profile_field_definitions` (309 rows / 261 active) | `talent_profile_field_values` (2,911 rows / 120 talents) | Catalog editor, admin Profile-Fields hub, registration wizard |
| **A (retire)** | `field_definitions` (42 rows) | `field_values` (1,186 rows / 70 talents / 20 fields) | Directory filters, public-profile sidebar visibility/order, talent dashboard, nav groups, AI search doc, directory cards |

**Bridge:** `legacy-mirror.ts` — `mirrorWriteToLegacy` (B→A, 17 keys) + `mirrorWriteToCanonical` (A→B). The shell editor writes **A-first** then mirrors to B; the catalog engine writes B. They drift.

**Confirmed live bug (flagship Phase-1 item):** the directory **height filter returns ~0 for every range**. `apply-directory-field-facet-filters.ts:140` + `fetch-directory-page.ts:589/671` filter the **`talent_profiles.height_cm` column** (populated for **24 of 89** public+approved talents) while **65 of 89** have a height in System A `field_values`. The gender filter has the same pattern (`.in("gender", …)` on the column, 54/89). Non-height `ff` facets read `field_values` and work.

**height = three stores** (`talent_profiles.height_cm` col 27/120 · `field_values` A 70/120 · `talent_profile_field_values` B 51/120) kept by two mirror helpers; **20 approved talents drift** (height in A, not B).

**Data-quality nits in System A:** junk row `new_feild` ("Extra", boolean, `directory_filter_visible=true`); duplicate keys `experience_level` + `long_bio` (global + tenant rows).

**Barely-used layer (not a blocker, do not over-invest):** `workspace_profile_field_settings` = 2 rows, `workspace_field_group_settings` = 0.

---

## 2. Hard operating rules (every agent obeys — violating these breaks prod)

1. **Deploy contract (from `CLAUDE.md`):** `main` is canonical and auto-deploys to Vercel prod on push. Branch off the **latest** `main` (`git fetch origin && git switch -c <type>/<topic> origin/main`). PR → merge → **the manager (not parallel devs) re-aliases all four domains** (`improntamodels.com`, `app.tulala.digital`, `tulala.digital`, `impronta.tulala.digital`) via `vercel alias set <deploy-url> <domain> --scope oran-tenes-projects`, then runs `cd web && npm run deploy:smoke`. Smoke must be green (0 migration drift) before the task is "done".
2. **🔴 PROD SUPABASE THROTTLE LESSON (2026-06-10):** Do **NOT** fan out heavy concurrent DB work against prod Supabase (`pluhdapdnuiulvxmyspd`, Small compute). localhost dev points at prod. **Max 2 DB-heavy agents at once; serialize migrations/backfills/parity SQL.** Prefer a Supabase **branch DB** for heavy parity work, or run sequentially. Code-only agents (no DB) may parallelize freely.
3. **Migrations:** one migration per agent; unique timestamp via `date -u +%Y%m%d%H%M%S`. On a timestamp collision use the **park-restore** pattern (`mv` one to `.tmp-migrations-park/`, push, restore; document in commit). Apply via `cd web && node --env-file=.env.local --env-file=.env.vercel.local scripts/apply-migration.mjs ../supabase/migrations/<f>.sql` (registers it in remote `schema_migrations` so the drift gate passes; `db:push` fails on history drift). **Apply the migration BEFORE merging the PR that depends on it.**
4. **Gate before every commit:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`. Add/extend a unit test for any new pure logic and wire it into the `ci` script.
5. **Every risky read-repoint or data write ships with a LIVE PARITY PROOF** — a before/after count or an A-vs-B agreement check on real prod data, pasted into the PR. No parity proof → not merge-able.
6. **Never force-push `main`. Never `DROP` a table/column without an explicit human go-ahead** (see the 🚩🚩 gates). Deprecate-then-drop-a-release-later; keep changes reversible until the soak passes.
7. **Lint ratchets are real:** files cap at 800 lines; new `eslint-disable` for `react-hooks/exhaustive-deps` is frozen (use refs / restructure). `check:field-catalog-frozen` guards the static catalog — don't unfreeze it.

---

## 3. Agent-assignment philosophy

| Tier | Model · effort | Use for |
|---|---|---|
| **Architect** | **Opus · high/max** | Design decisions, parity-critical read-repoints, irreversible drops, the parity-harness, CI/DB guards, adversarial verification of other agents' work. |
| **Senior dev** | **Opus · medium** | Correctness-sensitive but bounded: the directory-filter fix, validation flip, trigger design, stop-dual-write. |
| **Dev** | **Sonnet · medium** | Well-scoped implementation once the pattern exists: repoint a single reader, write a backfill, mechanical column drop. |
| **Junior** | **Sonnet · low** | Trivial/mechanical: delete a junk row, dedupe keys, docs, registry annotations. |
| **Reviewer** | **Opus · medium-high** | Independent adversarial verify of each risky PR (separate agent from the implementer — never self-review a parity claim). |

The manager runs **Opus · high** itself.

---

## 4. The work breakdown (phased; score deltas are weighted, not summed-per-lane)

### PHASE 0 — Foundation (manager + 1 architect) · ~0.5 day

| ID | Task | Agent | DB? | Depends | Done when |
|---|---|---|---|---|---|
| **T0.1** | Read `CLAUDE.md`, the three memory files, this plan. Build the live task list. | Manager (Opus·high) | r/o | — | Task list mirrors §4 with deps wired. |
| **T0.2** | Build a reusable **parity harness**: given (surface, talent set) it reports System-A-read vs System-B-read agreement + diffs. This is the proof engine for Phases 1–3. | Architect (Opus·high) | r/o (serialize) | T0.1 | Harness runs on prod read-only, outputs an agreement %. |

### PHASE 1 — Quick wins / stop the bleeding (65 → ~73) · low risk · days

| ID | Task | Agent | DB? | Risk / 🚩 | Done when |
|---|---|---|---|---|---|
| **T1.1** | **Fix the live directory height + gender filter.** Recommended: backfill `talent_profiles.height_cm` + `.gender` from the authoritative value store, then add a DB **trigger** (or extend the existing `refresh-discover-index` cron) so the indexed column can never drift again. (Alt: repoint the filter to read `field_values`/`tpfv` like the other `ff` facets.) Keep the fast indexed path. | Senior (Opus·med) | **write, serialize** | med · 🚩 changes who appears in search → parity proof: before/after result counts for 3 height ranges + 2 genders | Height range 175–185 returns the real cohort live; `deploy:smoke` green. |
| **T1.2a** | **Backfill the 20 drifted height rows** + audit all 17 bridged keys for the same drift; report per-key drift counts. | Dev (Sonnet·med) | **write, serialize** | low | All 17 keys at 0 drift (or documented exceptions). |
| **T1.2b** | Add a **reconcile trigger / nightly job** so the three height stores + the 17 bridged keys can't silently diverge again. | Senior (Opus·med) | write, serialize | med | A deliberate A-only write reconciles to B within the job window (proven). |
| **T1.3** | **Data hygiene:** delete junk `field_definitions.new_feild`; dedupe the System-A duplicate keys (`experience_level`, `long_bio`). | Junior (Sonnet·low) | write, tiny | low | `new_feild` gone from the live directory facet list; 0 duplicate keys. |
| **T1.4** | **Flip editor `validation:db`** (env `FIELD_ENGINE_CLIENT_SOURCE=validation:db`) after a parity check that DB validation == static validation for every active field. | Senior (Opus·med) | r/o | med | Parity 0 mismatches; a known-invalid value is still rejected live. |

*Phase-1 parallelism:* T1.3 + T1.4 are independent of T1.1/T1.2 (different surfaces). DB writes still serialize — run T1.1 → T1.2a → T1.2b sequentially; T1.3 can slot between. Recommend the orchestrator run Phase 1 as a **Workflow**: parallel where safe, each PR verified by a Reviewer before the manager merges.

### PHASE 2 — One value store (73 → ~85) · medium risk · 1–2 weeks · the core

Make `talent_profile_field_values` the **sole** value store. Repoint each System-A reader **one surface at a time, behind a flag, with a per-surface parity proof**, then stop the mirror.

| ID | Task | Agent | DB? | 🚩 | Done when |
|---|---|---|---|---|---|
| **T2.0** | Design the **read-repoint pattern + flag scaffold** (per-surface `FIELD_ENGINE_READ_SOURCE` style flag, default A, flip per surface). | Architect (Opus·high) | r/o | — | Pattern doc + scaffold merged; one surface proves the flag. |
| **T2.1** | Directory facet filters read **B** (`talent_profile_field_values` + `profile_field_definitions`). | Architect (Opus·high) | r/o + light | 🚩 changes results → parity harness ≥99% agreement, diffs explained | Flag on; directory result sets match A within explained diffs. |
| **T2.2** | Public-profile sidebar **visibility + order** read B. | Architect (Opus·high) | r/o | 🚩 public surface | Sidebar identical pre/post on 10 sampled profiles. |
| **T2.3** | Talent dashboard + nav groups read B. | Dev (Sonnet·med) | r/o | low | Dashboard parity on 5 talents. |
| **T2.4** | Directory cards read B. | Dev (Sonnet·med) | r/o | med | Card attributes parity on 20 cards. |
| **T2.5** | AI search-doc builder reads B. | Dev (Sonnet·med) | r/o | low | Rebuilt doc diff is semantically empty. |
| **T2.6** | **Stop the B→A mirror writes** once every reader is off A. Delete the A-write half of `legacy-mirror.ts`; `field_values` becomes write-nothing. | Senior (Opus·high) | write | 🚩🚩 **HUMAN GATE** | Manager pauses for go-ahead; after approval, no new `field_values` rows appear. |

*Phase-2 shape:* a **pipeline** — each surface: implement (dev) → **adversarial parity verify (Reviewer, separate Opus agent)** → manager flips the flag in prod + smoke. T2.1/T2.2 are parity-critical (Opus). Surfaces are independent → can pipeline concurrently, but **DB-read parity runs serialize** (throttle rule).

### PHASE 3 — One registry; retire System A (85 → ~93) · medium-high risk · irreversible

| ID | Task | Agent | DB? | 🚩 | Done when |
|---|---|---|---|---|---|
| **T3.1** | Move directory **filter config + `filter_options` vocab** off `field_definitions` onto `profile_field_definitions` (visibility gating is already partly unified via `public-surface-visibility.ts` — finish it). | Architect (Opus·high) | write, serialize | 🚩 | Facets render from B vocab; gender options sourced from B. |
| **T3.2** | Repoint the remaining `field_definitions` readers (grep `from("field_definitions")` — ~36 refs) onto B; delete the A-read half of the mirror + dead helpers. | Architect (Opus·high) | r/o + code | 🚩 | 0 non-test refs to `field_definitions` / `field_values`. |
| **T3.3** | **DROP `field_definitions` + `field_values`.** | Architect (Opus·max) | **DDL** | 🚩🚩 **IRREVERSIBLE — HUMAN GATE** | Manager STOPS, presents evidence, waits for explicit "drop it". |

### PHASE 4 — Collapse the migrated dedicated columns (93 → ~98) · medium risk

Run the deferred **P3 Stage-5 column drops** for the *already-migrated* families, **one at a time after a soak**. Per family: (a) stop the dedicated-column dual-write in both writers [Sonnet·med], (b) a release later DROP the column [Opus·med, 🚩🚩 human-gate].

| ID | Family | Agent | 🚩 |
|---|---|---|---|
| **T4.0** | **Document** the intended dedicated carve-out set in the registry (annotate dob/names/languages/nationality/home_country/media/availability/contact as `dedicated_by_design`). | Junior (Sonnet·low) | — |
| **T4.1** | Tier-D roster fields (internal_notes/emergency_contact/field_locks) | Dev → Architect | 🚩🚩 drop |
| **T4.2** | Tier-A 10 scalars | Dev → Architect | 🚩🚩 drop |
| **T4.3** | Tier-B 12 blobs | Dev → Architect | 🚩🚩 drop |
| **T4.4** | Tier-C pronouns/pronouns_custom + gender (after vocab cleanup) | Architect (Opus·high) | 🚩🚩 drop |

> DOB is **never** migrated via column→value backfill (legacy mirror owns the DOB value rows; it's the source). Keep dob dedicated.

### PHASE 5 — Lock it; make drift impossible (98 → 100) · low risk

| ID | Task | Agent | Done when |
|---|---|---|---|
| **T5.1** | **CI guard**: fail `ci` if any field config is added outside `profile_field_definitions`, or a new `field_values` / unregistered-column write appears in `src`. | Architect (Opus·high) | Guard catches a planted violation. |
| **T5.2** | **DB constraint/trigger** forbidding System-A-style writes (or drop the tables makes this moot — coordinate with T3.3). | Architect (Opus·high) | A forbidden write is rejected at the DB. |
| **T5.3** | Reconcile resolver `has_value` + admin Profile-Fields counts to reality (no A/B disagreement). | Dev (Sonnet·med) | Hub counts == live value presence. |

---

## 5. Orchestration model (how the manager runs this autonomously)

1. **Maintain a live task list** (TaskCreate/TaskUpdate) mirroring §4 with `blockedBy` deps. Work lowest-ID-unblocked first.
2. **Dispatch** each task to a sub-agent at the assigned model+effort. Independent **code-only** tasks → parallel (single message, multiple Agent calls, or a `Workflow`). **DB-touching** tasks → **serialize (max 2 concurrent, prefer 1)**.
3. **Pipeline pattern** for Phases 2 & 4: `implement (dev) → adversarial verify (separate Opus reviewer) → manager flips flag/merges`. Never let the implementer sign off its own parity claim.
4. **Per task lifecycle:** branch off latest `main` → implement → apply migration (if any) BEFORE merge → `tsc && lint && test` → open PR with the **parity proof** → Reviewer agent approves → **manager merges, re-aliases 4 domains, runs `deploy:smoke`** → mark done. Only the manager merges/deploys (serialize deploys).
5. **🚩🚩 HUMAN GATES** — STOP and ask the human before: T2.6 (stop the mirror), T3.3 (drop System A), every T4.x column DROP, any other irreversible DDL. Present the evidence, wait for explicit approval.
6. **Throttle discipline:** before spawning DB-heavy agents, check you're not exceeding 2 concurrent. If a phase needs heavy parity scans, use a Supabase branch DB or sequence them.
7. **Report** after each phase: what merged, parity proofs, score delta, what's blocked on a human gate.
8. **Recover** from a bad deploy with the rollback recipe in `CLAUDE.md` / the throttle incident memory (promote last-good + re-alias all four).

## 6. Definition of done (100/100)

`field_definitions` + `field_values` dropped · mirror deleted · every field has one registry-described home · dedicated carve-outs documented as intentional · CI + DB guards make a second field system impossible · directory/public/AI all read System B · all parity proofs archived in the PRs.

## 7. Key files (start here)

- Resolver: `web/src/lib/field-engine/resolve-talent-fields.ts`
- Mirror: `web/src/lib/fields/legacy-mirror.ts`
- Directory filters: `web/src/lib/directory/apply-directory-field-facet-filters.ts`, `fetch-directory-page.ts`, `directory-filter-catalog.ts`
- Public profile: `web/src/app/t/[profileCode]/page.tsx`, `web/src/lib/public-profile-field-visibility.ts`, `-order.ts`
- Shell value bridges: `web/src/lib/talent/profile-shell-dyn-field-values.ts`, `web/src/lib/server-actions/admin-talent-profile-sections.ts`
- Section mapping (shared): `web/src/lib/profile-editor/section-field-mapping.ts`
- Client source flag: `web/src/lib/field-engine/client-field-source-types.ts`
- Memory: `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_field_engine_unification.md` (+ `incident_supabase_compute_throttle_2026-06-10.md`, `MEMORY.md`)
