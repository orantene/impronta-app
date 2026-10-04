# Maison website — PR 7 evidence

**Branch:** `cursor/maison-pr7-custom-colors-8b57`  
**Closes:** W60–W66 (architecture + tests)  
**Base:** `b0ddf0347` (PR6 Import #2326)

## Delivered

| W | Work | Proof |
|---|---|---|
| W60 | Four-field editor (page / text / accent / section) | `CustomColorsPanel` + `maison-custom-palette.ts` |
| W61 | Live preview on hex change | `onPreviewFields` → `preview.sendTokens` |
| W62 | Contrast advisory 4.5 / 3 (never blocking) | `evaluateMaisonCustomContrast` + advisory UI |
| W63 | Suggestion preview before apply | Preview suggestion → Use this adjustment / Keep my color |
| W64 | Save as My colors (renameable) | joins palette row; choices persist |
| W65 | Phone keyboard strip for hex fields | `data-maison-kbd` + kbd strip + `enterKeyHint=done` |
| W66 | Chef review summary | `Maison · My colors · Your content` via `buildSummaryLine` |

## Flag

All paths require `TALENT_MAISON_THEME_ENABLED`. Flag-off → host null (prod unchanged). Contrast check is **advisory** (owner ruling 2 / A10).

## Out of scope

- Live `pending_design` / Design options / restore → **PR 8**
- Journeys e2e → **PR 9**
- Visual pixel match → **BLOCKED** (no owner PDF/prototype)

## Gates

- `npm run typecheck && npm run lint`
- Unit: `maison-custom-palette.test.ts`, `maison-choices.test.ts`, `maison-setup.static.test.ts`

## Migrations

None — uses PR1 `talent_sites.custom_palette` jsonb.
