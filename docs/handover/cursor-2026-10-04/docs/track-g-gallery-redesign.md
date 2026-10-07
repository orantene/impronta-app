# Track G — Gallery redesign (queued)

**Status:** Queued. Start only after Tracks A–F each have a PR open. Last priority.

**Audit:** [design-gallery-audit-2026-10-02.md](./design-gallery-audit-2026-10-02.md) (47 findings + 4-wave redesign)

## Goal

Design gallery, “Elige un diseño”, Mi presencia, colours sheet, and apps flow feel like a modern 2026 app — the WOW moment of onboarding.

## Binding design rules

- Icons, imagery, and flow; few words. Explanations only behind ⓘ tooltips, never paragraphs.
- ONE solid primary action per screen. Everything else quiet: light segmented controls, thin ring or tick for selection. No stacked black blocks, no “Cerrar” text links (one exit pattern: ← or ✕), no raw hex fields.
- Demo cards read like profiles: photo, name, trade, city, ES/EN, booking mode, app badges.
- No dead ends: apps ↔ templates both ways, suggested apps + “all apps”, always a next step and a way back.
- Same components across Mi presencia → library → gallery → apps.
- EN + ES (Mexican, tú), no em dashes, design tokens only.

## Scope boundaries

- Talent surfaces only. Never touch agency Studio builder or agency starters.
- Do **not** change theme designs, theme release/sync, or the theme editor (Template Factory owns those). Only gallery/picker/presence UI around them.
- Nail Designer app UI: port owner’s design 1:1, never redraw.
- Don’t drop any existing function; redesign, don’t strip.

## Execution

- One worktree + branch per wave (`feat/gallery-wave-1` … `4`) off latest `origin/main`.
- Waves 1 and 2 can run in parallel if different files; 3 and 4 after.
- Gates per PR: `cd web && NODE_OPTIONS=--max-old-space-size=11264 npm run typecheck && npm run lint`, plus test lanes files touch. File-size budgets: extract, never grow.
- QA on `localhost:3001` only (Oran runs the server; agents do not start servers) as TAL-93900 and Valeria TAL-93901 (Free). Phone 390px + desktop, ES and EN.
- Before/after screenshots for every finding ID in `docs/finish-line-2026-10-02/gallery/` (repo path).
- Merge lane: one PR at a time; wait for main green + production pointer before the next.

## Report per wave

PR #, finding IDs closed, screenshots, anything left open.

## Gate to start

All of Tracks A–F have open PRs. Then spawn wave workers (1∥2, then 3, then 4).
