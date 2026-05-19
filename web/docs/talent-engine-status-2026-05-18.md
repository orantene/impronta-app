# Talent Catalog Engine — Status Note (2026-05-18)

Short status record. Companion to `talent-engine-execution-plan-2026-05-18.md`
(the canonical phase plan) and `talent-profile-engine-master-audit-2026-05-18.md`.

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

## Next when unblocked

When the other agents commit/clear `drawers.tsx` + `admin-taxonomy.ts`,
resume serially: redo Phase 4 (Agency Fields transparency layer) and
Phase 2 finish (`WorkspaceFieldSettingsDrawer` → real) cleanly, path-scoped,
gated. Phase 5 (convergence, data movement, db-gated) and Phase 6+ remain
explicitly gated on a separate scoped plan + approval.
