# Maison website — PR 4 evidence

**Branch:** `cursor/maison-pr4-choose-design-1225`  
**Closes:** W24–W34, W75 (architecture + tests)  
**Base:** `ec1ebe556` (PR3 W17–W23)

## Delivered

| W | Work | Proof |
|---|---|---|
| W24 | Choose a design (`cr_gallery`) | `maison-setup/ChooseDesignScreen.tsx` |
| W25 | Theme card + live Maison preview | iframe via `useThemePreview` → `/template-preview/maison` |
| W26 | Tags style outlined / layout filled | `MaisonTagChips` + static test |
| W27 | Theme detail desktop layout | `ThemeDetailScreen` md+ top bar + 360px panel |
| W28 | Theme detail phone layout | compact header + bottom bar; device widths via CSS |
| W29 | Demo strip (1 demo) | `data-maison-demo-strip` |
| W30 | Segmented Demo \| My content | `maison-mode-demo` / `maison-mode-mine` |
| W31 | Five palette swatches + Custom colors entry | `MAISON_PALETTE_ORDER` + custom entry (editor = PR7) |
| W32 | Status words Preview / Choices saved / … | `maison-status-word` + choices state |
| W33 | Choices persist; reopen resumes | `maison-choices.ts` localStorage + tests |
| W34 | Phone bottom sheets; one at a time | single `phoneSheet` field |
| W75 | No search/filters | comment + static test; no search input |

## Flag

`loadMaisonSetupBootstrapAction` → `{ enabled: false }` unless `TALENT_MAISON_THEME_ENABLED` and `personalSiteEdit`. Host returns null → `/talent/site` gallery path unchanged when flag off.

## Out of scope (later PRs)

- W35–W43 Use this design / Review / Publish → **PR 5**
- Import / Custom colors editors → PR 6 / PR 7
- Visual 1440 / 390 pixel match → **BLOCKED** (no owner PDF/prototype)

## Gates

- `npm run typecheck`
- `npm run lint`
- `npm run test:builder` (or maison-setup unit + size ratchet if builder N/A)
- Unit: `maison-choices.test.ts`, `maison-setup.static.test.ts`

## Migrations

None in PR 4.
