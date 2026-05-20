# Tulala/Impronta — Canonical Remediation Playbook

**Status:** ACTIVE · written 2026-05-19 · current score **54/100** · target **~74/100**
**Authority:** Single source of truth for structural remediation. **Supersedes** the overlapping builder/inquiry/marathon planning docs for anything architecture-debt-related. Do not spawn parallel remediation plans — amend this file.

---

## 0. The one non-negotiable

Chosen config: **full climb · no feature freeze · parallel agents on shared `phase-1`** — the exact pattern that created the debt. Only survivable if **Phase 0 ratchet lands before any structural work**. Hard gate. Skipping it is net-negative.

---

## 1. Hidden critical path (read this first)

`drawers.tsx:1013–1209` is a **module-level imperative stash** — `setRowOverride`, `applyRowOverrides`, `readConvNote`, `writeConvNote`, `appendLocalMessage`, `isPinned`, `togglePin`. It is **mutated by both `drawers.tsx` AND `messages.tsx`** via raw module state (not context).

Consequence: Phase 1 (decompose drawers/messages) and Phase 2 (ThreadShell) **both touch this stash**. If two agents touch it concurrently → silent state-corruption bugs that tests won't catch.

**Therefore Phase 0.5 exists:** extract the stash into one explicit, typed module (`lib/admin-shell/conversation-stash.ts` or a real context) **before** any messaging-adjacent work. Single owner. This is the schedule choke point — everything messaging waits on it.

---

## 2. Multi-agent matrix (the efficiency answer)

| Phase | Parallel? | Max agents | Why / choke point |
|---|---|---|---|
| **0** Ratchet + safety | ✅ Yes | **3** | Disjoint trees: silent-saves (`talent-drawers.tsx`), tenant-guard (`lib/supabase`), ratchet (eslint config). Ratchet bundle is internally single-owner (all touch eslint config). |
| **0.5** Stash extraction | ❌ **No** | **1** | Single shared module mutated by 2 god-files. Serialization choke point. Blocks Phase 1-messages + all of Phase 2. |
| **1** God-file decomposition | ⚠️ Partial | **2** | Different *files* can parallelize **only if they share no machinery**. `talent.tsx` ∥ `state.tsx` = safe (disjoint). `drawers.tsx` ✗∥ `state.tsx` (DrawerId union + `useAdminShell` live in state.tsx). `drawers.tsx` ✗∥ `messages.tsx` until 0.5 done. **One owner per file, always.** |
| **2** Shared `<ThreadShell>` | ⚠️ Partial | **1–2** | Primitive build + talent adoption ∥ other workstreams. Admin/client adoption **serializes after** Phase 1 `messages.tsx` extraction + 0.5. |
| **3** Design-token codemod | ✅ Yes | **1** | Separate agent, separate concern. **But** must skip any file currently under Phase 1 extraction (codemod + extraction on same file = collision). Sequence by file. |
| **4** Shared `<FieldEditor>` | ✅ Yes | **1** | `/components/fields/` + `live-category-fields-editor.tsx`. Parallel-safe **except** that file is in the dirty tree now (see §3). |
| **X** Debris cleanup | ✅ Yes | **1** | Parallel-safe. Branch-pruning = single-owner git op (never parallel). |

**Recommended concurrency:** Phase 0 = 3 agents. Phase 0.5 = 1 (everything else waits or works non-messaging). Phase 1+ steady state = **3 agents max**: one on god-files (serial within), one on Phase 3 codemod, one on Phase 4/debris. **Never 2 agents on one file. Never parallelize config/migration/git-ref edits.**

**Phases where multi-agent is NOT recommended:** 0.5 (single shared module), within any single god-file in Phase 1, ThreadShell admin/client adoption, anything touching `eslint.config.mjs` / `eslint-suppressions.json` / `package.json` / `tsconfig.json` / `supabase/migrations/` / git refs.

---

## 3. Preconditions & things to consider (binding)

- **Dirty tree right now:** `drawers.tsx`, `primitives.tsx`, `live-category-fields-editor.tsx` are uncommitted (another agent is mid-edit). **Phase 1-drawers and Phase 4 cannot start until that work is committed and landed.** Verify clean before claiming those files.
- **Local is 4 commits behind `origin/phase-1`.** Every task starts with a fresh worktree off `origin/phase-1` and `git pull --rebase` — never the dirty shared checkout.
- **QA caveat (from CLAUDE.md):** raw `*.vercel.app` preview URLs return 404 (middleware host-gate). QA only on **localhost** or a promoted/aliased registered host. Never "tested on the preview URL."
- **Dev-server wedge (recurring):** if localhost 404s every route, `rm -rf web/.next` and restart **first**, before debugging env/middleware.
- **Migration drift:** remediation is code-only — **no migrations expected.** If any task needs one, `npm run db:push` is part of that commit (CLAUDE.md protocol); `deploy:promote` blocks otherwise. tenant-guard is app-layer only — no migration.
- **No feature/affordance removal during cleanup** (binding preference). Decomposition is behavior-identical. Decluttering ≠ deleting function.
- **QA bar = working demonstrated UX on localhost**, not a tsc-clean commit. Each phase ends with a reproducible proof.
- **Test gap:** core inquiry/money paths are thinly tested. Any refactor touching message/inquiry data flow (Phase 2) adds **characterization tests first** (snapshot current behavior, then refactor under green).
- **Don't over-unify ThreadShell:** ~60% shareable, ~40% irreducibly role-specific. Three role prop-interfaces backing one shell — NOT one god-component (that's just a new god-file).

---

## 4. Per-phase playbook

### Phase 0 — Ratchet + safety (HARD GATE) — 3 agents, ~3–5 days

| Task | Files | Done = |
|---|---|---|
| Silent saves | `talent-drawers.tsx` ~L2084/2642/4689/4871/5591 | each path persists OR shows explicit "not yet" — never a silent no-op |
| Tenant-scope guard | `lib/supabase/*`, lint rule in `eslint.config.mjs` | `tenantScopedQuery()` exists; lint fires on a deliberately-unscoped query; 541 sites grandfathered in `eslint-suppressions.json` |
| Lint ratchet | `eslint.config.mjs`, `eslint-suppressions.json` | 3 rules fire on bad samples AND `npm run lint` still green on existing tree |
| Ownership protocol | this doc §5 | exists |

### Phase 0.5 — Conversation-stash extraction — 1 agent, ~0.5–1 day — **CHOKE POINT**

1. Read `drawers.tsx:1013–1209`. Enumerate every stash function and every call site in `drawers.tsx` AND `messages.tsx` (grep both).
2. Create `lib/admin-shell/conversation-stash.ts`: same API, but explicit module with typed exports (or a React context if render-reactivity is needed — check whether consumers re-render on stash change).
3. Re-point all call sites in both god-files to the new module. **No behavior change.**
4. **DoD:** pin/unpin, conversation notes, optimistic message append, offer overrides all still work on localhost across admin + client + talent threads. tsc + lint green.
5. Until merged, **no Phase 1-messages and no Phase 2 messaging work may start.**

### Phase 0C — Production-hardening of dev controls (TRACKED, not yet scheduled)

The Phase 0 prototype-harness gate (commit `05e03afd8`) hides the dev control
bar + floating ⚙ on real bridged tenants, but `?dev=1` remains a **discoverable
query-param escape hatch**: any user who appends it on a real LIVE tenant still
gets the Surface/Plan/Role/Entity/Page switcher. Acceptable as an interim
engineer/QA hatch; NOT acceptable long-term.

Scope (do NOT fold into Phase 0/0A/0B): require a real gate before dev controls
render on a bridged tenant — local/dev env (`process.env.NODE_ENV !==
"production"`) OR explicit super-admin / test-tenant permission. `?dev=1` alone
must not unlock prototype controls for normal users on production tenants.
Files: `admin-shell-client.tsx` (`devControlsPermitted`), `pages.tsx`
(`devPermitted` / the `?dev=1` branch). Single owner; isolated worktree; scoped
commit; gate + zero-regression proof; no push/merge.

### Phase 1 — God-file decomposition — serial within file, ≤2 agents across files — frontend **+12**

Order is deliberate (easiest → hardest, lowest coupling first):

**1a. `talent.tsx` (15,548) — ~4–6h — LOWEST risk, do first.**
Page-router: `TalentRouter` switch at `talent.tsx:636` → 9 self-contained pages. Shared `PageHeader` at `:714`.
Steps: extract each `switch` case → `talent/pages/<Name>Page.tsx`; move shared header/constants → `talent/talent-shared.ts`; `TalentRouter` becomes a thin map. No closure sharing — mechanical.

**1b. `state.tsx` (9,549) — ~2–3h — mechanical (but ✗ parallel with drawers).**
Mostly types + mocks (`RICH_INQUIRIES`, `MY_TALENT_PROFILE`, `TAXONOMY`) + the `useAdminShell` context + the `DrawerId` union (`:472–630`).
Steps: split into `state/fixtures.ts`, `state/types.ts`, `state/context.tsx`, `state/drawer-ids.ts`. **Because `DrawerId` + `useAdminShell` live here and `drawers.tsx` consumes them, this must NOT run while `drawers.tsx` is being extracted.**

**1c. `messages.tsx` (16,134) — ~1 day — needs 0.5 done first.**
Three POV shells (`AdminOperationsShell`/`TalentJobShell`/`ClientProjectShell`) dispatched by `pov`; stateless shared helpers (`stageStyle`, `ageLabel`, `dateGroupKey`, `renderWithDateGroups`) at top.
Steps: each POV shell → own file; helpers → `messages/messages-shared.ts`. Low closure risk *after* 0.5 removes the stash entanglement.

**1d. `drawers.tsx` (31,420) — phased, last — HIGHEST risk.**
Dispatch is clean: `DrawerRoot` `:405–412` → `DrawerSwitch` `:415–554` (51 cases). Hazard = shared internals: `SHARED_FIELD_INPUT_STYLE :4316`, `LANGUAGE_PRESETS :4728`, `PROFILE_SECTIONS :4739`, plus the (now-extracted) stash.
Steps:
 - First: lift shared constants → `drawers/drawer-shared.ts`, thread as imports.
 - Then: extract the ~38 *lightweight* drawers one-per-file behind the existing switch (~10 min each, fully mechanical, zero behavior change).
 - **Last and alone:** `TalentProfileShellDrawer` (`~:5300–8846`, ~3.5K LOC, its own `profileReducer` at `:5325` + 10+ history/undo refs). Single owner, ~1–2 days, its own merge. Do not interleave with any other drawer work.
**DoD for 1a–1d:** every page/drawer still opens, every save still persists, on localhost — proven before merge. Mechanical extraction → rollback is a clean revert.

### Phase 2 — Shared `<ThreadShell>` — strangler — frontend **+8** — ~3–4 days

Primitive lives in **new** `src/components/shared/` (NOT `primitives.tsx` — it's hard-siloed, 56 internal-only imports, depends on `useAdminShell`).
Prop contract: `{ inquiries, activeId, messages?, details?, role: 'admin'|'client'|'talent', can{Compose,React,Reply,EditMessage}, actions:{...}, rightRailSlot?, tabsSlot?, secondaryThreadSlot? }`.
Strangler order (smallest → riskiest, prove each before next):
1. **Talent inbox** (`talent/inbox/InboxShell.tsx`, 377 LOC, list-only, no composer) — adopt first, lowest risk.
2. **Client** (`ClientMessagesShell.tsx` + `DetailsTab`/`OfferTab` via `tabsSlot`).
3. **Admin** (`messages.tsx` POV shells; admin-only: 8 inline card types + secondary threads + coordinator workflow via `secondaryThreadSlot`/`rightRailSlot`).
Old shells stay live until each adoption is QA-proven. Admin/client adoption serializes after Phase 1c + 0.5.

### Phase 3 — Design-token codemod — frontend **+10** — 1 agent, continuous

`token-presets.css` exists (5,158 lines, 1,102 tokens). 8,798 inline `style={{}}` in admin shell, 20 token refs.
Steps: codemod hot files (post-extraction, smaller now) mapping inline color/spacing literals → `var(--token-*)`. **Skip any file under active Phase 1 extraction** — sequence by file, take files after their owner releases them. Phase 0 ratchet stops new inline styles automatically; this pays down the existing tail.

### Phase 4 — Shared `<FieldEditor>` — frontend **+5** — 1 agent, ~1 day

Scope is **smaller than the audit implied** (honest correction): `inquiry-talent-editor.tsx` is roster ops, *not* field editing — not a duplicate. Real work: extract a per-field `<FieldEditor>` (kinds: text/textarea/number/date/boolean/select/multiselect/chips; **onBlur** save; status pill; metadata validation hints) into `components/fields/FieldEditor.tsx`; `live-category-fields-editor.tsx` composes it per field. Save path stays `setTalentFieldValue`. Blocked until that file leaves the dirty tree.

### Phase X — Debris — process **+4** — 1 agent, anytime

Move `app/prototypes/*` out of routed `app/`; delete `web/.env.local.prod_backup`; prune `worktree-agent-*`/`claude-*` branches (single-owner git op); this doc supersedes overlapping plan docs — delete them only **after** this is ratified.

---

## 5. Parallel-safety protocol (binding)

1. **Isolated worktree per workstream**, off fresh `origin/phase-1`. Never the dirty shared checkout.
2. **One owner per god-file/shared-module during its window.** Claim via commit-message marker + this doc's status line; release on merge.
3. **Disjoint trees only** for concurrent agents. Cross-file parallelism in Phase 1 allowed *only* for the proven-disjoint pair (`talent.tsx` ∥ `state.tsx` is NOT allowed — they couple via DrawerId; only truly independent files).
4. **Single-owner by nature:** `eslint.config.mjs`, `eslint-suppressions.json`, `package.json`, `tsconfig.json`, `supabase/migrations/`, git refs, the conversation stash.
5. **Gate before every commit:** `cd web && npx tsc --noEmit && npm run lint`. Never force-push `phase-1`. Scoped commits only.
6. **Per-task definition of done:** a reproducible localhost QA proof, attached to the merge — not a tsc pass.

---

## 6. Score trajectory

| | Now | P0 | P0.5 | +P1 | +P2 | +P3/4 | +X |
|---|---|---|---|---|---|---|---|
| Overall | 54 | 58 | 59 | 65 | 69 | 72 | **~74** |

The last ~3 points hold only if the §5 protocol is enforced *while* parallel agents keep shipping features. Without it, the climb erodes — same failure mode as before.
