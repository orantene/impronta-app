# Talent Catalog Engine — Status Note (2026-05-18)

Short status record. Companion to `talent-engine-execution-plan-2026-05-18.md`
(the canonical phase plan) and `talent-profile-engine-master-audit-2026-05-18.md`.

## Phase 2 & 4 — DONE on branches, landing held (2026-05-19)

Both built serial-only (NO subagents) in isolated worktrees off the
phase-1 tip, node_modules symlinked (the false-pass guard), valid gate
(tsc 0; lint = exact 78-error baseline, zero new; only intended files).

- **Phase 2 finish** — `engine-phase2-finish` commit `f1d9327df`. Real
  `WorkspaceFieldSettingsDrawer` over the live engine; mock + 198-line
  dead `WorkspaceFieldSettingRow` removed; 5 unbacked toggles dropped per
  locked scope + no-fake-UI.
- **Phase 4** — `engine-phase4-finish` commit `36ea80397` (off phase-1
  tip `ffb90cd8b`). Read-only transparency layer in
  `LiveCategoryFieldsPanel`: View-as (public/admin/talent) via the SHARED
  engine (`effectiveFieldVisibility`/`canViewerSee`, reused — no new
  resolver/visibility), per-row effective visibility (dim + 🚫 when not
  visible), source/provenance, required-origin, platform-vs-workspace
  override badge, value-present. Resolver reused minimally + additively
  (`getFieldsForTalent`: ResolvedField optional `tenant_override?`/
  `has_value?`; tenant_override from existing override map, has_value
  from one existence-only query — zero impact on existing consumers).

Both are clean `+1` fast-forwards over the phase-1 tip in
non-overlapping regions. **NOT landed**: main `drawers.tsx` /
`admin-taxonomy.ts` carry concurrent other-agent uncommitted work;
forcing a merge would require committing their mixed work / hunk surgery
(forbidden). They land conflict-free the moment that work is committed
(plan steps 7–8), or on explicit go.

## Phase 3 — CLOSED: "correctness shipped; structural extraction deferred"

Phase 3's actual public-profile safety/correctness fix **shipped in Gap 2**
(commit `22c2291c2`, live in production). On `/t/[profileCode]` the public
field set now:

- respects tenant privacy / `workspace_profile_field_settings` overrides
- blocks admin-only and hidden fields
- blocks workspace-disabled fields (`enabled_override = false`)
- blocks stale orphan type-specific fields (talent no longer has the
  causing category/type)
- preserves universal/global fields
- mutates no data (read-side filter only; fail-safe to prior behaviour if
  governance reads are unavailable)

This satisfies Phase 3's safety/correctness intent. Phase 3 is considered
**functionally complete**; the two remaining items are deliberately
deferred (below), not forgotten.

## Deferred / retained (intentional decisions)

- **`resolvePublicFields` extraction — DEFERRED.** Behaviour-neutral
  refactor. A clean extraction would relocate the `PublicFieldValueRow` /
  `PublicFieldDefinitionEmbed` type cluster that is shared with the
  `page.tsx` render layer on a **live public path** — real regression
  surface, zero functional gain. Revisit only when the repo is clean and
  the type cluster can be moved safely.
- **Legacy sidebar gate (`public-profile-field-visibility.ts`) — RETAINED
  pending a product decision.** It gates 6 sidebar sections via the legacy
  `field_definitions` table: `fit_labels`, `skills`, `languages`,
  `industries`, `event_types`, `tags`. Canonical-catalog check: only
  `skills` and `languages` have clean `profile_field_definitions`
  equivalents; **`fit_labels`, `industries`, `tags`, `event_types` have no
  canonical equivalent.** Retiring the legacy gate now would change public
  sidebar behaviour unvalidated. Keep legacy behaviour until a canonical
  sidebar model is intentionally designed (a Gap-2-style product decision).

## Audits

- **`share/talent/[slug]/page.tsx` — audited, NO change needed.** It does
  not use the dynamic-field path, `fetchPublicFieldValues`, the legacy
  visibility gate, or `talent_profile_field_values` / `field_values`. Not
  affected by Phase 3.

## Process learning (binding for this engine track)

- **Multi-agent worktree approach FAILED — do not use subagents for this
  engine track.** Wave 1 attempt: `isolation: "worktree"` did not isolate
  in this heavily multi-agent repo. One agent landed on the wrong branch
  lineage (Messages, not the engine line) and correctly no-op'd; the other
  agent's changes were not isolated and entangled with concurrent
  other-agent uncommitted work in the shared tree. Net integrated
  progress: zero; risk added: high. The **serial path** (one operator,
  path-scoped commits, `tsc + lint + route-probe` gate, surgically
  avoiding dirty/other-agent files) is the proven approach that delivered
  the entire shipped engine milestone (P0 → P4b). Stay serial.

## Current blocker

- `drawers.tsx` (+ `admin-taxonomy.ts`, `live-category-fields-editor.tsx`,
  `primitives.tsx`, `site_header/*`) are **dirty with concurrent
  other-agent uncommitted work**. Phase 2 finish
  (`WorkspaceFieldSettingsDrawer`) and Phase 4 transparency layer both
  live in `drawers.tsx` and **cannot be done cleanly until that
  quiesces**. No clean, approved, non-`drawers.tsx`, non-dirty engine
  phase is actionable right now (Phase 5/6 are gated / not approved and
  Phase 5 also depends on the dirty resolver).

## Phase 2 — FINISHED (work), landing gated (2026-05-19)

`WorkspaceFieldSettingsDrawer` made real — commit `f1d9327df` on branch
`engine-phase2-finish` (base `c46c585c9` = phase-1 tip; clean +1
fast-forward, non-overlapping ~19551 region). Real engine
(`getWorkspaceFieldCatalog`/`setWorkspaceFieldCatalog`), search + group
sections + expandable rows, optimistic+reconcile, plan-tier gated,
reset/reset-all, Field-Privacy cross-link. Per the locked Phase-2 scope +
no-fake-UI rule, the mock's 5 unbacked toggles
(registration/editor/directory/talent-editable/review) were dropped (no
backend); only enabled/required/custom_label/custom_helper persist.
Removed dead 198-line `WorkspaceFieldSettingRow`. Gate (VALID): tsc 0;
lint 78 = exact baseline, zero new. **NOT landed on shared `phase-1`** —
blocked by concurrent other-agent uncommitted `drawers.tsx` work; forcing
it would require committing their mixed work / hunk surgery (both
forbidden). Lands clean the moment they commit, or on explicit go.

### BINDING lesson — git worktree gate is a FALSE PASS without node_modules

`git worktree add` does NOT copy `node_modules` (gitignored). Running
`npx tsc`/`npm run lint` in a fresh worktree silently fails (module not
found) and `grep -c "error TS"` returns 0 → a fake "clean" gate. ALWAYS
`ln -s <main>/web/node_modules <worktree>/web/node_modules` (and root)
before trusting tsc/lint in a worktree. Caught here before it caused a
false "verified" claim.

## Next when unblocked

When the other agents commit/clear `drawers.tsx` + `admin-taxonomy.ts`,
resume serially: redo Phase 4 (Agency Fields transparency layer) and
Phase 2 finish (`WorkspaceFieldSettingsDrawer` → real) cleanly, path-scoped,
gated. Phase 5 (convergence, data movement, db-gated) and Phase 6+ remain
explicitly gated on a separate scoped plan + approval.

## ⚠ OPEN INCIDENT — phase-1 does not compile (PAUSED 2026-05-19, resume after SaaS plan)

User decision: **wait for the SaaS improvement plan (concurrent other-agent
work) to finish, then return to this.** Do NOT act on it in the interim
(no fix, no checkpoint of other-agent work, no revert, no push).

**State (verified):**
- **Phase 2 LANDED** on `phase-1` = commit `588d96487` (clean cherry-pick
  of `f1d9327df`; real `WorkspaceFieldSettingsDrawer`; itself tsc-clean).
- **`phase-1` HEAD fails `tsc` — 4 errors**, ALL in
  `drawers.tsx` (2228, 2323, 2445, 2446): `Property 'has_value' /
  'tenant_override' does not exist on type 'ResolvedField'`.
- **Root cause:** Wave-1 Agent-B's entangled Phase-4 *panel* code
  (`TruthChip`, transparency chips referencing `f.has_value` /
  `f.tenant_override`) was swept into a phase-1 commit by another agent's
  broad `git add drawers.tsx`; the matching *resolver* change
  (`ResolvedField` + optional `tenant_override?`/`has_value?` in
  `getFieldsForTalent`, admin-taxonomy.ts) was NEVER committed — it's the
  still-dirty `admin-taxonomy.ts` in main's working tree. NOT caused by
  Phase 2.

**Exact resume fix (already exists clean):** branch `engine-phase4-finish`
commit `36ea80397` contains precisely the minimal additive resolver fix:
add optional `tenant_override?: boolean` + `has_value?: boolean` to
`ResolvedField`; in `getFieldsForTalent` set `tenant_override: !!o`
(from the override map already built — no extra query) and `has_value`
from one existence-only `talent_profile_field_values` select. Applying
just that resolver delta to `admin-taxonomy.ts` makes phase-1 compile
again (satisfies the swept-in panel code). Blocker: `admin-taxonomy.ts`
is dirty with other-agent work → needs their commit / authorized
checkpoint / hand-off.

**Preserved branches (do not delete):** `engine-phase2-finish`
(`f1d9327df`, landed), `engine-phase4-finish` (`36ea80397`, clean Phase-4
incl. the resolver fix + a fuller panel impl), `engine-phase9a-catalog-map`
(`e37813cbe`, Phase 9A MVP — gate-valid, all-new-files, conflict-free),
`engine-phase4-finish-v2` (`588d96487`, bare checkout, disposable).
Worktrees in `/tmp/tulala-*` (node_modules symlinked, ready for resume).

## Path to Done — Multi-Workstream Execution Plan (2026-05-19)

Architect's framing for a *coordinated dev team* (NOT Claude Agent-tool
subagents — banned for this track per the binding decision after Wave-1).
Companion to the canonical phase plan
(`talent-engine-execution-plan-2026-05-18.md`); this layer adds the
dependency DAG + parallelism map + coordination protocol that the
canonical plan deliberately doesn't cover.

### Workstreams

| WS | Name | Files (no overlap) | Parallel? | Gate |
|---|---|---|---|---|
| **R** | Recovery & Landing Train | (lands existing branches) | Must lead | phase-1 tsc-green |
| **A** | Phase 3 close-out (public-profile) | `page.tsx`, `public-profile-field-visibility.ts`, new `field-engine/resolve-public-fields.ts` | Parallel ✓ | Sidebar-keys product call |
| **B** | Phase 5 Convergence | `talent-field-values-catalog.ts`, `profile-shell-dyn-field-values.ts`, `field-values-height-mirror.ts`, `field-engine`, `admin-taxonomy.ts`, +backfill migs | Serial; one DB-WS at a time | `db:push` approval + R green + admin-taxonomy.ts uncontended |
| **C** | Phase 6 Discover canonical | directory loaders, ai-search, new denorm projection | After B; then ‖ D/E/F | Flag-gated cutover |
| **D** | Phase 7a SaaS-ops infra (non-drawers) | new audit migration, cache audit, plan-tier capability lib | Parallel ✓ | Approval |
| **E** | Phase 7b History rail UI | `drawers.tsx` | Drawers-exclusive window | Drawers uncontended + D landed |
| **F** | Phase 9A slices 2+ | all-new platform-admin files | Parallel ✓ (truly independent) | None |
| **G** | Phase 8 Custom fields | new mig + resolver + drawer UI | Tail after B/C/D | Ownership design call |
| **H** | Phase 9B Editable Studio | new platform-admin route + change-set model | **HARD-GATED** on 0–7 | All prerequisites |

### Critical-path

```
R ──► (A · D · F  in parallel)
      └─► B ──► C ──► E ──► G ──► H
```

### Coordination protocol (non-negotiable — Wave-1 paid for this)

1. **Branch governance:** all WS work on feature branches off the
   current `phase-1` tip; never directly on shared.
2. **Landing protocol** (proven): isolated worktree → `ln -s node_modules`
   (the **false-pass guard**) → implement → tsc 0 + lint baseline + route
   probe → rebase to current tip → re-gate → path-scoped commit →
   conflict-free merge.
3. **Contended-file windows:** `drawers.tsx` + `admin-taxonomy.ts` get
   exclusive write windows. Other WS do NOT commit to those files during
   the window. (Slack/PR pin; whatever signal — the *protocol* is what
   matters, not the tool.)
4. **Never land onto a broken trunk.** Never sweep other agents'
   uncommitted work. Never hunk-surgery.
5. **One migration per WS**, unique UTC timestamps; park-restore on
   collision.
6. **TS + lint gate before every commit**; red TS blocks the next WS.
7. **Feature flag / shadow-run** every cutover (B, C, H).

### Outstanding decisions (the actual schedule blockers)

| # | Decision | Owner | Unblocks |
|---|---|---|---|
| 1 | Incident path: wait-for-SaaS vs authorize admin-taxonomy.ts checkpoint vs hand the resolver diff to its owner | You | R, B, E |
| 2 | 6-sidebar-keys product call | You + PM | A (see brief below) |
| 3 | Phase 5 `db:push` approval per slice | You | B → C |
| 4 | Phase 7a go (non-drawers SaaS ops) | You | D |
| 5 | Phase 8 design (custom fields ownership model) | You + PM + DBA | G |
| 6 | Production deploy gates (per Vercel) | You | each shipping WS |

### Acceptance — "all done"

- 11 plan items (0,1,2,3,4,5,6,7,8,9A,9B) meet their plan-doc acceptance.
- `phase-1` continuously tsc-clean; lint never exceeds the original baseline.
- `smoke:impronta:prod` clean after each promote.
- Phase 7 audit log shows every catalog/privacy/category change end-to-end.
- Phase 9B change-set/preview/rollback verified on a non-destructive test edit.
- Discover/directory reads canonical only; legacy reader dead-code-removed.

### Indicative effort

Serial (1 IC): ~24 weeks · 3-IC parallel: ~12 weeks · 4-IC parallel: ~9 weeks. The single biggest variable is the time waiting on the SaaS plan to finish (gates R) and Phase 8/9B which are big designs.

### Plan improvements vs canonical plan doc

1. **Make Phase R first-class** (recovery/landing isn't tracked there).
2. **Split Phase 7** into 7a (non-drawers, parallelizable) and 7b (drawers-coupled).
3. **Phase 5 sub-slicing** strictly per runbook `4f6c8002f`; never bundle "cutover readers" with "retire legacy writes" in the same slice.
4. **Phase 9A iterative** — MVP shipped (`e37813cbe`); 3–4 small slices remaining.
5. **Codify the coordination protocol** in `CLAUDE.md` / `AGENTS.md` (the file-windows + landing protocol + node_modules-symlink lesson).
6. **One canonical plan doc** — *this section* folds in; do not spawn parallel plan docs.

---

## Pending Decision — Phase 3 six-sidebar-keys product call

**Context.** `web/src/lib/public-profile-field-visibility.ts` (legacy)
gates 6 public-profile sidebar sections via the OLD `field_definitions`
table: `fit_labels`, `skills`, `languages`, `industries`, `event_types`,
`tags`. Phase 3 wants to retire this and gate via the canonical engine
instead — but a canonical-catalog check (verified) shows:

| Sidebar key | Canonical equivalent in `profile_field_definitions`? |
|---|---|
| `skills` | ✅ yes (`skills`) |
| `languages` | ✅ yes (`languages`) |
| `fit_labels` | ❌ no |
| `industries` | ❌ no |
| `event_types` | ❌ no (only type-specific `host.event_types` / `hosp.event_types`) |
| `tags` | ❌ no |

Silently retiring the legacy gate would change which sidebar sections
show on live public profiles — a visible behavior change. Needs a product
call (parallel to the Gap-2-style decision you already approved earlier).

### Options

**A — Hybrid (recommended; smallest behavior change).** Migrate
`skills`+`languages` to canonical engine gating; **keep the legacy gate
for the 4 with no canonical equivalent.** Public behavior preserved; net
debt reduced by 2 of 6. Tiny code surface in `page.tsx`. Phase 3 close-out
ships in a day.

**B — Aggressive cleanup.** Retire all 6 sidebar sections that can't be
canonically modeled — public stops showing fit_labels / industries /
event_types / tags. Big behavior change; requires UX/product approval.

**C — Promote all 6 to canonical.** Create new platform
`profile_field_definitions` entries for fit_labels / industries / tags
/ event_types. Migration + governance work; effectively a small Phase 8
slice. Most "correct" long-term but largest near-term lift.

**D — Status quo (defer).** Keep all 6 on the legacy gate; Phase 3
"closed" continues as-is. Zero work, debt persists.

### Recommendation

**Option A.** It's behavior-preserving for the 4 untranslatable keys,
clears the 2 that do map (the genuine half-win), and ships in hours. C is
the right *eventual* answer but it belongs in Phase 8 governance, not as
a Phase 3 follow-up.

### What I need from you

A 1-character answer (A / B / C / D), or a tweak. I'll execute serially
in `engine-phase3-closeout` worktree, path-scoped, no push.
