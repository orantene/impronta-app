# Impronta — Unified Card System + Editorial-Noir Directory Redesign
### Execution plan · 2026-06-22 · derived from the 9-subsystem audit (wf_25913283) + architecture judge-panel & adversarial review (wf_6150fbfa)

## Goal
One agency admin changes talent-card design **once** and it syncs to **every** surface, plus the whole directory is redesigned to Impronta's `editorial-noir` look. Today there are **7 forked card renderers across 3 data pipelines and 3 token systems**, and the "canonical" card is unplugged from the design system, so a card-design change is impossible.

## The keystone bug (the free unlock)
`DirectoryCard.tsx` tags `data-card-*` parts but **never emits `className="talent-card"`** on its root. The entire `token-presets.css` `.talent-card` token family and the `directory.card.*` admin tokens are therefore silent no-ops. Emitting that one class — on ONE canonical card — un-deadens ~58 tokens of cascade for free. Every architecture model needs this fix; it is the foundation.

## Architecture decision: A (spine) + D (kits) + C (scoped resolver)
- **Model A spine** — extend the existing 4-layer token cascade on `agency_branding.theme_json` via the live `design.ts` lifecycle (`saveDesignDraft` / `applyThemePreset` / `publishDesign` → `bustDesignTags`). No new column, no new server action, never touches `talent_pages.theme.__design`. The 3 tenant-host storefront surfaces repaint instantly as a pure CSS-var swap on the next request after publish.
- **Graft D — one-click "kits"** — a kit is a **named subset** of card-family token keys written through the existing `applyThemePreset`, so "Editorial Noir" sets only `card.*` + `template.directory-card-family` and never stomps the tenant's chosen canvas. `editorial-noir` already exists as a preset (`theme-presets.ts:446`). Makes "redesign the whole directory sexy" a one-click action, not a migration.
- **Graft C — `resolveCardDesign()` scoped to the 2 surfaces the CSS cascade structurally cannot reach**: the cross-tenant marketing grid and the client dashboard shells (they carry a `tenantId` but have no token-projecting `<html>` ancestor). A cached, per-row/per-tenant server resolver reads `card.*` at request time (no matview lag on the design dimension) and is threaded as a serializable prop; a CI wiring-test asserts each surface receives it.
- **Color stays on the live cascade** (`var(--token-color-*)`) — kits carry only layout/show-flag/family tokens, so a theme change recolors all cards with zero card-design write, avoiding a parallel color store.

**Rejected:** Model B (builder component-default only — the directory card is a `section_embed` child rendered outside `renderBuilderNode`, so `applyComponentStyleDefaults` never runs on it → a second silent no-op). Pure Model C as spine (new jsonb + resolver on the hottest grid = too much footgun for v1).

## Card token family (registry additions)
Extend `template.directory-card-family` enum (add `editorial-noir | magazine | minimal-portrait`) and add: `card.surface`, `card.name-font`, `card.name-color`, `card.aspect`, `card.radius`, `card.scrim-strength`, `card.image-treatment`, `card.hover`, `card.info-density`, `card.show-availability/type/badges`. Re-home the existing `directory.card.specialty-chips-max` / `show-destination-ready-ribbon` / `show-starting-from-price`.

> **Pinned rule (resolves the empty-default white-paint trap):** `card.surface` and `card.name-color` use validator `hexColorOrEmpty` + `defaultValue ""` (empty = follow `background.mode`, exactly like `color.background:140`). A non-empty default would project an inline `<html>` var that beats the editorial-noir family CSS.

## Canonical card contract
- **`web/src/components/talent-cards/TalentCard.tsx`** — ONE pure, server-safe, prop-driven card. Emits `className` containing `talent-card` + the full `data-card-*` hook set; reads only `--token-card-*` / `--token-color-*` vars. No-photo fallback = editorial monogram (serif name, hairline frame), **never initials-in-a-box**. `DirectoryCard.tsx` becomes a thin re-export.
- **`web/src/components/talent-cards/talent-card-shape.ts`** — plain-types home (no `use server`/`use client`). `CanonicalTalentCardData` is a **true superset** (incl. `availabilityDots14d`, `nextAvailableDate`, `agencyTenantId`, `homeLat/Lng`, `fitLabels`, `cardAttributes`, secondary type, languages) so no surface loses data.
- **Escape hatches** (for the client shells): `rootMode` (link vs button-opens-drawer), `availabilitySlot` (14-day strip), `secondarySlot`, `selectionState` (shortlist ✓). Interactivity stays in client adapter wrappers (the `DirectoryCardAdapter` + `TalentCardActions` pattern).
- **cardStyle**: widen to the full `DirectoryV1` union; `portrait`/`editorial` are the two real renders, the other 5 safely fall through to portrait (documented), kits supply the actual look.

## Phases (review fixes folded in)

### Phase 1 — Canonical card + keystone class, wired to the 3 storefront surfaces (SERIAL SPINE, one PR)
- Create `TalentCard.tsx` + `talent-card-shape.ts` + adapters (the keystone `talent-card` class lives **here only**).
- Re-point S1 (page-builder directory section via `DirectoryCardAdapter`) and S2 (live `/directory` grid — today a **different** component `components/directory/talent-card.tsx` behind `directory-infinite.tsx:449`, which also carries the AI drawer → rewrite to a thin adapter, do not delete).
- Collapse the two homepage featured renderers (`FeaturedTalentCard` + the thin `AgencyHomeStorefront` fallback) via a `featuredDtoToCanonicalCard` adapter.
- Add base `.talent-card` CSS (classic default) reading the new vars. **No registry token yet** (keeps the projection fence green; tokens land in P2).
- **Do NOT touch the client shells in P1** (moved to P3 with the resolver).
- **Gate:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (0 errors, not OOM) + lint + `verify:server-actions` + a unit test asserting `talent-card` class in both render branches, added to a **gated** `tsx --test` lane in `ci.yml` (+ `check:ci-lane-parity`).

### Phase 2 — Workspace-admin "Card Design" panel (reuses the existing stub route)
- Build out `app/(workspace)/[tenantSlug]/admin/website/card-design/page.tsx` (today a 499-byte stub): LEFT = 3 kit tiles + a knob row over `card.*`; RIGHT = live preview rendering the **canonical** card against a real talent via `loadTalentCardThumbs`. Gate on `agency.site_admin.design.edit/.publish`. Admin chrome stays **neutral/cool — no gold/rust** (gold appears only inside the preview pane).
- Extend `tokens/registry.ts` (the new `card.*` specs) **in the same PR as / before** the kit definitions (`applyThemePreset`'s forgiving merge silently drops registry-unknown keys).
- New `presets/card-kits.ts` (card-scoped subsets only).
- Writes ride the existing lifecycle: kit-pick → `applyThemePreset`; knob edit → `saveDesignDraft`. Explicit async state: "Draft saved (vN)", persistent Publish, revisions list + Restore.
- Append `card-design` to the closed `SITE_ADMIN_SURFACE` tuple in `cache-tags.ts`.
- **Gate:** tsc + lint + `verify:server-actions` (`applyCardKit` is `export async`; types live in shape files) + `validateAllCardKits`.

### Phase 3 — Editorial-noir redesign + the 2 non-cascade surfaces + data-parity cleanup
- Add `html[data-token-template-directory-card-family='editorial-noir'|'magazine'|'minimal-portrait'] .talent-card` CSS blocks; amend the editorial-noir preset; de-hardcode the keystone colors. (Confirm Impronta is the only tenant on that slug before flipping its family.)
- Redesign the `/directory` page chrome (header/filter rail/grid rhythm/empty frame) to the `impronta-home-2026.html` register — token-driven, **zero `impronta` literals**.
- **Thumbnail-fork fix:** route the canonical face through shared `loadTalentCardThumbs` (rank `card>hero>watermarked>gallery>original`); **chunk the id-set into 450-windows** in `fetch-directory-page.ts` before the call (the shared helper does not chunk internally).
- **Marketing (cross-tenant):** new `card-design-resolver.ts`; resolve **per-row** from `item.agencyTenantId` (no single tenantId — this was a flagged blocker), each `unstable_cache`-tagged `tagFor(thatTenant,'branding'/'card-design')`; migrate off `--plt-*` onto the canonical card.
- **Client shells:** implement the 4 escape hatches; thread `cardDesign` as a server→client prop fetched in each `page.tsx` data bridge. A `card-design-wiring.test.ts` string-scans the 4 files to assert the prop is received (the named single-point-of-failure seam).
- **Migration (the only one, decoupled):** `./supabase/migrations/<UTCstamp>_card_surface_rls_drift_and_dead_rpc.sql` (repo root, **not** `web/supabase/migrations`): align `talent_has_public_roster` to include `talent_site_hidden=false`; `DROP` the dead anon-granted `api_directory_cards` RPC (0 callers verified). `db:check` → `db:push` before merge.
- **Gate:** tsc + lint + `verify:server-actions` + `test:builder` + per-tenant marketing re-render test + >450-id chunking parity test + hero-only thumbnail test.

### Phase 4 — Activate inert directory knobs + plan-gating
- New `scope-seed.ts`: resolve `talentTypeKeys → term ids`, pass `seedTaxonomyTermIds` so `by_talent_type`/`manual` scope pre-filters the SSR seed; **delete dead `fetch.ts`** (`loadDirectorySectionTalents`, verified 0 callers).
- Thread the real knobs (`showSave`/`showAddToInquiry`/`showAttributes`/`cardFieldKeys`/`maxFieldLines`/sidebar*) into the live render; **disable** genuinely-unbuilt ones in the Editor as "(coming soon)" — no silent no-ops.
- Render the already-fetched `fitLabels`/`cardAttributes` as a restrained editorial trait row.
- Plan-gating `Free=5 / Studio=1 / Agency=full` reusing the `resolveTenantFeaturedLimitCap` / `resolvePublicRosterDisplayCap` pattern.
- **Gate:** tsc + lint + `grep loadDirectorySectionTalents == 0` before deleting `fetch.ts` + `test:builder`.

## Sequencing & rollout
- **Serial spine:** P1 canonical card lands first (every later phase imports it). P2 registry tokens precede any kit. P3 CSS families depend on P2 projection.
- **Worktree isolation** off latest `main` per lane (never the shared `feat/bl10-p5` checkout). One migration timestamp, minted at lane start.
- **Fork-deletion only after** the canonical is live and QA-proven per surface behind the green class test. `DirectoryCard.tsx` → thin re-export (not deleted); `components/directory/talent-card.tsx` → thin adapter (keeps the AI drawer).
- Editorial-noir as Impronta's default is applied as **data** (`applyThemePreset` + `publishDesign`), not a deploy.

## Open decisions (owner) — defaults I'll use unless told otherwise
1. **Plan-cap boundary:** `/api/directory` has no public-cap param, so Free=5 is client-side only (a user could hit the API past 5). *Default: client-side cap for v1, flag a follow-up to add an engine param.*
2. **cardStyle 7→2 collapse:** the 5 extra styles already collapse to portrait. *Default: keep 2 real renders + document; kits carry the look.*
3. **Marketing data-lag:** design syncs request-time-fresh, but `trust_tier`/availability stay ~15-min stale (pre-existing matview). *Default: acceptable for v1.*
4. **Per-instance card override:** adds a `section_embed`/publish-snapshot footgun. *Default: defer — ship the global admin default (the actual ask); revisit per-instance later.*
5. **Orphaned `CardDesignStudio*.tsx`** under `components/admin/shell/internal/page-modules/`: route doesn't render them. *Default: ignore/delete, build the new view.*

## CI lanes to add (or they silently never gate)
`canonical-card-class`, `card-tokens-projected`, `talent-card-token-projection`, `card-design-wiring` → add explicit `ci.yml` steps + `test:*` scripts; run `check:ci-lane-parity`.
