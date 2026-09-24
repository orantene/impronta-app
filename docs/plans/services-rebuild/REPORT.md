# Services rebuild report (2026-09-24)

Worktree `feat/services-rebuild`. No merge. No production pointer. Jor's live site was not published from this pass.

## Done

- Tree cleaned: presence commit `357eb92be`, services commit `fac84c3be`. Typecheck, lint, and the three test files exited 0.
- `services_catalog` now matches the menu spec in code: italic `{i}` titles, filter pills (first category visible, others `hidden` in HTML), `ctaLabel` defaulting to Select / Seleccionar, 120px photo rows, hairline dividers, computed stats, `category_order`, inspector fields, 10 render tests.
- Editor canvas was empty because `talentProfileId` was not passed into `loadBuilderNodeDataSources`. It now also reads a talent `previewSubject`.
- Product editor card (p23 fields): stock, whenSoldOut, variants, fulfillment. Saved on the item; `upsertTalentOffering` already writes variants via `setOfferingOptions`.
- New extra screen and duplicate review screen are wired. Hide dialog subtitle is `Hiding "…"`.
- Public storefront and the widget sort categories by `category_order`. Organize no longer says order is not saved.
- Camera dropped "1 of 3". New Spanish strings added.

## Not done / not proven in a browser

- Widget live click-through: the block inserts in `/talent/page-builder` (Data tab, search catalog). Before the data-source fix it rendered "No services are published yet." Re-insert and click Select after a server refresh. Do not publish.
- Product test row on Jor was not created in this pass. Create, reopen, delete.
- Extra was not created and not shown on a public card.
- Duplicate review, hide failure chip, Publishing… retry, p17/p20/p21 reward, phone 360/390 frames, Spanish walk, three-surface parity: not re-shot.
- Checkout does not read `attributes.fulfillment`. Shipping is stored only. Do not fake checkout.
- Guest access-link bug (P) stays off this worktree.
- Live `#servicios` band swap is an owner decision.

## Owner decisions

1. Swap Jor's live `#servicios` band for `services_catalog` (keeps booking on her site). Prepare on localhost only.
2. Open a PR when asked.

## Jor writes this session

None besides browsing. A Services menu block was inserted then removed in the page-builder draft. Confirm the draft did not keep it.
