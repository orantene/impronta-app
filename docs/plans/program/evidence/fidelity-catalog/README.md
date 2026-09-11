# fidelity-catalog: CATALOG & OFFERS, board by board

**Group.** The workspace's Catalog list and its segments (W01), the type
chooser (W02), one item's editor with its seven tabs and right column
(W03 to W06), the menu structure (W07), Promotions (W08, at
`/admin/discounts`), Passes & cards (W09), the Offers, OfferWizard and
PackageEditor boards, and the till's package and entitlement screens (P01 to
P09). Boards live at `tulala-canvas/v3/<Board>.dc.html`; `board.png` in each
folder is that HTML rendered at the board's viewport (1440x900 workspace,
1194x834 POS), `live.png` is this branch at the same viewport on a local
`next dev` (port 3190, proxied as the registered host `qa-journeys.local` on
3191, isolated database `qa-journeys`), signed in as the fixture owner
through `/api/dev/signin`, the dev-only identity banner hidden. Where the
board says Casa Nube, Latte or $65, the live frame says what the fixture
holds (QA Journeys, House pizza, $18).

**Branch.** `work/fid-catalog` off `program/fidelity`. Nothing was pushed;
production was never read or written; `npm run db:push` was never run.
The wired-controls walk (`runs/wired-controls-walk.mjs`) wrote to the
fixture workspace only what it then undid (a stock of 5 then unlimited, a
favorite on then off, the website channel off then on, a draft item saved
then deleted); the Playwright spec wrote the promo code it always writes.

**Two environment findings, not product ones.** (1) The scratchpad's
`local-host-proxy.mjs` forwards HTTP only; the dev client's HMR websocket
fails through it, the client reloads the page about every 45 seconds, and
on this loaded machine the admin shell never finished hydrating before the
next reload, so every client page read "Loading" forever. `runs/host-proxy-ws.mjs`
forwards the upgrade too and rewrites the browser's `origin` (a Server
Action refuses a forwarded POST whose origin does not match the host). (2)
With load averages near 5, the Spaces redirect `/admin/spaces` to
`/admin/tables` renders in 6 to 12 seconds, past the harness's 5-second
identity assertion; that step of the SELL spec (not this group's) failed
three times in a row on timing (`runs/pw-SELL-full-run3-spaces-step-timeout.txt`),
and a throwaway copy of the same spec without step 3 passed steps 1, 2 and 4
(`runs/pw-SELL-steps-1-2-4.txt`, `1 passed (47.1s)`, exit 0).

**What changed.**

- `components/talent/services/use-offerings-editor.ts` is the one state
  machine both editors share (load, optimistic save with rollback, delete,
  reorder, duplicate, draft, child-row sync), parameterised by owner;
  `TalentOfferingsManager` (the talent's Services tab) now draws over it and
  is otherwise untouched, checked live (`runs/talent-services-check.txt`).
- `lib/talent/offerings-children.ts` gained `replaceOfferingChildren`, the
  options writer both `setOfferingOptions` (talent) and the new
  `setWorkspaceMenuItemOptions` (workspace, behind the tenant + owner_kind
  guard) call; the workspace load now carries variants and add-ons.
- `page-modules/catalog/`: `CatalogPage` (one route, `?view=` / `?item=` /
  `?tab=` / `?create=`), `CatalogList` (W01), `CatalogCreateType` (W02),
  `CatalogItemEditor` with `item-tab-details`, `item-tab-pricing` (W03),
  `item-tab-options` (W04), `item-tab-availability` (W05 + Fulfillment),
  `item-tab-channels` (W06 + Policies), `CatalogStructure` (W07),
  `CatalogPasses` (W09), `CatalogPriceLists`; `catalog-ui` (the kit) and
  `catalog-model` (every judgement, tested in `catalog-model.test.ts`,
  enrolled in `test:design-system`). `MenuPage.tsx` is deleted;
  `MenuImportPanel` is now opened by the list's own `Import` button.
- `admin/discounts/page.tsx` (W08) with `_ui.tsx` and the rebuilt
  `discount-form.tsx` (`New promotion` opens it; the on/off switch per row).
  `actions.ts` sends the table's own `kind` (`percent` | `fixed`) with cents
  and currency for a fixed amount; the old `amount` never passed the CHECK.
- The registry's `catalog` children: Items · Menu structure · Discounts ·
  Passes & cards (`lib/workspace/destinations.ts`, rail Spanish added).
- 428 sentences in `messages/{en,es,fr}.json` under `dashboard.catalog.*`
  and `dashboard.discounts.*`; the publish blockers are codes said in the
  reader's language and held to `validateOffering` by a parity test.
- `e2e/cases/SELL-catalog-events-spaces-discounts.spec.ts`: the Discounts
  step opens the form from `New promotion` and reads the board's heading.

## Per board

| Board | Verdict | What differs and why |
|---|---|---|
| W01_CatalogItems | partially | Title, intro, `Import` (opens the import panel in place), `Create item`, the five segments (Promotions is a link to `/admin/discounts`), Type / Location / Channel / Incomplete-only chips, the eight columns, the row menu (Open · Publish/Unpublish · Duplicate · Move up/down · Delete, all live), the `Used in` footer and its rule. Location is disabled (D-POS-45); Preparation is a dash (D-POS-46); the fixture has no package, pass or ticket-linked row, so Type reads Product and Service; `live-es.png`, `live-fr.png`. |
| W02_CreateItemType | partially | The nine cards in the board's words and order, `Cancel`, `Continue · <Type>`. Product, Service, Custom service (quote) and Package start a draft and open the editor; Class, Ticket-linked and Space service continue to their own destination (a sentence says so); Pass and Gift card are disabled with the product-decision sentence (D-POS-44). |
| W03_ProductPricing | partially | Title, meta line, `Draft changes`, `Preview on POS` (disabled, no single-item preview), `Save draft`, `Publish` (disabled with the first blocker while incomplete), the `Used in` line, the seven tabs; Base price (Price, Sold by, Tax category, Cost, Shown as, Currency), Price lists (the one default list, `Add price list rule` disabled), Deposit / prepayment (the sentence for a product; the booking mode, up-front collection, deposit percent and free-hold days for a service or package); right column: the Counter tile, example totals, `Before publish`. Tax and cost are disabled (D-POS-47); price lists (D-POS-45). **2026-09-11 (wire-scheduling):** `Price phases` (E02's early bird) sits under Price lists: the rows of `offering_price_phases` with From · Until · Price · Live/Upcoming/Ended, `Add phase` live through `setOfferingPricePhaseAction` (`overlap` and `invalid` as sentences), `Remove` disabled with its sentence (D-POS-76); `live-phases.png` is the House pizza item with one phase added on the isolated database for the frame and left in place (the engine has no delete). `live-draft.png` is the unsaved draft W02 hands over; `live-details-tab.png` the Details tab; `live-es.png`, `live-fr.png`. The right column is not flush with the window edge: the shell keeps the page inside its 1180px `<main>`. |
| W04_ProductOptions | partially | `Option groups` with the two groups the engine has (Options · Required · Pick exactly 1; Extras · Optional · 0 to N), rows with name, price, station and availability, `Add option` on each (live: add and remove write through the child-row writer, walked in `runs/wired-controls-walk.txt`), `Add group` and `Copy groups from` disabled, `Notes for preparation` and `Allergy field` disabled; right column `Cashier sees` with the tiles and the price-per-item note. Free-form groups, station codes and per-option availability: D-POS-48. |
| W05_ProductAvailability | partially | The four mode cards (Unlimited and Stock pool live through the capacity RPC, walked: 5 then unlimited; Dated batches and Session pool disabled), the batches table drawn empty with `Add batch` / `Repeat every week` disabled, Low-stock warning (disabled), When sold out (the engine's rule, locked), Lead time (disabled), Cancellation (live, `cancellation_hours`); right column `POS behaviour`. `live-fulfillment-tab.png` is the Fulfillment tab, four fields disabled with one sentence (D-POS-46, D-POS-49). |
| W06_ProductChannels | partially | Six channel rows with switch, note and price override: Website (live, `visibility`) and POS · Counter (live, `status`) walked off and on; Tables, Table QR, Talent profile, Private link disabled (D-POS-50); the rule sentence; right column `Visible on`. `live-policies-tab.png` is the Policies tab: the identity rule and its reason, account required, pay in person (live); Returns, Refund policy, Discounts, Comp disabled (D-POS-51). |
| W07_MenuStructure | partially | Title, the location switch (disabled, D-POS-45), `Save` (disabled: each change saves as it is made), `Used in`; Favorites (live: `is_featured`, add from the picker and remove on the row, walked), Categories (the rows' own `category`, counted), Tables & QR sections and the QR switch (disabled, D-POS-46). The counter's own Favorites chip still reads nothing (D-POS-34); `is_featured` is the column it could read. |
| W08_Promotions | partially | `Promotions & discount limits`, `New promotion` (the form: code, label, kind, value; live), `Used in`, the table (Promotion · Value · Eligible · Stacking · Uses · on/off switch, live) over the fixture's real codes with their redemption counts, `Manual discount limits by role` (Not set per role, `Edit limits` disabled, D-POS-52) and `Stacking order` with the one live step marked. The SELL spec's step 4 creates a code through this form and reads it back from the table and the database (`runs/pw-SELL-steps-1-2-4.txt`). |
| W09_Entitlements | not wired | The title, `Create` (disabled), `Used in`, the sentence, and the three cards (Pass, Membership, Gift card) with the board's rows reading "Not decided" and `Edit` disabled, every control carrying "Selling passes needs a product decision." in en, es and fr (D-POS-44). |
| Offers | not built here | The project agreement's version view; built as W46 by fid-projects under `/admin/projects/[id]` (D-POS-53). |
| OfferWizard | not built | A six-step reservation-offer wizard over pacing, buffers and assignment scope that Spaces & Resources does not record; nothing to draw the steps from (D-POS-53). |
| PackageEditor | partially | `Package` is a kind and is created, listed and edited as one item (W02, W03). **2026-09-11 (wire-scheduling), closing the composition half of D-POS-53:** the Composition card on a Package item's Details tab (D-POS-77): Component (a select over the workspace's own items) · Included (Required/Optional) · Qty · List price · Value alloc. (the proportional share `packageRefundShare` uses), `Add component`, `Save composition` through `setOfferingComponentsAction` (`cycle`, `overlap` as sentences), the allocation note. Dependencies, manual amounts and the guest preview stay one sentence. `live.png` is a `Birthday party` package created on the isolated database with two components (House pizza x1, one service x1) and deleted after the frame. Differs: no Pricing & allocation / Policies / Channels tabs of its own (the item's seven tabs serve every kind); no room picker (a component is an item). |
| P01_PackageConfigure, P02_ComponentUnavailable, P03_PackageAfter | not built | The till configuring, substituting and issuing a package's components. The components model now exists (`offering_components`, PackageEditor above) and the till's capacity goes through `hybrid-combinations.ts`; the three till screens are the Counter group's (wire-pos-money) and were not drawn here. |
| P06_PackageRefund | partially | The Orders desk's refund form (`admin/orders`, `orders-refund-form.tsx`): when a picked line is a package, `Split by component share` lists each component with the cents a refund of the remainder would return, the engine's own `packageRefundShare` computed on the server (`loadOrderLinesForDesk`). Differs: the desk form is the pre-fidelity inline-styled one, not the till's M16 sheet; the board's per-component effects (kitchen order cancelled, game and room stay booked) are not drawn. No live frame: the fixture has no order line on a package. |
| P04_Membership, P05_GiftCard, P07_GiftRedeem, P08_GiftExhausted, P09_MembershipPause | not built | The till's membership and gift-card screens; the sentence lives on W09 and W02 (D-POS-44). |

## Not wired (every one is a disabled control with a one-sentence reason in en, es and fr)

Location chip and switch · Preparation column · Preview on POS · Tax
category · Cost · Add price list rule / Add price list · Add group · Copy
groups from · Notes for preparation · Allergy field · Dated batches ·
Session pool · Add batch · Repeat every week · Low-stock warning · Lead
time · Fulfillment, Station, Prep time, Default course · POS Tables, Table
QR, Talent profile, Private link switches · Price override · Returns,
Refund policy, Discounts, Comp · Tables & QR sections and the QR-ordering
switch · Structure `Save` · Photos · Passes & cards `Create` and `Edit` ·
Pass and Gift card cards · Edit limits.

## Gates

Recorded in the commit message and the report; the runs above are the
browser evidence.
