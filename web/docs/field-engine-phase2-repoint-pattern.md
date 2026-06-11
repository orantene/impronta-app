# Field-engine Phase 2 — per-surface A→B repoint pattern (T2.0 scaffold)

This is the recipe **T2.1–T2.5** follow to repoint one System-A reader surface
to canonical System B. T2.0 built the scaffold (flag + seam + a proof slice);
each later task implements its surface's B-reader behind the seam, ships a
parity proof, and the manager flips the flag.

## The contract in one paragraph

System B (`profile_field_definitions` + `talent_profile_field_values`) is the
sole value store; we repoint each System-A reader (`field_definitions` +
`field_values`) to B **one surface at a time**, behind a per-surface flag that
**defaults to reading A** (behaviour-neutral) and flips to B independently. Each
flip ships a parity proof and rolls back instantly via the flag. The surface's
caller never changes — only the flag and the reader pair do.

## The pieces (already built — do not rebuild)

| Piece | Path | What it is |
|---|---|---|
| Flag + grammar (pure) | `src/lib/field-engine/read-source-types.ts` | `FIELD_ENGINE_READ_SOURCE` parsed into per-surface `a`\|`b` flags. One key per surface, all default `a`. Global kill switch + per-surface rollback. |
| Dispatch seam (server) | `src/lib/field-engine/read-source.ts` | `readFieldSurface(surface, pair, ...args)` runs `readA` or `readB` per the live flag, with safe-fallback to A on a B-read throw. `readFieldSurfaceBoth` runs both side-by-side for the proof. |
| Proof slice (example) | `src/lib/field-engine/read-source-public-sidebar-labels.ts` | The reference implementation: an A-reader + a B-reader for one isolated read, both returning the same `T`. Copy its structure. |
| Unit test | `src/lib/field-engine/read-source.test.ts` | Parser + dispatch + fallback. Wired into `npm run test:fields` → `ci`. Add your surface's output-parity assertion here (or a sibling test). |
| DB parity harness | `scripts/field-parity-harness.mjs` | A-read vs B-read agreement across the talent cohort. The value-store proof. |

## The flag

`FIELD_ENGINE_READ_SOURCE` (env var, read once on the server). Grammar mirrors
the P1 `FIELD_ENGINE_CLIENT_SOURCE` flag exactly:

```
(unset) / ""                          → all surfaces `a`  (default, behaviour-neutral)
a                                     → all `a`           (global kill switch / rollback)
b                                     → all `b`           (only once all five proven)
public_sidebar:b                      → that surface `b`, others keep `a`
directory_facets:b,ai_search_doc:b    → explicit per-surface list
public_sidebar:a                      → revert just that surface  (per-surface rollback)
```

Surface keys: `directory_facets` (T2.1), `public_sidebar` (T2.2),
`dashboard_nav` (T2.3), `directory_cards` (T2.4), `ai_search_doc` (T2.5).

## Recipe — repoint your surface

### 1. Lift the existing reader behind the seam as `readA`
Find the surface's current System-A reader (see the per-surface map at the
bottom). Wrap its **exact current logic** as `readA` so flag=`a` is byte-for-byte
today. Do not "clean it up" — `readA` is the baseline the proof compares against.

### 2. Write `readB` returning the IDENTICAL `T`
Read the canonical store and project to the **same output type** `readA`
returns. Match `readA`'s fallback behaviour for missing rows (System B may not
have a row for every legacy key yet — fall back exactly as A does). B is a
verified **superset** of A for the 17 bridged value keys (0 A-only), so a value
repoint loses nothing; a metadata key with no B row is the only gap, and the
shared fallback covers it.

```ts
export const mySurfaceReaderPair: FieldSurfaceReaderPair<[Args], T> = {
  readA: readFromLegacyA,
  readB: readFromCanonicalB,
};

export function readMySurface(args): Promise<T> {
  return readFieldSurface("<surface_key>", mySurfaceReaderPair, args);
}
```

The caller swaps its direct reader call for `readMySurface(...)` **once**, while
the flag is still `a` — so the swap is behaviour-neutral and merges safely
before the flip.

### 3. Produce the parity proof
Two layers, both required:

- **Value-store layer (harness).** Run before and after:
  ```
  cd web && node --env-file=.env.local --env-file=.env.vercel.local \
    scripts/field-parity-harness.mjs --cohort=public-approved
  ```
  Read the per-key `norm%` (normalized agreement of both-present rows) and the
  `Aonly` column. **Pass bar: 0 `Aonly` for your keys and `norm%` ≥ 99%.** Raw%
  is expected to be lower (A stores slugs, B stores labels — that is vocab-only
  drift, not a regression). If your surface's keys aren't in the harness's
  `KEY_PAIRS`, add them to that config block (it is a single self-contained file
  outside the tsc surface).

- **Surface-output layer (test).** Assert `readA` and `readB` produce the equal
  projected `T` for the proof cohort. For pure-projection slices, a focused
  read-only SQL that reproduces both projections is enough (see the
  `read-source-public-sidebar-labels.ts` header for the worked example: 5/6
  keys byte-identical, `skills` the one explained gap). Document every diff and
  why it is non-regressive.

Keep the committed default at `a`. The proof is the evidence for the manager's
flip — it is not a flip itself.

### 4. Hand off for the flip
In your PR, state: the surface key, the proof numbers (harness `norm%` +
output-layer agreement), every explained diff, and the exact env value to set
(`FIELD_ENGINE_READ_SOURCE=<surface_key>:b`). The manager sets it in Vercel and
redeploys (or it is set before deploy). No code change ships with the flip.

## How the manager flips / rolls back

- **Flip one surface to B:** set `FIELD_ENGINE_READ_SOURCE=<surface_key>:b` in
  Vercel env, redeploy. Only that surface moves; the rest stay `a`.
- **Flip several:** comma-list them, e.g.
  `FIELD_ENGINE_READ_SOURCE=public_sidebar:b,ai_search_doc:b`.
- **Roll back one surface:** name it with `:a`, e.g.
  `FIELD_ENGINE_READ_SOURCE=public_sidebar:a` (others keep their current value).
- **Kill switch (all back to A):** `FIELD_ENGINE_READ_SOURCE=a`.
- **Safety net:** even without a flag change, a B-read that *throws* auto-falls
  back to A and logs (`field-engine.readFieldSurface.<surface>.b`). The flag is
  the kill switch for a B-read that is wrong but does not throw.

Rollback is a config flip + redeploy — no revert PR needed.

## Per-surface map — what each task repoints

The visibility decision for the directory/sidebar surfaces is **already**
canonical (via `src/lib/field-engine/public-surface-visibility.ts`, Phase 1.4).
What still reads System A is the **config/metadata** (`field_definitions`:
labels, sort/display order, `config` slider bounds, `value_type`, key
enumeration) and the **values** (`field_values`). Those are what these tasks
move.

| Task | Surface key | Files / readers that still read System A | Notes |
|---|---|---|---|
| **T2.1** | `directory_facets` | `src/lib/directory/apply-directory-field-facet-filters.ts` (`field_values` facet reads `:77`; `field_definitions` facet config `:252`/`:261` via `loadDirectoryFacetDefinitionsByKey`), `src/lib/directory/fetch-directory-page.ts` (`field_values` `:457`, `:762`), `src/lib/directory/directory-filter-catalog.ts` (`field_definitions` height config `:40`/`:52`), `src/lib/directory/field-driven-filters.ts` (`field_definitions` `:230`/`:238`) | **B has no `config` jsonb** (no slider min/max) — keep height slider bounds on A or migrate config first; repoint only the value reads + label/key metadata. Highest blast radius. |
| **T2.2** | `public_sidebar` | `src/app/t/[profileCode]/page.tsx` (`field_definitions` sidebar defs `:1741`), `src/lib/public-profile-field-order.ts` (`field_definitions` `:46`), `src/lib/public-profile-field-visibility.ts` (`field_definitions` `:43`, deprecated/orphaned) | Visibility already canonical via `public-surface-visibility.ts`. The label slice is **proven** by the T2.0 reference (`read-source-public-sidebar-labels.ts`). Order differs between stores (A `sort_order` 20–70 vs B `display_order` 100–370) — gate order separately. `skills` has no B row yet. |
| **T2.3** | `dashboard_nav` | `src/lib/talent-nav-groups.ts` (`field_definitions` `:64` → `field_groups`), `src/lib/talent-dashboard-data.ts` (`field_definitions` `:255`, `:425`; `field_values` `:437`) | Reads `field_group_id`/`field_groups` + per-talent `field_values`. Check B's group concept (`profile_field_definitions` has `display_order`, not `field_group_id`) before mapping nav groups. |
| **T2.4** | `directory_cards` | `src/lib/directory/directory-card-display-catalog.ts` (`field_definitions` catalog `:85`) | Visibility already canonical (`isResolvedFieldVisibleOnDirectoryCard`). Repoints the card scalar **metadata** (`value_type`, `label_en/es`, `sort_order`, `taxonomy_kind`). |
| **T2.5** | `ai_search_doc` | `src/lib/ai/rebuild-ai-search-document.ts` (`field_values` join `:241`; `field_definitions` `gender` def `:309`), `src/lib/ai/ai-search-document-debug.ts` (`field_definitions` `:78`, `field_values` `:120`) | Reads `ai_visible`/`internal_only`/`active` gating + per-talent `field_values`. Check B has an `ai_visible` equivalent before repointing the gate; `gender` is column-backed + kept dedicated. |

### Readers explicitly OUT of scope (not part of T2.1–T2.5)
Writers and adjacent systems that also touch these tables but are **not** read
surfaces: the value mirror (`src/lib/fields/legacy-mirror.ts`,
`ensure-basic-info-canonical-mirrors.ts`), the field services
(`src/lib/fields/definitions.ts`, `values.ts`), the talent/admin write paths
(`server-actions/*talent*`, `talent/profile-shell-dyn-field-values.ts`), the
site-admin catalog editor (`site-admin/server/directory-catalogs.ts`), the
translation-center adapter (`translation-center/adapters/field-value-text-i18n-adapter.ts`),
and the directory preview/legacy-search debug routes. Leave these on System A in
Phase 2 — they are write-side or admin-config, governed by the one-database
audit, not this read-repoint program.
