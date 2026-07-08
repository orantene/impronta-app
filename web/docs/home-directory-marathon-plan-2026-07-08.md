# Home + Directory Design Marathon — Master Plan (2026-07-08)

Autonomous multi-phase redesign of the Impronta **home page**, **directory**, **talent
cards**, **directory filters**, and the **agency-owner admin controls** (Card Design Studio +
directory section editor). Run by one orchestrator (me) managing Sonnet/Opus subagents with
QA + iterative design-study rounds. No user questions; self-approved; audited at the end.

- **Branch:** `feat/home-directory-marathon` off `origin/main` (84fbc36c6)
- **Worktree:** `/Users/oranpersonal/Desktop/impronta-marathon` (isolated; node_modules symlinked; `.env.local` copied)
- **Dev server (QA):** `dev:webpack` on `:3200`; proxy `scripts/marathon-proxy.mjs 3210 impronta.lvh.me 3200` → host `impronta.lvh.me`
- **QA method:** `preview_eval` / `preview_inspect` (computed styles + DOM geometry via `preview_resize` to a real viewport). Raster screenshots are DENIED this session, so design study = measured DOM/CSS, not pixels.
- **Gate before every commit:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` (in `web/`).
- **Prod-data guardrail:** localhost dev talks to **prod Supabase**. Do NOT overwrite the live `published_homepage_snapshot`. Home improvements ship as CODE (section components, tokens, CSS) + a *ready-to-apply* re-authoring package — never an autonomous prod-tree write.

## Scope truth (from the 7-agent audit)
Scores today — Home 7/6, Directory 6/5, Filters —/6, Cards 4/3 (design/control, /10).
Decisive facts: Card Design Studio styling is **preview-only (persists nothing)**; `density:compact`
+ `hoverBehavior:reveal_traits` are **plumbed but dead**; filter chrome is **hardcoded white-on-dark**
over a light default theme; `classic` card family has **zero CSS**; `directory_sidebar_layout` is a
**singleton** (`CHECK id=1`) so only Impronta can save filter config; the clean `DirectoryCard.tsx`
already exists and honors admin flags.

---

## PHASE 1 — Current-tools code wins (no engine changes). Ship straight to prod.
- **P1-T1 (B1)** Real `classic`-family card CSS driven by tokens (kill hardcoded noir; tighter radius/padding; cap overlay badges). Files: `web/src/app/token-presets.css` (mirror the `editorial-bridal` block).
- **P1-T2 (B3)** Fix mixed-theme filter chrome: swap `text-white`/`border-white/15`/`bg-zinc-9xx` → `text-foreground`/`text-muted-foreground`/`border-border`/`bg-card`. Files: `directory-results-toolbar.tsx`, `directory-talent-type-bar.tsx`, `directory-sort.tsx`, `directory-filters-sidebar.tsx`.
- **P1-T3 (B11)** De-gold the sidebar selected-states → neutral/accent tokens. File: `directory-filters-sidebar.tsx`.
- **P1-T4 (B2)** Make `density=compact` real: `gridClassFor` gap branch + `DirectoryCard` padding/line trims. Files: `DirectoryReactiveGrid.tsx`, `DirectoryCard.tsx`.
- **P1-T5 (B10)** Token-wire the frozen roster/featured section (replace `--tt-gold:#c9a227` / `#080807` / `!important` with `--token-color-*`). Files: `token-presets.css`, `featured-talent.css`.
- **P1-T6 (B7)** Surface the already-persisting card tokens (`specialty-chips-max`, `show-starting-from-price`, `show-destination-ready-ribbon`) as real toggles in Card Design Studio. File: `CardDesignStudio.tsx`.
- **P1-T7 (B8)** Surface `template.directory-card-family` as a one-click card-style picker in the Studio (needs T1). File: `CardDesignStudio.tsx`.
- **P1-T8 (home code)** Improve the section components the live home tree uses without re-authoring the tree: carousel/hero scrim + min-height + motion defaults; harden stat/marker rendering. Files: `sections/*` used by home + `globals.css`.

## PHASE 2 — Make the Studio honest (medium core).
- **P2-T1 (C2)** Add card-scoped tokens: `directory.card.aspect/-density/-surface/-border/-radius/-text/-scrim/-show-availability/-show-ownership` to `registry.ts` + projection in `resolve.ts` + `.talent-card` rules in `token-presets.css`. Point Studio setters at them.
- **P2-T2 (D)** Replace the hand-built `PreviewCard` mock with the real `<DirectoryCard>`/`<TalentCard>` inside a draft-token-projecting wrapper. File: `CardDesignStudio-2.tsx`.
- **P2-T3 (C4/C5)** Token-driven aspect; implement `reveal_traits` + `density` consumers in the renderer. Files: `DirectoryCard.tsx`, `DirectoryReactiveGrid.tsx`.
- **P2-T4 (C3)** Move INQUIRE inside the media overlay (hover-reveal / always-on touch) — the true compact one-click card. File: `DirectoryCardAdapter.tsx`.

## PHASE 3 — Filter sync completeness (one migration).
- **P3-T1 (C6)** Migration: drop the `directory_sidebar_layout` singleton (`CHECK id=1`), make `tenant_id` the PK; relax the UPDATE-then-INSERT workaround. File: new `supabase/migrations/*`, `directory-catalogs.ts`. Run `npm run db:push` before merge (per CLAUDE.md). *Applied only after review.*
- **P3-T2** Facet-value curation surface (merge/rename noisy duplicates) — spec first; implement if in budget.

## PHASE 4 — The big lever (gated, do last).
- **P4-T1 (C1)** Let home/directory system pages use the full freeform style model (or compose from `section_embed` in a freeform root). High effort; deferrable.

## Compact modern card — target spec (D)
Single element: full-bleed portrait at a token aspect (default 4:5) → serif monogram fallback →
token scrim over the caption zone only → name (display serif) + `type · location` → availability
OFF by default → trust + favorite badges (cap total) → **one** INQUIRE action inside the media
(hover-reveal / always-on touch) → compact density trims padding + name size + grid gap →
`surface/-border/-radius/-text` tokens so it follows the tenant theme (light or dark).

## Execution loop per task
implement (agent, absolute paths in this worktree) → tsc+lint gate → QA on :3210 via measured DOM/CSS
→ design-study agent scores it vs spec → iterate until pass → commit. After all phases: full audit +
revision rounds until home + directory hit the bar.

## Progress log
- 2026-07-08: Worktree + dev server + proxy + plan created. Starting Phase 1.
