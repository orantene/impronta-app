# Maison website — PR 5 evidence

**Branch:** `cursor/maison-pr5-apply-review-8b57`  
**Closes:** W35–W43, W72, W76 (architecture + tests)  
**Base:** `c93254d11` (PR4 W24–W34, W75)

## Delivered

| W | Work | Proof |
|---|---|---|
| W35 | Use this design → draft apply, no confirm | `applyMaisonDesignAction` + `ThemeDetailScreen` |
| W36 | Undo restores previous draft | `pending_design.previous` + `undoMaisonDesignAction` |
| W37 | Review: Ready to publish | `ReviewWebsiteScreen` + `evaluateMaisonPublishReadiness` |
| W38 | Named blockers + fix links | `no_slug` / `no_design` rows with hrefs |
| W39 | Publish → live URL | Review → `publishMaxSiteAction` |
| W40 | My website card | `MyWebsiteCard` Live · View / Change / Design options |
| W41 | Design version on publish | `writeMaisonDesignPublishedRevision` → `talent_site_revisions` |
| W42 | Publish failure + Try again + code | Review + manager banners (`data-error-code`) |
| W43 | Header Website live | existing `websiteRewardState` when `status=published` |
| W72 | No trial / plan / price | Review `sr-only` + static assert |
| W76 | Publish refuses on blockers | `readiness_blocked` when Maison flag on |

## Flag

All Maison apply/review loaders require `TALENT_MAISON_THEME_ENABLED`.  
`publishMaxSiteAction` readiness gate runs **only when the flag is on** — flag-off production publish path unchanged.

## Out of scope (later PRs)

- Live `pending_design` apply / Design options body / restore → **PR 8**
- Import starter content → **PR 6**
- Custom colors editor → **PR 7**
- Visual 1440 / 390 pixel match → **BLOCKED** (no owner PDF/prototype)

## Gates

- `npm run typecheck`
- `npm run lint`
- `npm run test:builder` (or touched maison + readiness tests)
- Unit: `maison-publish-readiness.test.ts`, `maison-design-revision.test.ts`, `maison-setup.static.test.ts`, `maison-choices.test.ts`

## Migrations

None — uses PR1 `pending_design` + existing `talent_site_revisions`.
