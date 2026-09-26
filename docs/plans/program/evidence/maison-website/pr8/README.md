# Maison website — PR 8 evidence

**Branch:** `cursor/maison-pr8-live-options-8b57`  
**Closes:** W67–W71, W73–W74 (architecture + tests)  
**Base:** `96c1838e1` (PR7 custom colors #2327)

## Delivered

| W | Work | Proof |
|---|---|---|
| W67 | Live design actions write `pending_design` only | `applyMaisonDesignAction` → `kind: live_pending` / `colors_only`; no draft tree writes |
| W68 | Colors-only one Publish new colors step | `PublishColorsDialog` + detail → `publishMaxSiteAction` |
| W69 | Design options sheet | `DesignOptionsPanel` reset / reapply / discard / undo import / restore |
| W70 | Restore → draft, never live-direct | `restoreMaisonDesignRevisionAction` + review force |
| W71 | Preview fail copy | `ThemeGalleryPreviewFrame` Maison props: "Your choices are saved. Try again." |
| W73 | Discard only when unpublished pending | `canDiscard` / idle row without dead button |
| W74 | Reset colors + Reapply demo layout | `resetMaisonColorsAction` / `reapplyMaisonDemoLayoutAction` (draft Undo or live pending) |

Materialize: `materializeMaisonLivePendingIfAny` runs inside `publishMaxSiteAction` before bake.

## Flag

All paths require `TALENT_MAISON_THEME_ENABLED`. Flag-off → host null (prod unchanged).

## Out of scope

- Journeys e2e → **PR 9**
- Visual pixel match → **BLOCKED** (no owner PDF/prototype)

## Gates

- `npm run typecheck && npm run lint`
- Unit: `maison-pending-design.test.ts`, `maison-setup.static.test.ts`

## Migrations

None — uses PR1 `pending_design` + existing `talent_site_revisions`.
