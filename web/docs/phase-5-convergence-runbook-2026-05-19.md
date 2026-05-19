# Phase 5 — Converge Split-Brain Storage: Scoped Execution Runbook (2026-05-19)

The "separate scoped plan" `talent-engine-status-2026-05-18.md` requires
before Phase 5 may execute. Companion to
`talent-engine-execution-plan-2026-05-18.md` (§ Phase 5). **Prepared, not
executed** — two external gates remain (below). When both clear, this is
mechanical.

## Gates (must BOTH be satisfied before executing)

1. **`admin-taxonomy.ts` quiesced** — currently dirty with concurrent
   other-agent + Agent-B residue. The resolver-collapse is a deep
   structural edit to that file; doing it off a stale tip while it churns
   = near-certain landing conflict (the forbidden multi-agent mess).
2. **Explicit `db:push` approval** for the additive backfill migration
   (hard gate enforced all session: P0, P4b).

Branch strategy when unblocked: dedicated `engine-phase5-finish` off the
**then-current** `phase-1` tip; `ln -s <main>/web/node_modules
<wt>/web/node_modules` (+ repo root) BEFORE trusting tsc/lint — a fresh
worktree has no node_modules; `grep -c "error TS"` on a module-not-found
run is a FALSE PASS (binding lesson, status doc).

## Verified inventory (read-only, 2026-05-19)

- **Divergent resolvers:** `admin-taxonomy.ts:844 getFieldsForTalent`
  (staff, `requireStaffTenantAction`, resolver logic embedded inline) vs
  `talent-field-values-catalog.ts:196 getFieldsForTalentAsTalent`
  (`requireTalent`, independent re-query of taxonomy/defs/recs/groups).
  No shared core exists.
- **Legacy `field_values` keys (the ONLY backfill source):** the 17
  bridged keys (`NEW_TO_OLD_KEY`) + `instagram_url` (22), `youtube_url`
  (6), `tiktok_url` (5). ≤70 rows/key. **No specialties / skills /
  contexts / refinement rows in legacy `field_values`** → that clause of
  the Phase-5 outcome is moot; they are not legacy-stored. Data-movement
  surface is small and bounded.
- **height_cm dual path:** `field-values-height-mirror.ts`
  `mirrorHeightCmToTalentProfile` updates the `talent_profiles.height_cm`
  denorm from the governed field-value.

## Data-safe sequence (ordering is the safety property)

1. **Dual-write — DONE** (4a `1c0827aec`: talent + admin write canonical
   and mirror to legacy for bridged keys).
2. **Backfill legacy→canonical — PREPARED, db-gated** (below). Idempotent,
   insert-only-where-canonical-absent, never-overwrite-newer,
   never-delete-legacy.
3. **Switch readers (resolver-collapse)** — only AFTER (2). Extract shared
   core; both callers delegate. (Code; `admin-taxonomy.ts` gate.)
4. **Retire legacy writes LAST** — `profile-shell-dyn-field-values.ts` +
   the canonical→legacy mirror, only after (3) proven. Out-of-order
   retirement = divergence; do not reorder.

## Step 3 — Resolver-collapse design (code; gate #1)

- New module `src/lib/field-engine/resolve-talent-fields.ts` exporting a
  pure, auth-agnostic core: `resolveTalentFields({ supabase,
  talentProfileId, tenantId, viewerRole }) → { fields: ResolvedField[];
  groups: ResolvedFieldGroup[] }`. Lift the resolver body verbatim from
  `admin-taxonomy.ts getFieldsForTalent` (taxonomy walk → catalog →
  recommendations → tenant overrides → `effectiveFieldVisibility`). No
  behaviour change — byte-identical extraction.
- `admin-taxonomy.ts getFieldsForTalent`: keep `requireStaffTenantAction`;
  body becomes `return resolveTalentFields({ supabase, talentProfileId,
  tenantId, viewerRole: 'agency_admin' })`.
- `talent-field-values-catalog.ts getFieldsForTalentAsTalent`: keep
  `requireTalent` + the existing ownership check; replace the ~130-line
  re-query with `resolveTalentFields({ ..., viewerRole: 'talent' })`;
  **delete the divergent reimplementation**.
- Acceptance check: for ≥5 sample talents, the admin and talent resolved
  field-id sets are byte-identical (same core); editor + Agency Fields
  unchanged. tsc 0; lint == baseline (no new); `/admin/roster` 307,
  `/talent` 307, `/t/<seed>` 200.

## Step 2 — Backfill migration SPEC (db-gated; create+apply atomically)

Do NOT drop a stray un-applied `.sql` (a concurrent `db:push` would sweep
it). When approved, create `supabase/migrations/<UTC>_phase5_backfill_
legacy_field_values_to_canonical.sql` and `db:push` it in the same
commit. Old→new key map = inverse of `NEW_TO_OLD_KEY` (+ decide
instagram/youtube/tiktok: only include keys with a canonical
`profile_field_definitions` target — verify each before inclusion;
exclude any without one).

**Dry-run first (read-only, run + record counts before applying):**
```sql
SELECT fd.key AS old_key, count(*) AS would_backfill
FROM field_values fv
JOIN field_definitions fd ON fd.id = fv.field_definition_id
JOIN profile_field_definitions pfd ON pfd.field_key = <old→new map(fd.key)>
WHERE NOT EXISTS (
  SELECT 1 FROM talent_profile_field_values c
  WHERE c.talent_profile_id = fv.talent_profile_id
    AND c.field_definition_id = pfd.id)
GROUP BY fd.key ORDER BY would_backfill DESC;
```
**Apply (idempotent, insert-only-where-absent, never-overwrite-newer,
never-delete-legacy):** INSERT into `talent_profile_field_values`
(`talent_profile_id`, `field_definition_id`=canonical, `value`= jsonb
built from the typed legacy column per the canonical def's kind,
`workflow_state='live'`) SELECT … WHERE NOT EXISTS (canonical row). No
UPDATE, no DELETE. Legacy untouched. Re-runnable.

## Step 4 — height_cm single documented path

Canonical = the governed field-value. `mirrorHeightCmToTalentProfile`
remains the **single** documented denorm writer of
`talent_profiles.height_cm`. Inventory + remove/forbid any other code
that writes `talent_profiles.height_cm` independently; add a header
comment marking it the sole path. (Clean file; safe once Step 3 lands so
ordering holds.)

## Rollback (per plan §Phase 5)

Revert readers to the prior implementations (canonical extra rows are
harmless; legacy never deleted). Fully reversible at every step because
nothing is destructive until a separate, later, explicitly-approved
legacy-cleanup phase (NOT part of Phase 5).

## Unblock checklist

- [ ] `admin-taxonomy.ts` no longer dirty (other agents committed/cleared)
- [ ] Explicit `db:push` approval for the backfill migration
- [ ] Fresh `engine-phase5-finish` worktree off current `phase-1` tip +
      node_modules symlinks verified (tsc actually runs)
- [ ] Dry-run counts recorded before apply
- [ ] Per-step gate green; byte-identical admin/talent resolve verified
