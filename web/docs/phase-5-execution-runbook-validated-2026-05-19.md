# Phase 5 — Convergence Execution Runbook (VALIDATED, 2026-05-19)

Validation of the "prepared" runbook committed at
[`4f6c8002f`](../docs/phase-5-convergence-runbook-2026-05-19.md) against
the actual code state at `phase-1` tip `3e939fcf3`. Cross-link to the
canonical plan ([`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md)
§Phase 5) and the status doc ([`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md)).

Treat **this** file as the operational runbook when both gates clear. The
original `phase-5-convergence-runbook-2026-05-19.md` stays as the
"prepared" predecessor; this is the validated re-scope.

## TL;DR (operator)

1. Phase 5 in the prepared runbook was scoped TOO TIGHT in one place (didn't
   acknowledge the shell-editor legacy-only write path) and TOO LOOSE in
   another (ordered retire-mirror inside Phase 5, which would silently break
   Discover/AI search the moment it runs).
2. Re-scoped into **7 sub-slices** (P5-α through P5-η). Three of them depend
   on external decisions (db:push, admin-taxonomy.ts quiesce, Phase-6 reader
   cutover gate). The other four are mechanical given approval.
3. **Safest first slice** = P5-α (read-only SQL parity audit; no code, no
   migration, no risk; produces the dry-run counts the prepared runbook
   already calls for).
4. **Highest-risk slice** = P5-η (retire `mirrorWriteToLegacy`). Cannot ship
   inside Phase 5 — gated on Phase 6 reader cutover landing, otherwise
   Discover/AI search go stale on next edit. Reclassified Phase-6-tail.

---

## Section A — Discrepancies between prepared runbook and code reality

Severity: **🔴 ship-impact** / **🟡 framing-impact** / **⚪ cosmetic**.

### A1 🔴 "Dual-write — DONE" is only half-true

Prepared runbook (line 43): *"1. Dual-write — DONE (4a `1c0827aec`: talent +
admin write canonical and mirror to legacy for bridged keys)."*

Real state:

| Edit path | Canonical write? | Legacy write? |
|---|---|---|
| Admin catalog editor ([`admin-talent-field-values.ts:271`](../src/lib/server-actions/admin-talent-field-values.ts)) | ✅ | ✅ via `mirrorWriteToLegacy` |
| Talent catalog editor ([`talent-field-values-catalog.ts:101`](../src/lib/server-actions/talent-field-values-catalog.ts)) | ✅ | ✅ via `mirrorWriteToLegacy` |
| **Shell DYN-fields editor ([`profile-shell-dyn-field-values.ts:143`](../src/lib/talent/profile-shell-dyn-field-values.ts))** | ❌ | ✅ direct legacy upsert |
| Old talent-field-values writer ([`talent-field-values.ts:134`](../src/lib/server-actions/talent-field-values.ts)) | ❌ | ✅ direct legacy upsert |

`syncProfileShellDynFieldValues` is still actively called from BOTH
[`talent-self-profile-sections.ts:411`](../src/lib/server-actions/talent-self-profile-sections.ts)
AND [`admin-talent-profile-sections.ts:632`](../src/lib/server-actions/admin-talent-profile-sections.ts).
Its writes land in **legacy only**.

**Implication.** Canonical can be staler than legacy on any field still
edited via the profile-shell path. The backfill (Step 2 of the prepared
runbook) handles historical drift once. But going forward, every shell
edit re-introduces drift unless the shell-path is converted in the same
phase. The prepared runbook reorders this to Step 4 ("retire LAST"); that
ordering is correct for **retirement** but wrong for **convergence** —
canonical drift continues for the whole interim period.

### A2 🔴 Step 4 "retire `mirrorWriteToLegacy` LAST" cannot ship inside Phase 5

Prepared runbook (line 50): *"4. Retire legacy writes LAST —
`profile-shell-dyn-field-values.ts` + the canonical→legacy mirror, only
after (3) proven."*

Step 3 of the prepared runbook is the *resolver-collapse* (admin-taxonomy +
talent-field-values-catalog share one core). That step does NOT switch
Discover / facet filters / AI search / public sidebar from reading
`field_values` to reading `talent_profile_field_values`. Those readers are
explicitly scoped to **Phase 6** in the canonical plan
([`talent-engine-execution-plan-2026-05-18.md` §Phase 6](talent-engine-execution-plan-2026-05-18.md)).

If `mirrorWriteToLegacy` is retired at the end of Phase 5 — i.e., before
Phase 6 ships — every new canonical-side edit stops appearing in `field_values`.
Discover/AI search go silently stale on next edit and only see the
backfilled snapshot until Phase 6 cutover.

**Fix.** Reclassify mirror-retirement as Phase-6-tail. It executes AFTER
Phase 6 readers are flipped to canonical, not at the end of Phase 5. The
re-scoped slices below codify this.

### A3 🟡 Reader surface understated (5 → 22 files)

Prepared runbook describes the legacy reader surface as *"Discover, the
directory facet filters, and a few legacy surfaces"*. Actual `field_definitions`
read sites (verified `grep`):

| Surface | Files |
|---|---|
| Directory listing & search | [`fetch-directory-page.ts:733`](../src/lib/directory/fetch-directory-page.ts), [`apply-directory-field-facet-filters.ts:56`](../src/lib/directory/apply-directory-field-facet-filters.ts), [`directory-search-legacy.ts:57`](../src/lib/directory/directory-search-legacy.ts), [`field-driven-filters.ts`](../src/lib/directory/field-driven-filters.ts), [`directory-card-display-catalog.ts:32`](../src/lib/directory/directory-card-display-catalog.ts), [`directory-filter-catalog.ts:40`](../src/lib/directory/directory-filter-catalog.ts), [`directory-catalogs.ts`](../src/lib/site-admin/server/directory-catalogs.ts) |
| AI search | [`rebuild-ai-search-document.ts:241`](../src/lib/ai/rebuild-ai-search-document.ts), [`ai-search-document-debug.ts:78,119`](../src/lib/ai/ai-search-document-debug.ts) |
| Public profile sidebar | [`public-profile-field-visibility.ts`](../src/lib/public-profile-field-visibility.ts), [`public-profile-field-order.ts`](../src/lib/public-profile-field-order.ts) |
| Talent dashboard | [`talent-dashboard-data.ts:243,425`](../src/lib/talent-dashboard-data.ts), [`talent-nav-groups.ts`](../src/lib/talent-nav-groups.ts) |
| Admin editor side | [`admin-talent-profile-sections.ts`](../src/lib/server-actions/admin-talent-profile-sections.ts), [`admin-talent.ts:413`](../src/lib/server-actions/admin-talent.ts), [`talent-self-profile-sections.ts:448,464`](../src/lib/server-actions/talent-self-profile-sections.ts) |
| Field lib | [`fields/values.ts`](../src/lib/fields/values.ts), [`fields/definitions.ts`](../src/lib/fields/definitions.ts), [`fields/legacy-mirror.ts`](../src/lib/fields/legacy-mirror.ts) (the bridge itself) |
| API | [`api/directory/preview/[talentId]/route.ts`](../src/app/api/directory/preview/[talentId]/route.ts) |
| Translation | [`field-value-text-i18n-adapter.ts:75,127`](../src/lib/translation-center/adapters/field-value-text-i18n-adapter.ts), [`admin-translation-quick-edit.ts`](../src/lib/server-actions/admin-translation-quick-edit.ts) |
| Other legacy writers | [`profile-shell-dyn-field-values.ts:78,143`](../src/lib/talent/profile-shell-dyn-field-values.ts), [`ensure-basic-info-canonical-mirrors.ts`](../src/lib/fields/ensure-basic-info-canonical-mirrors.ts) (NEW, see A6) |

**This expansion of the reader inventory is Phase-6 scope, not Phase 5.**
It does NOT widen Phase 5 work. But the prepared runbook's "Verified
inventory" section is incomplete and would be surprising during Phase 6
planning. The expanded table above is the operational inventory.

### A4 🔴 height_cm "single documented path" is false

Prepared runbook Step 4 claims `mirrorHeightCmToTalentProfile` *"remains
the **single** documented denorm writer of `talent_profiles.height_cm`"*.

Actual writers of `talent_profiles.height_cm` (verified `grep`):

1. [`field-values-height-mirror.ts:12`](../src/lib/field-values-height-mirror.ts) — the documented mirror (good).
2. [`admin/roster/[id]/actions.ts:217`](../src/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions.ts) — direct UPDATE from form input.
3. [`api/admin/roster-import/route.ts:235`](../src/app/api/admin/roster-import/route.ts) — bulk import direct set.

The talent-field-values writer (admin + talent paths) DOES go through the
mirror correctly. But (2) and (3) are NOT mirrored. They write to
`talent_profiles.height_cm` directly without touching the governed
field-value — so the field-value resolver sees one number, the column
denorm sees another. Step 4 is real work, not a header comment.

### A5 ⚪ Path typo

Prepared runbook references `field-values-height-mirror.ts` as if it lives
in `web/src/lib/fields/`. Actual location:
[`web/src/lib/field-values-height-mirror.ts`](../src/lib/field-values-height-mirror.ts)
(one level up). All four callers import from
`@/lib/field-values-height-mirror`. Cosmetic — no functional impact.

### A6 🟡 Untracked new file: `ensure-basic-info-canonical-mirrors.ts`

Not mentioned in the prepared runbook. Lives at
[`web/src/lib/fields/ensure-basic-info-canonical-mirrors.ts`](../src/lib/fields/ensure-basic-info-canonical-mirrors.ts).
Confusingly named — "canonical mirrors" but writes seed rows into the
**legacy** `field_definitions` table (and `field_groups`). Called
idempotently on admin Fields loads to keep the 13 Basic Information rows
present even if the SQL restore migration was skipped.

**Implication.** When Phase 6 retires the legacy `field_definitions`
reads, this file becomes obsolete (or must be inverted to seed
`profile_field_definitions` instead). Track it as a Phase-6 cleanup item.
Not in scope for Phase 5.

### A7 🟡 Gate #1 understates the incident state

Prepared runbook gate #1: *"`admin-taxonomy.ts` quiesced — currently dirty
with concurrent other-agent + Agent-B residue."*

Per the status doc § "⚠ OPEN INCIDENT — phase-1 does not compile (PAUSED
2026-05-19, resume after SaaS plan)", `phase-1` HEAD itself does not pass
`tsc` — 4 errors in `drawers.tsx` because the resolver delta sitting in
the dirty `admin-taxonomy.ts` has never been committed. The user has
explicitly **paused** action on this until the concurrent SaaS-improvement
plan finishes. The gate is therefore not a passive "waiting for it to
land" — it's a hard user-imposed pause.

**Fix.** Gate #1 rewords to: *"Resume only when (a) user explicitly
lifts the SaaS-plan pause AND (b) `phase-1` is tsc-green again (via clean
checkpoint of `admin-taxonomy.ts` resolver delta or the hand-off route
described in the status doc)."*

### A8 ⚪ field-engine module already exists

Prepared runbook Step 3 design proposes a new module
`src/lib/field-engine/resolve-talent-fields.ts`. Confirmed:
`web/src/lib/field-engine/` already exists with `effective-visibility.ts`
+ test. Adding `resolve-talent-fields.ts` there is the right placement.
Cosmetic confirmation only.

---

## Section B — Top 3 risks (operator headline)

1. **🔴 Retiring `mirrorWriteToLegacy` inside Phase 5 silently breaks
   Discover/AI search.** Mitigation: reclassified as Phase-6-tail (slice
   P5-η below). Cannot run until Phase 6 readers flip.

2. **🔴 Shell-editor path bypasses canonical entirely.** Canonical drift
   continues for every shell edit during the convergence window.
   Mitigation: P5-γ converts the shell path to dual-write *before* P5-δ
   (resolver-collapse) ships, so admin/talent shell edits also land in
   canonical from then on.

3. **🔴 `talent_profiles.height_cm` has 3 direct-write paths, only 1
   mirrored.** Form-driven UPDATEs from roster edit + bulk import diverge
   from the governed field-value. Mitigation: P5-ε routes both through the
   mirror (or explicitly documents them as authoritative canonical writes
   that must also seed `talent_profile_field_values` for `physical.height_cm`).

---

## Section C — Re-scoped Phase 5 (7 slices)

Numbering uses Greek letters to avoid clashing with the prepared
runbook's step numbering. Each slice carries:
**Pre-flight · Change · Flag · Gate · Acceptance · Rollback.**

The default sequencing is α → β → γ → δ → ε. ζ and η are explicit
Phase-6 prerequisites / tail, included here for ordering completeness.

### P5-α — Parity audit (READ-ONLY) · SAFEST FIRST

**Pre-flight.** None — read-only.

**Change.** Run the dry-run SQL from the prepared runbook (lines 86–95).
For each of the 17 keys in [`NEW_TO_OLD_KEY`](../src/lib/fields/legacy-mirror.ts)
+ the 3 social URLs (instagram/youtube/tiktok), count:

- Rows in `field_values` where canonical row is absent (would-backfill).
- Rows in `talent_profile_field_values` where legacy row is absent (canonical-only).
- Mismatches where both rows exist but values differ (after the legacy→canonical coercion).

Record results in `web/docs/phase-5-parity-audit-<date>.md`. Verify each
of the 3 social URLs has a corresponding `profile_field_definitions` row
before including it — exclude from backfill if not.

**Flag.** None — pure SQL audit.

**Gate.** Counts are sensible: legacy ≥ canonical for the 17 bridged
keys; mismatch rate is low and explainable; the 3 social URLs decision
is recorded (in or out).

**Acceptance.** Parity audit doc committed. Counts make sense to operator.

**Rollback.** Not applicable (read-only).

---

### P5-β — Additive backfill migration · DB-GATED

**Pre-flight.** P5-α complete; explicit `db:push` approval.

**Change.** Author `supabase/migrations/<UTC>_phase5_backfill_legacy_field_values_to_canonical.sql`:

- Inverse map of `NEW_TO_OLD_KEY` (+ approved social-URL keys from P5-α).
- For each (old_key, new_key) pair: INSERT into `talent_profile_field_values`
  (`talent_profile_id`, `field_definition_id` = canonical_def_id, `value` =
  jsonb-built-from-typed-legacy-column, `workflow_state = 'live'`) SELECT
  ... WHERE NOT EXISTS (canonical row).
- No UPDATE. No DELETE. Legacy untouched. Re-runnable.

Files touched:

- `supabase/migrations/<UTC>_phase5_backfill_…sql` (new).
- No code changes.

**Flag.** Migration is gated by `db:push` approval — the binding hard gate.

**Gate.** Dry-run (P5-α) counts recorded before apply. Post-apply, re-run
the parity SQL — `would_backfill` should now be 0 for every bridged key.

**Acceptance.** Canonical row count for the 17 keys equals legacy row
count (for talents that have legacy rows). Legacy table untouched (row
counts unchanged).

**Rollback.** Revert the commit (deletes the migration file). Canonical
extras are harmless to legacy (legacy never modified). For a hard
rollback that wipes the new canonical rows, a manual DELETE is needed,
but the runbook's "never destructive in Phase 5" principle means we
*never* run that — drift back is the cost of certainty.

---

### P5-γ — Convert shell DYN-fields path to dual-write

**Pre-flight.** P5-β complete (canonical fully seeded). `phase-1`
tsc-green.

**Change.** Make `syncProfileShellDynFieldValues`
([`profile-shell-dyn-field-values.ts:60`](../src/lib/talent/profile-shell-dyn-field-values.ts))
also write canonical for any DYN field whose key maps to a
`profile_field_definitions` row. Two implementation options:

- **Option G1 (preferred — least surface):** Inside the existing per-key
  loop in `syncProfileShellDynFieldValues`, after the legacy upsert/delete,
  call `mirrorWriteToLegacy`'s symmetric inverse (a new
  `mirrorWriteToCanonical(supabase, legacyKey, talentProfileId, value)`
  helper in `fields/legacy-mirror.ts`) for any bridged key. Reuses the
  existing key-map. Smallest change.
- **Option G2 (deeper — preferred long-term):** Route the shell DYN fields
  through `admin-talent-field-values.ts setTalentFieldValue` /
  `talent-field-values-catalog.ts setTalentFieldValueAsTalent` instead of
  writing legacy directly. Resolves to one canonical write path. Higher
  blast radius; defer to Phase 6 cleanup.

**Recommend G1 for Phase 5**; G2 as Phase-6 cleanup.

Files touched:

- `web/src/lib/fields/legacy-mirror.ts` (add `mirrorWriteToCanonical`).
- `web/src/lib/talent/profile-shell-dyn-field-values.ts` (call it after each legacy write).

**Flag.** None — additive write only; existing legacy write is untouched.

**Gate.** TS clean (`cd web && npx tsc --noEmit`); lint baseline (78);
manual QA: edit a bridged field via the profile-shell editor (admin +
talent), verify it appears in **both** tables.

**Acceptance.** After any shell-editor edit on a bridged key, canonical
and legacy values match within the same transaction window.

**Rollback.** Revert the single commit. Legacy writes resume their
prior path. No DB work needed.

---

### P5-δ — Resolver-collapse (the prepared runbook's Step 3)

**Pre-flight.** P5-γ complete. Gate #1 cleared (`admin-taxonomy.ts`
uncontended; `phase-1` tsc-green; user lifted SaaS-plan pause).

**Change.** Per the prepared runbook's Step 3 design (lines 54–73). New
module `web/src/lib/field-engine/resolve-talent-fields.ts` exporting a
pure auth-agnostic core. Both callers delegate:

- [`admin-taxonomy.ts:844 getFieldsForTalent`](../src/lib/server-actions/admin-taxonomy.ts) — keep
  `requireStaffTenantAction`; body becomes `return resolveTalentFields({
  supabase, talentProfileId, tenantId, viewerRole: 'agency_admin' })`.
- [`talent-field-values-catalog.ts:196 getFieldsForTalentAsTalent`](../src/lib/server-actions/talent-field-values-catalog.ts) — keep
  `requireTalent` + ownership check; replace the ~130-line re-query with
  `resolveTalentFields({ ..., viewerRole: 'talent' })`; **delete the
  divergent reimplementation**.

Files touched:

- `web/src/lib/field-engine/resolve-talent-fields.ts` (new).
- `web/src/lib/server-actions/admin-taxonomy.ts` (delegate).
- `web/src/lib/server-actions/talent-field-values-catalog.ts` (delegate; delete divergent body).

**Flag.** None — behaviour-neutral refactor.

**Gate.** TS clean; lint baseline; for ≥5 sample talents, admin-side and
talent-side resolved field-id sets are byte-identical (same core; sample
emit a console snapshot during QA, then revert). Route probes:
`/admin/roster` 307, `/talent` 307, `/t/<seed>` 200.

**Acceptance.** Editor + Agency Fields read the same set of resolved
fields per talent. Behaviour-neutral vs `phase-1` baseline.

**Rollback.** Revert the single commit. Old resolvers come back; new
module file is removed. No DB work needed.

---

### P5-ε — `talent_profiles.height_cm` single-path consolidation

**Pre-flight.** P5-γ complete (so shell edits also seed canonical
height_cm). No other prerequisite.

**Change.** Inventory the 3 known `talent_profiles.height_cm` writers
(see A4); decide per writer:

- [`field-values-height-mirror.ts:12`](../src/lib/field-values-height-mirror.ts) — stays as the documented governed→denorm mirror.
- [`admin/roster/[id]/actions.ts:217`](../src/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions.ts) — route through `mirrorHeightCmToTalentProfile` AND seed/update the canonical `physical.height_cm` value via the catalog write path.
- [`api/admin/roster-import/route.ts:235`](../src/app/api/admin/roster-import/route.ts) — same treatment for bulk import.

Add a header comment to `field-values-height-mirror.ts` declaring it the
sole legitimate denorm path; cross-reference the canonical write paths
that feed it.

Files touched:

- `web/src/lib/field-values-height-mirror.ts` (header comment).
- `web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions.ts`.
- `web/src/app/api/admin/roster-import/route.ts`.

**Flag.** None — additive consistency fix; existing writes are not
replaced, they're augmented to also seed canonical.

**Gate.** TS clean; lint baseline; manual QA: edit height via roster
edit form → verify (a) `talent_profiles.height_cm` column updates,
(b) canonical `talent_profile_field_values` row for `physical.height_cm`
updates, (c) legacy `field_values` row for `height_cm` updates (via the
existing mirror chain).

**Acceptance.** All three storage locations agree for `height_cm` after
any of the 3 writers fires.

**Rollback.** Revert the commit. Direct writes resume their prior
unmirrored behaviour. No DB work needed.

---

### P5-ζ — Phase-6 prerequisite: dual-READ shadow flag on the canonical side

> ⚠ This slice is **not strictly Phase 5** — it's the Phase 6 prerequisite
> that must ship before P5-η is allowed to retire `mirrorWriteToLegacy`.
> Listed here so the operator sees the full convergence sequence in order.
> Per the canonical plan §Phase 6, this lives in Phase 6.

**Pre-flight.** P5-α through P5-ε complete. Canonical is the
authoritative source for the 17+ bridged keys.

**Change.** For each of the 5 critical legacy-reader code paths (the
ones that drive end-user-visible surfaces):

1. [`fetch-directory-page.ts:733`](../src/lib/directory/fetch-directory-page.ts) (Directory card attributes)
2. [`apply-directory-field-facet-filters.ts:56`](../src/lib/directory/apply-directory-field-facet-filters.ts) (Directory facet filtering)
3. [`directory-search-legacy.ts:118`](../src/lib/directory/directory-search-legacy.ts) (Legacy search fallback)
4. [`rebuild-ai-search-document.ts:241`](../src/lib/ai/rebuild-ai-search-document.ts) (AI-search document builder)
5. [`ai-search-document-debug.ts:119`](../src/lib/ai/ai-search-document-debug.ts) (AI-search debug surface)

Add a canonical-aware sibling reader that runs **in shadow** behind a
single env flag (`ENGINE_CANONICAL_READ_SHADOW=1` recommended). Default:
legacy primary, canonical shadow, logs mismatches via `improntaLog`
(structured). After one production release with low mismatch rate, the
flag flips to make canonical primary; legacy stays as fallback for one
more release.

Files touched: ~5 reader files + a `phase-6-mismatch-log.md`
post-release.

**Flag.** `ENGINE_CANONICAL_READ_SHADOW` — boolean env (default off in
prod for the first commit; flip on after first release).

**Gate.** Shadow telemetry: mismatch rate < 0.5% over one production
week. If higher, investigate before flipping.

**Acceptance.** Canonical reader returns identical or equivalent results
to legacy for every audited query in the shadow run.

**Rollback.** Flip flag off. Legacy reader is still primary; no DB work.

---

### P5-η — Retire `mirrorWriteToLegacy` · HIGHEST RISK · Phase-6-tail

> ⚠ This slice **cannot ship inside Phase 5**. It depends on P5-ζ (Phase 6
> dual-READ shadow) flipping canonical to primary AND running for one
> production release with low mismatch rate.

**Pre-flight.** P5-ζ complete; canonical-primary readers shipped and
stable for ≥1 production release; explicit operator approval to retire.

**Change.** Two surgical removals:

1. Delete `mirrorWriteToLegacy` calls from
   [`admin-talent-field-values.ts:266,295`](../src/lib/server-actions/admin-talent-field-values.ts)
   and [`talent-field-values-catalog.ts:95,125`](../src/lib/server-actions/talent-field-values-catalog.ts).
2. Delete the legacy half of `syncProfileShellDynFieldValues`
   ([`profile-shell-dyn-field-values.ts:127,143`](../src/lib/talent/profile-shell-dyn-field-values.ts))
   — keep only the canonical write path (the P5-γ addition).
3. Delete [`legacy-mirror.ts`](../src/lib/fields/legacy-mirror.ts) entirely; remove its 3 importers.
4. Delete the OLD writer [`talent-field-values.ts`](../src/lib/server-actions/talent-field-values.ts)
   (it writes legacy only and is now dead code, having been replaced by
   the new catalog writer).

Files touched: 4 in scope.

**Flag.** Behind a final env flag `ENGINE_LEGACY_WRITE_DISABLED=1` for
one release before deleting the code, so an emergency reactivation is
possible without a code revert.

**Gate.** After 1 release with the flag on: no Discover/AI/sidebar
regression reported; mismatch logs from P5-ζ confirm canonical-only is
sufficient.

**Acceptance.** No remaining writes to `field_values` from any code
path. The legacy table goes read-only (legacy `field_definitions` still
read by P5-ζ-fallback code if any, but no new value rows are produced).

**Rollback (high cost).**
1. Re-add `mirrorWriteToLegacy` (revert commit).
2. Re-run P5-β backfill in **reverse direction** (canonical → legacy
   `INSERT WHERE NOT EXISTS`) to catch the intervening edits that landed
   canonical-only. New migration. Idempotent. Approved `db:push`.
3. Flip P5-ζ flag back to legacy-primary.

**This is the slice that justifies the runbook's `db:push` and
multi-release gates.** Rollback requires re-running backfill — slow,
gated, and operator-attended. Treat as a separate Phase-6-tail release
with its own approval window.

---

## Section D — Per-slice rollback summary (1-line each)

| Slice | Rollback (1 line) |
|---|---|
| **P5-α** Parity audit | Not applicable — read-only SQL doc. |
| **P5-β** Backfill migration | Revert commit; canonical extras harmless; never run a manual DELETE. |
| **P5-γ** Shell dual-write | Revert single commit; legacy-only shell writes resume; no DB work. |
| **P5-δ** Resolver-collapse | Revert single commit; old resolvers come back; no DB work. |
| **P5-ε** height_cm consolidation | Revert single commit; direct writes resume unmirrored; no DB work. |
| **P5-ζ** Phase-6 dual-READ shadow | Flip `ENGINE_CANONICAL_READ_SHADOW=0`; legacy primary intact. |
| **P5-η** Retire mirror | **HIGH COST**: revert commit + run reverse-direction backfill migration + db:push + flip P5-ζ flag back to legacy-primary. |

---

## Section E — Updated unblock checklist (supersedes the prepared runbook's)

- [ ] User explicitly lifts the SaaS-plan pause (status doc §"OPEN INCIDENT").
- [ ] `admin-taxonomy.ts` checkpoint cleared; `phase-1` tsc-green.
- [ ] Explicit `db:push` approval for the P5-β backfill migration.
- [ ] Fresh `engine-phase5-finish` worktree off the **then-current** `phase-1`
      tip + `ln -s <main>/web/node_modules <wt>/web/node_modules` (+ repo
      root) before trusting tsc/lint (the false-pass guard — binding lesson).
- [ ] P5-α parity audit recorded & approved before P5-β apply.
- [ ] Per-slice gate green; ts + lint + route probe pass on each slice.
- [ ] **P5-η deferred**: do NOT attempt inside the Phase 5 window. It belongs
      after Phase 6 reader cutover.

---

## Section F — Recommended first slice (operator action when unblocked)

**P5-α — Parity audit (read-only SQL).** No code, no migration, no risk.
Produces the dry-run counts that the prepared runbook already requires
before P5-β apply. Records the social-URL inclusion/exclusion decision.
Sets the empirical baseline ("legacy has N rows for body_type,
canonical has M, would-backfill = N–M") that every later slice grades
against.

Concretely: run the dry-run SQL from the prepared runbook (lines 86–95)
against the linked Supabase project, save output as
`web/docs/phase-5-parity-audit-<UTC>.md`, commit path-scoped.

If that surfaces an unexpectedly large `would_backfill` count on a
specific key, that's a signal to investigate before the migration —
better caught read-only.

---

## Cross-references

- Canonical plan: [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) §Phase 5 + §Phase 6
- Status doc: [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) §"OPEN INCIDENT" + §"Path to Done — Workstream B"
- Prepared (predecessor) runbook: [`phase-5-convergence-runbook-2026-05-19.md`](phase-5-convergence-runbook-2026-05-19.md)
- Phase-1 tip at validation: `3e939fcf3` (2026-05-19)
