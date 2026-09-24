# Services rebuild report (2026-09-24)

Worktree `feat/services-rebuild`. No merge. No PR. Jor's live site (`book-jorgelina.tulala.digital`) was not published.

## Done (with evidence)

- Session: localhost:3000, Jor via magic-link confirm (no password). Hub `/talent/services` loaded 21 services + 1 package.
- Hub desktop: `docs/plans/services-rebuild/evidence/p04-hub-desktop.png`
- Product QA: created draft **QA test cuticle oil** (180 MXN, 15 ml size in editor, pickup/ship/handover fields shown). Reopened as Product · Draft. Archived, then Delete forever. Hub back to 22 items. Write: `upsertTalentOffering` draft `44717f38-bc83-4d52-8aa7-56368ef6aa60` then `setOfferingPublication` archived then `deleteTalentOfferingForever`. `attributes` on save was `{}` — size/fulfillment did not persist to that row.
- Product editor shot: `docs/plans/services-rebuild/evidence/p24-product-editor.png`
- Hub public storefront `/t/TAL-JORGBEAUTY`: category pills Pestañas/Uñas/Cejas/Depilación; gel MX$300 ≈ US$17; package Set $500. `docs/plans/services-rebuild/evidence/p38-hub-profile.png`
- Phone 390: bottom nav Today / Messages / Calendar / Money / More; + Add item; live website card `/t/TAL-JORGBEAUTY`. `docs/plans/services-rebuild/evidence/p04-services-390.png`
- Code this pass: `WebsiteRewardControl` `placement="services"` (full-width phone card above the list, hidden while editor is open because the list screen unmounts); sheet heading `N of 6` when eligibility slices exist; `ItemStateChips` Hide failed chip; hide dialog writes `hideFailedIds`.
- Widget: Add → Data → Booking → Services menu. Draft saved. Structure search `catalog` returned no layer. `docs/plans/services-rebuild/evidence/p-widget-insert-no-layer.png`. Not published.

## Not done (reason)

- Select → dock: catalog node never landed in the canvas DOM (two tries). Static `#servicios` menu was already on the draft; live widget not proven.
- Extra on two nail services: skipped so live extras are not left on Jor's menu.
- Duplicate review screen: not opened (would leave a copy).
- Hide failure forced: chip is coded; not forced offline this pass.
- Publishing… / Retry / PublishedBanner: not re-shot.
- p20 Keep it / Write my own and p21 Intro saved: not built (Jor already has an intro; no draft-bio task UI).
- Phone 360 and frames p07/p17-edit/p29/p34: only 390 home.
- Directory card vs hub vs widget: hub only. Widget not in DOM.
- Checkout still ignores `attributes.fulfillment`.
- Guest access-link (P): other branch.
- Spanish walk: not a separate pass.

Gates: `typecheck` 0, `lint` 0, catalog render tests 0, `test:builder-node-bindings` 0. `test:billing` 1 fail in `offerings-types.test.ts` (`validateOffering` expects no errors on a zero-price instant “Fade”) — not from this pass’s files.

## Owner decisions

1. Live `#servicios` band swap — localhost only; stop.
2. Open PR — skip until asked.

## Jor writes

- Draft product `44717f38-bc83-4d52-8aa7-56368ef6aa60` created then archived then deleted.
- Page-builder draft may still contain a failed Services menu insert (unpublished).
