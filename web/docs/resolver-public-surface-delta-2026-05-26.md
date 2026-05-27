# Resolver Public-Surface Delta — 2026-05-26

**Status:** binding plan for Phase 1.1 → 1.5
**Scope:** migrate the three public surfaces — directory filter sidebar,
directory cards, and the public profile sidebar (`/t/[profileCode]`) — off
direct `field_definitions` (legacy table) reads + the
`legacy-directory-policy.ts` bridge, and onto `resolveTalentFields()` /
`effectiveFieldVisibility()` so the engine is the single source of truth for
"is this field visible to a public viewer in tenant X".

> Out of scope for this doc: the legacy → canonical *value* mirror
> (`legacy-mirror.ts`, `field_values` ↔ `talent_profile_field_values`). Value
> migration is a separate workstream; this doc is about **catalog visibility
> decisions only**.

---

## 0. Background — two field tables, one bridge

The codebase carries two catalogs simultaneously:

| Concern | Canonical (resolver-owned) | Legacy (directory-owned) |
|---|---|---|
| Definitions table | `profile_field_definitions` | `field_definitions` |
| Per-talent values | `talent_profile_field_values` | `field_values` |
| Tenant overrides | `workspace_profile_field_settings` | column on the def + `tenant_id` partitioning |
| Recommendations | `profile_field_recommendations` | n/a (keyed by `taxonomy_kind`) |
| Surface flags | `show_in_public`, `show_in_directory`, `show_in_edit_drawer`, `default_visibility[]` | `public_visible`, `profile_visible`, `card_visible`, `directory_filter_visible`, `internal_only` |
| Key style | namespaced (`physical.body_type`, `experience.years_total`) | flat (`body_type`, `years_experience`) |

The `legacy-directory-policy.ts` bridge maps the 17 flat keys in
`OLD_TO_NEW_KEY` (file: [`web/src/lib/fields/legacy-mirror.ts:28`](../src/lib/fields/legacy-mirror.ts:28))
through `effectiveFieldVisibility()` against the canonical row, then gates
the legacy row on the result. **All three public surfaces today read legacy
`field_definitions` and post-filter through this bridge.** That works for
bridged keys but leaves three classes of holes:

1. Non-bridged legacy keys (e.g. `fit_labels`, `skills`, `gender`, taxonomy
   sections) are governed entirely by their legacy-column flags.
2. The resolver's per-talent return shape carries `show_in_public` /
   `show_in_directory` already; today only the editor surfaces consume that.
3. Tenant overrides live in two places (`workspace_profile_field_settings`
   for canonical; per-row clones in `field_definitions.tenant_id` for legacy),
   and admin Fields shows the *canonical* override badge. Public surfaces
   ignore the canonical override unless the key is bridged.

The goal of this phase: route every public-surface visibility decision
through the resolver primitives. Legacy *rows* may stay (for taxonomy lookup,
sort_order, `taxonomy_kind`, `config.filter_options`) — what gets deleted is
the **policy logic** that lives in `legacy-directory-policy.ts` and
`public-profile-field-visibility.ts`.

---

## 1. Inventory — what the legacy path surfaces on each public surface

Read off the three input files plus the public profile sidebar render block
at [`web/src/app/t/[profileCode]/page.tsx:1843`](../src/app/t/[profileCode]/page.tsx:1843).

### 1.1 Directory filter sidebar — [`web/src/lib/directory/field-driven-filters.ts`](../src/lib/directory/field-driven-filters.ts)

Sourced rows: `field_definitions` where `directory_filter_visible=true AND
active=true AND archived_at IS NULL`, post-filtered to tenant
canonical-or-own rows, post-filtered through
`allowedLegacyFieldKeysForPublicSurface({ surface: "directory" })` for
bridged keys only.

| Legacy key | Status | Notes |
|---|---|---|
| `talent_type` (taxonomy_single) | **only-legacy** | top-bar facet; canonical has no row, taxonomy-only concept. |
| `height_cm` | covered | bridged → `physical.height_cm`; resolver clean swap. |
| `date_of_birth` | covered | bridged → `identity.dob`; resolver age-range derived. |
| `gender` (text + enum config) | **resolver missing** | not in `OLD_TO_NEW_KEY`; `talent_profiles.gender` column drives values, no canonical def. Needs either a canonical row OR a new "directory-virtual" allow-list (see §2). |
| `body_type`, `hair_color`, `hair_length`, `eye_color`, `clothing_size`, `shoe_size`, `experience_level`, `years_experience` | covered | all bridged; resolver clean swap. |
| `availability_status`, `available_for`, `willing_to_travel`, `travel_scope` | covered | bridged; resolver clean swap. |
| `language` (taxonomy_multi) | **only-legacy** | taxonomy-driven, no canonical def. |
| `skills`, `industries`, `event_types`, `tags`, `fit_labels` (taxonomy_multi) | **only-legacy** | taxonomy-driven, no canonical defs. |
| `location` (value_type=location) | **only-legacy** | `talent_profiles.residence_city_id` + `locations` lookup; not a per-field-value concept. |
| `config.filter_options[]` per row | **must stay in legacy** | UI-shape data (presentation, enum values for chips) lives on the legacy row's `config` JSON; resolver doesn't know about it. Read continues from legacy rows, gate from resolver. |
| `directory_filter_visible=true` | **resolver missing** | resolver has `show_in_directory`, but this column is a strictly additive *sidebar* flag (filter visibility ≠ card visibility). Phase 2 candidate. |
| `field_visibility_overrides` on the sidebar layout | covered today via `directory_sidebar_layout` table; orthogonal to resolver. | Leave alone. |

### 1.2 Directory cards — [`web/src/lib/directory/directory-card-display-catalog.ts`](../src/lib/directory/directory-card-display-catalog.ts)

Sourced rows: `field_definitions` where `archived_at IS NULL AND active AND
NOT internal_only AND public_visible AND profile_visible`, then
`card_visible=true`, then bridged-keys policy filter.

| Legacy key on card | Status | Notes |
|---|---|---|
| `fit_labels` | **only-legacy** | derived from taxonomy + roster overlay; no canonical def. |
| `height_cm` | covered | bridged; resolver `show_in_directory` is the gate. |
| `body_type`, `hair_color`, `eye_color`, `experience_level`, `years_experience` | covered | bridged. |
| `card_visible=true` | **resolver missing** | strictly additive flag — the resolver knows "show in directory" generally, but cards are a sub-surface of directory. Phase 2 candidate. |
| `sort_order` on the legacy row | **must stay in legacy** | UI ordering data lives there; resolver's `display_order` is decoupled (catalog vs card ordering can diverge). |

### 1.3 Public profile sidebar — [`web/src/lib/public-profile-field-visibility.ts`](../src/lib/public-profile-field-visibility.ts) + [`web/src/app/t/[profileCode]/page.tsx:1414`](../src/app/t/[profileCode]/page.tsx:1414)

Six hardcoded keys, each round-tripped to legacy `field_definitions`:

| Legacy key | Status | Notes |
|---|---|---|
| `fit_labels` | **only-legacy** | taxonomy-derived, no canonical def. |
| `skills` | **only-legacy** | sourced from `talent_profile_skills` / `talent_profile_taxonomy`. |
| `languages` | **only-legacy** | sourced from `talent_languages` rows. |
| `industries`, `event_types`, `tags` | **only-legacy** | taxonomy_multi, no canonical defs. |

The sidebar reads no bridged keys today; it is **100% non-bridged**, which
is why the legacy-directory-policy bridge is silent here. Migrating this
surface to the resolver requires creating either (a) canonical placeholder
rows for the six taxonomy section gates, or (b) extending the engine's
visibility primitive to cover legacy-only rows by key. See §2.

---

## 2. Resolver gap list — minimum changes

**Gap A — Public viewer not in `ResolverViewerRole`.**
`resolveTalentFields` accepts `"agency_admin" | "platform_admin" | "talent" |
"manager"`. The viewer-role union in `effective-visibility.ts` already covers
`"public" | "client"`. The resolver body never branches on `viewerRole`
today (it's pass-through; per-render gating uses `canViewerSee`). Minimum
change: widen `ResolverViewerRole` to `ResolverViewerRole | "public" |
"client"`. No behavior change to the resolver itself; only callers gain a
sanctioned spelling. The public-profile page already calls with
`viewerRole: "platform_admin"` (file: page.tsx:466) — a comment-only smell,
because the resolver doesn't use it. Switch that call to `"public"` once the
union accepts it.

**Gap B — Tenant-scoped catalog projection (no specific talent).**
The directory filter sidebar and the card catalog are **tenant-scoped, not
talent-scoped**. The resolver requires a `talentProfileId` and walks that
talent's taxonomy assignments to decide which type-specific fields apply.
For directory cards/filters we don't have one talent — we have *all
approved talent of the tenant*. The resolver as-is cannot answer "what
fields are public-visible for ANY talent in this tenant".

Two ways to close this:

- **B1 (preferred)** Add a sibling export
  `resolveTenantPublicFieldCatalog(supabase, tenantId)` in
  `resolve-talent-fields.ts` (or a new `resolve-tenant-catalog.ts` next to it)
  that returns the **canonical** defs through the same
  `getCachedTenantFieldCatalog` + `effectiveFieldVisibility` decision but
  WITHOUT roster/value-presence checks and WITHOUT taxonomy-relevance
  filtering. Universal + global + every type-specific field gated only by
  `effectiveFieldVisibility(...) === "public"` AND `show_in_public` AND (for
  directory) `show_in_directory`. Cache-aligned: same `field-catalog` tag.
- **B2** Reuse `resolveTalentFields` with a synthetic "all-talent-types"
  context. Rejected — pollutes the per-talent path with a special case.

**Gap C — Non-bridged legacy keys have no canonical row.**
`fit_labels`, `skills`, `gender`, `languages`, `industries`, `event_types`,
`tags`, `language` (multi), `talent_type`, `location` are governed by legacy
flags only. Three options:

- **C1** Create canonical placeholder rows in `profile_field_definitions`
  for each, with `kind` matching legacy (`taxonomy_multi`, `taxonomy_single`,
  `text`, `location`) and `show_in_public=true / show_in_directory=true`
  defaults. Per-tenant overrides land via the canonical
  `workspace_profile_field_settings` exactly as bridged keys do. Migration
  cost: ~10 rows + a one-time data migration + per-tenant override carry-over
  if any tenants flipped these in legacy. Required for sidebar parity.
- **C2** Extend `legacy-directory-policy` to cover *non-bridged* keys too, by
  pulling the legacy row's flags through `effectiveFieldVisibility()` against
  a synthetic `FieldDefVisibilityInput` (with `default_visibility` derived
  from `public_visible`/`profile_visible`). This is a **policy-only** swap —
  the legacy row stays, but the decision is funneled through the engine
  primitive. Cheaper, but doesn't kill `legacy-directory-policy.ts`; it just
  reshapes it.
- **C3** Hybrid — adopt C2 immediately (Phase 1.x), commit to C1 long-term
  (Phase 2+) for the rows that will outlive legacy.

**Recommendation: C3.** Phase 1.x ships C2 (the resolver helpers below dispatch
to canonical-or-legacy depending on whether a canonical row exists for the
key). Phase 2 backfills canonical rows for the seven sidebar/taxonomy keys
that have a clear semantic equivalent. Phase 3 deletes the legacy fallback.

### Proposed helper signatures

Location: **new file `web/src/lib/field-engine/public-surface-visibility.ts`**
(adjacent to `resolved-field-surfaces.ts`; same module boundary). Keeps
`resolved-field-surfaces.ts` pure (operates on a `ResolvedField`) and puts
the catalog-scope helpers somewhere they can take a `tenantId` + `supabase`
client without polluting the per-talent helper file.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Common context passed to all three. Tenant null = hub / cross-agency. */
export interface PublicSurfaceContext {
  supabase: SupabaseClient;
  tenantId: string | null;
}

/** "Is this field key allowed to appear in the directory FILTER SIDEBAR
 *  for the public viewer on this tenant?" Field is the LEGACY catalog row
 *  shape; the helper internally consults the canonical resolver for bridged
 *  keys and falls back to legacy-flag inspection (gated through
 *  `effectiveFieldVisibility`) for unbridged keys. */
export function isResolvedFieldVisibleInDirectoryFilter(
  field: { key: string; directory_filter_visible: boolean | null; active: boolean; archived_at: string | null; tenant_id: string | null; public_visible?: boolean; profile_visible?: boolean; internal_only?: boolean; },
  ctx: PublicSurfaceContext,
): Promise<boolean>;

/** "...in a DIRECTORY CARD trait line?" — adds `card_visible` + the
 *  `public_visible && profile_visible && !internal_only` predicate. */
export function isResolvedFieldVisibleOnDirectoryCard(
  field: { key: string; card_visible: boolean; active: boolean; archived_at: string | null; tenant_id: string | null; public_visible: boolean; profile_visible: boolean; internal_only: boolean; },
  ctx: PublicSurfaceContext,
): Promise<boolean>;

/** "...as a sidebar section on /t/[code]?" — the six taxonomy section gates
 *  (`fit_labels`, `skills`, `languages`, `industries`, `event_types`,
 *  `tags`). Bridged keys: route through canonical. Non-bridged: route the
 *  legacy flags through `effectiveFieldVisibility` synthetically. */
export function isResolvedFieldVisibleInPublicProfileSidebar(
  field: { key: string; active: boolean; archived_at: string | null; tenant_id: string | null; public_visible: boolean; profile_visible: boolean; internal_only: boolean; },
  ctx: PublicSurfaceContext,
): Promise<boolean>;
```

Why async + Supabase-bearing: the resolver decision for bridged keys reads
the canonical def + tenant overrides; those are not in-memory at the call
sites. Performance: a single batched lookup per tenant fronted by the
existing `getCachedTenantFieldCatalog` (already 120s revalidate, shared
across mounts). The three helpers wrap one private
`loadPublicSurfaceCatalogDecisions(ctx)` that returns a `Map<legacyKey, {
filter: boolean; card: boolean; sidebar: boolean }>` so each surface
resolves O(1) after the first call per render.

### What the helpers replace

- `allowedLegacyFieldKeysForPublicSurface(..., { surface: "directory" })` in
  `field-driven-filters.ts` and `apply-directory-field-facet-filters.ts` →
  `isResolvedFieldVisibleInDirectoryFilter(row, ctx)` (one row at a time, or
  call the batch helper).
- `allowedLegacyFieldKeysForPublicSurface(..., { surface: "directory" })` in
  `directory-card-display-catalog.ts` → `isResolvedFieldVisibleOnDirectoryCard`.
- The whole `getPublicProfileFieldVisibility()` → six calls to
  `isResolvedFieldVisibleInPublicProfileSidebar` keyed by the canonical six.
  (Or a small wrapper returning the same `PublicProfileFieldVisibility`
  shape so page.tsx render block stays unchanged.)

---

## 3. Migration order

Surface earlier = bugs surface earlier. Recommended order:

1. **Lane A1 — directory filter sidebar.** Highest-traffic public surface,
   has the richest mix of bridged + only-legacy keys (`gender`, `language`,
   `talent_type`, `location`, every physical field). If a resolver decision
   diverges from the legacy decision for any key, this is where it lights up
   in QA fastest. Add the helper + swap the two call sites in
   `field-driven-filters.ts` and `apply-directory-field-facet-filters.ts`.
2. **Lane A2 — directory cards.** Same helper module, narrower predicate
   (`card_visible` on top of `directory`). Migrating cards after filters
   means the cached catalog decision is already warm.
3. **Lane B — public profile sidebar.** Six-key swap. Lowest surface area but
   blocked on the "non-bridged keys" handling (Gap C). Migrate after A1/A2
   prove the helper module works for bridged keys; sidebar then validates the
   C2 fallback path.
4. **Phase 1.5 — cross-surface property test.** §6 below.
5. **Phase 2 — canonical placeholder rows** (Gap C1) for the seven taxonomy
   section keys.
6. **Phase 3 — delete legacy bridge** (sunset, §4).

Rationale for filters-before-cards: filters are read on every directory
page-load including faceted refines; cards are read once per page. A miss in
the filter sidebar produces an obvious "this chip vanished" smoke signal
within minutes of deploy. Card misses look like "this trait line went
away" which is more easily missed.

---

## 4. Deprecation plan — `legacy-directory-policy.ts` + `getPublicProfileFieldVisibility()`

**Shim period:** one minor deploy cycle (≈ 2 weeks from Phase 1.x merge).

| Step | Commit shape | When |
|---|---|---|
| 1 | Land `public-surface-visibility.ts` with the three helpers, plus the batched cache loader. **No call-site swap.** | Phase 1.1 |
| 2 | Swap A1 (`field-driven-filters.ts`, `apply-directory-field-facet-filters.ts`) call sites. Leave `legacy-directory-policy.ts` exporting `allowedLegacyFieldKeysForPublicSurface` but mark `@deprecated` and add an `improntaLog("legacy_directory_policy.call", ...)` so prod tells us if anything still uses it. | Phase 1.2 |
| 3 | Swap A2 (`directory-card-display-catalog.ts`). | Phase 1.3 |
| 4 | Swap Lane B (`/t/[code]/page.tsx`, delete `public-profile-field-visibility.ts`). | Phase 1.4 |
| 5 | Land cross-surface property test (Lane C). | Phase 1.5 |
| 6 | Watch `legacy_directory_policy.call` log for one week. **If zero calls in prod for 7 consecutive days, sunset.** Delete `legacy-directory-policy.ts` + `public-profile-field-visibility.ts` in a single commit. | After Phase 5 deploy + 1w |
| 7 | Phase 2 — canonical placeholder rows for the seven sidebar/taxonomy keys; helper module drops the legacy-flag fallback branch. | Phase 2 |

**Sunset target date: after Phase 5 deploy + 7-day quiet period** — concretely
once the engine-resolver telemetry confirms no remaining caller of the
deprecated bridge fires `legacy_directory_policy.call`. Hard date target:
**before 2026-07-15** if Phase 1.x lands on schedule.

---

## 5. Risk register

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R1 | **Phase 2 tenant-override coupling.** Tenants whose admins toggled legacy `card_visible=false` on a bridged key (e.g. an agency that hid `years_experience` from cards) will see the canonical visibility decision instead. Canonical visibility ignores `card_visible` today — the surface flag is filter/card-agnostic. | Medium | High (card layout regression for opted-out tenants) | Phase 1.x preserves `card_visible` AND `directory_filter_visible` as **additional** gates on top of the resolver decision. The helper module ANDs both, never replaces. Phase 2 plans formal `show_in_card` / `show_in_directory_filter` columns on canonical. |
| R2 | **Non-bridged keys behave differently between A1 (filters) and B (sidebar).** `fit_labels`, `skills`, `languages`, `industries`, `event_types`, `tags` appear on both filter sidebar AND profile sidebar — if Phase 1.x ships A before B, decisions can drift for one deploy cycle. | Low | Medium | Land all three helpers in one PR; only the call-site swaps stagger. Cross-surface property test (Phase 1.5) gates the staggered swaps. |
| R3 | **Resolver public role widening discovers latent gating.** Today no caller passes `viewerRole: "public"`; the union widening is mechanically safe but if a future contributor relies on `viewerRole` for trimming, they'll trim public differently. | Low | Low | Add an explicit `viewerRole === "public"` no-op branch in the resolver with a comment ("pass-through; per-render gating happens in `canViewerSee`"). |
| R4 | **`gender` is column-backed, not value-backed.** The directory filter pulls `gender` values from `talent_profiles.gender`, not `field_values`. If the helper falls back to canonical and canonical doesn't know `gender` exists, the chip will vanish. | High (if not handled) | High (gender filter is the single most-used facet) | Add `gender` to the non-bridged-but-permitted allow-list inside `public-surface-visibility.ts`. Don't rely on `OLD_TO_NEW_KEY` for `gender` — wire it explicitly. |
| R5 | **`talent_type` is the top-bar facet, not a sidebar facet.** Sidebar layout already excludes it via `top_bar_facet_key`. If the new helper allows `talent_type` in `isResolvedFieldVisibleInDirectoryFilter`, the sidebar logic still strips it via `buildDirectoryFilterBlocks`. | Low | Low | No change needed — separation of concerns is sound. Test asserts `talent_type` is `true` from the helper but never lands in the rendered sidebar block. |
| R6 | **Cache invalidation drift.** The resolver caches under `CACHE_TAG_FIELD_CATALOG` + `fieldCatalogTagForTenant`. Directory caches under `CACHE_TAG_DIRECTORY` + `CACHE_TAG_TAXONOMY`. After the swap, a tenant admin who toggles a canonical field-visibility override won't bust the directory cache. | Medium | Medium | The new loader inside `public-surface-visibility.ts` MUST tag with both `CACHE_TAG_FIELD_CATALOG` and `CACHE_TAG_DIRECTORY`. Confirm in PR. |
| R7 | **Service-role-vs-anon read coverage.** Today `field-driven-filters.ts` already falls back from anon to service role for `internal_only=true` rows. The resolver's `getCachedTenantFieldCatalog` uses service role unconditionally. After swap, anon-blocked legacy reads disappear — but only for bridged keys. | Low | Low | Audit confirmed: the resolver path uses service role, so the anon-fallback dance becomes a no-op for the canonical decision. Leave the legacy anon-fallback in place until Phase 3 deletion. |
| R8 | **Tenant override migration parity** (called out by the task as Phase 2 coupling). Bridged keys: a tenant override is honored via canonical `workspace_profile_field_settings`. Non-bridged keys today only have legacy per-row tenant clones. The C2 fallback path inside the new helper reads the legacy clone for non-bridged keys. **If Phase 2 backfills canonical rows for the seven sidebar keys WITHOUT also backfilling tenant overrides, every tenant who customized those keys regresses to canonical defaults.** | High at Phase 2 | High | Phase 2 backfill MUST include override-row carry-over per tenant. Add a smoke check before flipping the fallback off. |

---

## 6. Phase 1.5 — cross-surface property test plan

Location: `web/src/lib/field-engine/public-surface-visibility.test.ts` (new file).

### 6.1 Invariants

For every (legacy field row, tenant, viewer="public") tuple, the three
helpers must obey:

1. **Public-floor.** If `effectiveFieldVisibility(canonical, tenantOverride)
   !== "public"` for the bridged equivalent (when one exists), all three
   helpers return `false`. Platform `admin_only` / `is_sensitive` rows can
   never escape to public.
2. **Surface monotonicity.** `card => filter` and `card => sidebar` need
   not hold (cards and filters are independent sub-surfaces). But
   **`filter => directory-allowed`** and **`card => directory-allowed`**
   must hold — neither sub-surface can light up if the broader directory
   surface is off.
3. **Profile-sidebar requires public-profile.** If the canonical row's
   `show_in_public` is false (or its visibility is `admin`/`hidden`), the
   sidebar helper returns `false` regardless of legacy `profile_visible`.
4. **Active + non-archived.** All three helpers return `false` for
   `active=false` OR `archived_at NOT NULL`.
5. **Internal-only is always hidden.** `internal_only=true` ⇒ all three
   helpers `false`. (Override for sidebar layout flags doesn't count.)
6. **Tenant scoping.** A legacy row with `tenant_id=X` is invisible to
   tenant Y's surfaces. A canonical row with `tenant_id=null` is visible to
   every tenant (modulo per-tenant override).
7. **Bridged-key parity.** For every key in `OLD_TO_NEW_KEY`, the helper's
   decision must equal the result of running the old
   `allowedLegacyFieldKeysForPublicSurface(..., { surface })` against the
   same fixture (golden-file comparison).
8. **Non-bridged keys are decided by legacy flags through
   `effectiveFieldVisibility`.** A synthetic `FieldDefVisibilityInput`
   constructed from `{ default_visibility: public_visible ? ["public"] :
   [], show_in_public: public_visible, admin_only: false, is_sensitive:
   internal_only }` must yield `"public"` for the helper to return `true`.

### 6.2 Fixtures needed

- **F1 — bridged field, public + directory + card eligible.** `height_cm` legacy
  row with `directory_filter_visible=true`, `card_visible=true`,
  `public_visible=true`, `profile_visible=true`, and canonical
  `physical.height_cm` with `show_in_public=true`, `show_in_directory=true`,
  `default_visibility=["public","agency"]`. Tenant override absent.
  Expected: all three helpers `true`.
- **F2 — bridged field, tenant restricted to admin.** Same legacy row, but
  the tenant has `workspace_profile_field_settings.show_in_public_override=
  false`. Expected: all three helpers `false`.
- **F3 — bridged field with platform `admin_only=true`.** `years_experience`
  marked sensitive on canonical. Expected: all three `false`, regardless
  of legacy flags.
- **F4 — non-bridged taxonomy sidebar key, default eligible.** `fit_labels`
  legacy row with `public_visible=true`, `profile_visible=true`,
  `internal_only=false`, no tenant clone. Expected: sidebar `true`, card
  `true` (it's a card trait), filter `false` (not flagged
  `directory_filter_visible`).
- **F5 — non-bridged taxonomy filter key.** `language` legacy row with
  `directory_filter_visible=true`. Expected: filter `true`, card depends on
  `card_visible`, sidebar depends on `profile_visible`.
- **F6 — gender column-backed key.** `gender` legacy row with
  `directory_filter_visible=true`, `value_type="text"`,
  `config.filter_options=["male","female","non_binary"]`. Expected: filter
  `true` via the explicit gender allow-list, card per `card_visible`,
  sidebar `false` (no sidebar render for gender).
- **F7 — internal_only row.** Any key with `internal_only=true`. Expected:
  all three `false`.
- **F8 — archived legacy row.** `archived_at NOT NULL`. Expected: all three
  `false`.
- **F9 — tenant clone overrides canonical.** Legacy row with
  `tenant_id=X, card_visible=false`. Expected: card helper returns `false`
  for tenant X even if canonical bridged equivalent is `show_in_directory=
  true`. (Risk R1.)
- **F10 — golden parity table.** For each of the 17 bridged keys, snapshot
  the `allowedLegacyFieldKeysForPublicSurface(..., { surface: "directory" })`
  output and assert the new helper agrees.

### 6.3 Test shape

Node-test (matches `resolved-field-surfaces.test.ts`). The helper's external
dependency (supabase) is faked with a minimal in-memory client returning the
fixtures above. Property tests use a small generator (12 random
permutations of the boolean flags + canonical override fields) to assert
invariants 1–6 hold in bulk. Invariants 7–8 are golden-file table tests.

---

## 7. Lane split

The task's proposed split holds with one refinement.

**Lane A — directory filters + cards.** Files touched:
- new `web/src/lib/field-engine/public-surface-visibility.ts`
- `web/src/lib/directory/field-driven-filters.ts` (call site swap, ~3 lines)
- `web/src/lib/directory/apply-directory-field-facet-filters.ts` (call site swap, ~6 lines)
- `web/src/lib/directory/directory-card-display-catalog.ts` (call site swap, ~10 lines)

**Lane B — public profile sidebar.** Files touched:
- `web/src/lib/field-engine/public-surface-visibility.ts` (shared with Lane A — coordinate)
- `web/src/lib/public-profile-field-visibility.ts` (delete or shrink to a thin re-export wrapper)
- `web/src/app/t/[profileCode]/page.tsx` (one import swap + one call site at line 1414)

**Lane C — cross-surface visibility tests.** Files touched:
- `web/src/lib/field-engine/public-surface-visibility.test.ts` (new)
- optionally: fixture file `web/src/lib/field-engine/__fixtures__/public-surface-cases.ts`

**Shared file conflicts to watch:**
- `web/src/lib/field-engine/public-surface-visibility.ts` is touched by all
  three lanes. Sequence: **Lane A lands the file in its first PR.** Lane B
  rebases onto Lane A. Lane C consumes the public exports without
  modifying the implementation.
- `web/src/lib/field-engine/resolve-talent-fields.ts` ResolverViewerRole
  widening (Gap A): single-line change, ship it in Lane A's PR so Lane B's
  page-tsx switch to `viewerRole: "public"` compiles.
- `web/src/app/t/[profileCode]/page.tsx` is touched by Lane B only, but the
  same file already calls `resolveTalentFields` with
  `viewerRole: "platform_admin"` at line 466. Lane B should flip that to
  `"public"` in the same commit that swaps the sidebar helper, for honesty.

**Recommended PR cadence:** A1 (filter sidebar) → A2 (cards) → B (sidebar) →
C (tests). Each lands separately to keep blast-radius narrow; the prior
deprecation logging gives ops a kill-switch metric per step.

---

## 8. Open questions for the user

1. **Phase 2 canonical placeholders.** Do you want canonical rows for the
   seven non-bridged sidebar/filter keys (`fit_labels`, `skills`,
   `languages`, `industries`, `event_types`, `tags`, plus `gender`), or do
   you prefer to leave them legacy-resident permanently? C3 (hybrid) is the
   default unless you say otherwise.
2. **Sunset window.** Is "Phase 5 deploy + 7 quiet days" acceptable as the
   delete-the-bridge trigger, or do you want a fixed calendar date?
3. **Directory-filter helper async vs sync.** The helpers are proposed as
   async because the resolver decision is async. If you prefer the helpers
   to be sync over a pre-loaded `Map`, the lane-A call sites become two
   helpers each: one batch-loader call + one sync predicate per row. Slight
   code-shape preference; no perf delta.
