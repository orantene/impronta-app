# Services rebuild report (2026-09-24)

Worktree `.claude/worktrees/services-rebuild` on `feat/services-rebuild` (rebased onto `origin/main`). No PR. Jor's live site (`book-jorgelina.tulala.digital`) was not published.

## Done (with evidence)

- Session: localhost:3000, Jor via magic-link confirm (no password). Hub `/talent/services` 21 services + 1 package.
- Hub desktop: `docs/plans/services-rebuild/evidence/p04-hub-desktop.png`
- Phone 390 home + bottom nav Today / Messages / Calendar / Money / More: `docs/plans/services-rebuild/evidence/p04-services-390.png`
- Product QA (prior pass): draft **QA test cuticle oil** created, reopened, archived, deleted. `docs/plans/services-rebuild/evidence/p24-product-editor.png`. `attributes` stayed `{}`.
- Hub storefront `/t/TAL-JORGBEAUTY` pills + prices: `docs/plans/services-rebuild/evidence/p38-hub-profile.png`
- Duplicate review (this pass): row ⋯ → Duplicate opened `DuplicateReviewScreen` (copy draft, What came across / What stayed). Discard click did not fire under the Next overlay; leftover `91affd84-15fe-4a3f-a6a6-7b7a42b4ebd3` deleted via service-role. `docs/plans/services-rebuild/evidence/p13-duplicate-review.png`
- Hide dialog (this pass, cancelled — no live hide): destinations “Tulala profile and Your website”. `docs/plans/services-rebuild/evidence/p14-hide-dialog.png`
- Organize: 4 categories, public-order copy, New category field. `docs/plans/services-rebuild/evidence/p34-organize.png` and `p34-near-match.png` (typed `Unas`; in-field near-match banner did not appear on that spelling)
- p37 row menu on a live row: Edit, Preview as customer, Share, Duplicate, Hide, Archive, Move up, Move down
- Reward p20: Keep it / Write my own / Save and continue. `docs/plans/services-rebuild/evidence/p20-intro-task.png`
- Reward p21: `Intro saved` banner without full reload after Keep it + save of existing bio. `docs/plans/services-rebuild/evidence/p21-intro-saved.png`. Write `saveMyBio` same Spanish intro text.
- Rebase onto `origin/main` completed (package.json kept main `test:billing` + `publication-state` + `website-reward`; `talentProfileId` kept on data-source load; TodayPage kept both site nudge and studio flows).

## Not done (reason)

- Widget Select → dock: still not proven after two insert tries. `docs/plans/services-rebuild/evidence/p-widget-insert-no-layer.png`. Not published.
- Extra on two nail services: skipped so live extras are not left on Jor's menu.
- Hide failure chip: coded; not forced (would require a failing write). Hidden / Show again rows not walked (hide cancelled).
- Publishing… / Retry / PublishedBanner / `onAddAnother`: not re-shot (would publish a copy or a draft).
- Category rename-and-rename-back: skipped to avoid rewriting every Uñas item.
- Phone 360 and frames p07 / p17-edit / p29: 390 home + p20/p21 only.
- Directory card vs widget: hub only. Widget not in canvas DOM.
- Checkout still ignores `attributes.fulfillment`.
- Guest access-link (P): other branch.
- Defaults currency / travel before-after / buffer note / Add many photo slots / Clients log / editor “Jor Beauty · Cancún”: not opened this pass.

Gates this finish: `npm run typecheck`, `npm run lint`, `npx tsx --test` on catalog + website-reward + publication-state. `test:billing` still has the pre-existing `validateOffering` zero-price Fade fail.

## Owner decisions

1. Live `#servicios` band swap — localhost only; stop.
2. Open PR — skip until asked.

## Jor writes this pass

- Duplicate `Semi-permanent gel (copy)` `91affd84-15fe-4a3f-a6a6-7b7a42b4ebd3` created then deleted.
- `saveMyBio` rewrote the same existing intro (no new copy).
