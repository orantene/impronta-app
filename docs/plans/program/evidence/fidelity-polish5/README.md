# fidelity-polish5: the second pass on Catalog

**Group.** The workspace's Catalog list and its segments (W01), the type
chooser (W02), one item's editor and its right column (W03 Pricing, W04
Options, W05 Availability, W06 Channels), Menu structure (W07), Promotions
(W08, `/admin/discounts`), Passes & cards (W09) and the PackageEditor board
(a Package item's Details tab and its right column). Each folder holds
`board.png` (the board at 1440x900, copied from `fidelity-catalog/`) and
`after.png` (this branch on a local `next dev` at port 3174, proxied as the
registered host `qa-journeys.local` on 3175 against the isolated database
`qa-journeys`, signed in as the fixture owner through `/api/dev/signin`, the
dev-only identity banner hidden). The first pass's `live.png` in
`fidelity-catalog/<Board>/` is the "before".

**Branch.** `work/fid-polish5` off `origin/main` (`ee8797dae`). Production
was never read or written; `npm run db:push` was never run. The isolated
database took only writes the frames needed, each undone through the same
screen after the frame: two options and one extra on House pizza
(`W04`, removed: 0 rows left), three favorites (`W07`, removed: 0 left), and
a `Birthday party · Escape room` package with two components
(`PackageEditor`, deleted from the list's row menu: 0 rows left).

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed (grid, spacing, type, colour, borders, copy,
states), then measured back with `getBoundingClientRect` until the number
was the board's. The kit rules polish3 and polish4 landed apply: 1.2
line-height on every row, 26px page titles, sheets and columns on the
board's own widths, the board's words.

**A defect found on main, fixed here.** The mobile pass (`f940e4c18`,
2026-09-11) wrapped W01's four filter chips (Type · Location · Channel ·
Incomplete only) in `hidden max-[720px]:contents`, which hides them on every
desktop width; since then the list had no filters above 720px. The wrapper
is now `contents` on every width (the phone still stacks them under the
segments).

## What changed, shared (`catalog/catalog-ui.tsx`)

| # | Before | After |
|---|---|---|
| 1 | 22px page titles; the admin body's 1.65 line-height on every row. | 26px on a 13px meta line; `leading-[1.2]` on the page shells, the list heads (33px), the rows (43px), the tab strip (32px), the key/value rows (29px). |
| 2 | 36px inputs, 12px labels, 11.5px hints at 1.65. | 34px inputs, 12.5px labels, hints at 1.25; `Field` gains `quiet` so a row of fields that share one sentence prints it once (the title keeps it on each). |
| 3 | Native selects with the browser's arrow. | `SelectShell` over an `appearance-none` select: the kit's chevron on every select in the group. |
| 4 | Type and status as compact chips; channels as rounded pills. | `BlockPill`: the board's 17px tinted block that fills its column, label left; `Chip`: the 17px square-cornered channel chip (grey, or the brand's tint for POS). |
| 5 | The note's `info` glyph. | The triangle (`alert`), which every board draws. |
| 6 | Right-column key/value rows without rules, medium weight. | `TotalRow`: hairline between rows, muted label, semibold value, 29px. |
| 7 | `+ Add …` next to always-open inputs. | `AddPill` (the grey pill with the plus) closes the card as the boards draw it; the inputs open on the click and close on the add (W04 options, W07 favorites). |
| 8 | Rows without a handle. | `DragHandle`: the board's `⋮⋮` at the head of an option, favorite, category and component row (decorative, its title says reordering has no writer here). |
| 9 | 24px row menus. | 18px, so the `···` never sets the row. |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| W01_CatalogItems | The four filter chips back on the desktop (the defect above); Type and Status as block pills on 120px / 150px columns; Website and POS Counter as 17px chips; rows 43px under a 33px head on the board's columns (`1.35fr 120 1.3fr 90 150 120 150 24`); the page on a 14px rhythm. | The fixture's five rows are Product and Service only (no package, pass or ticket-linked row); Location is disabled (D-POS-45); Preparation a dash (D-POS-46); the rail reads "Menu & catalog" (the cafe preset's word in `destinations.ts`, not this group's). |
| W02_CreateItemType | The board's nine glyphs (tag · calendar · cup · ticket · floor plan · briefcase · gift · layers · card, `lucide-react`); cards 156px on a 16px inset with the board's 10 / 5 / 8px gaps; a 14px gap between cards. | Pass and Gift card disabled with the product-decision sentence (D-POS-44); Class, Ticket-linked and Space service continue to their own destination. |
| W03_ProductPricing | The editor's left column white and the right column on the page surface, both full height, the right column 342px (`1098` to `1440` as the board); 26px title, tabs at 32px; price-list rows 39px with the value right-aligned; `Add price list rule` as the grey pill; the Counter tile 82px with 14px name and price; example totals on 29px hairlined rows. | `Shown as` and `Currency` are a second row the board lacks (both wired, kept); the price input has no `$` prefix; the hints under Sold by, Tax and Cost are the reasons (two to three lines, the board's are one). |
| W04_ProductOptions | Group heads 40px with the board's `···` (disabled: no group writer, D-POS-48); rows 34px with the handle, name, price, station, availability, control; `+ Add option` alone in the foot, the name and price inputs open on the click and close on the add; the Cashier-sees tile 13px heads with 36px option buttons. | The row's control is `×` (remove is the one thing an option row can do; a menu of one would be theatre); availability is a dash (an option has no stock of its own); the fixture's two options and one extra were added for the frame and removed after. `after-add-open.png` shows the open inputs. |
| W05_ProductAvailability | Mode cards 62px on a 16px grid; `+ Add batch` the grey pill; the four rules on 34px inputs; the board's `Fulfillment & preparation` section under the rules (the same four disabled fields the Fulfillment tab holds, the reason printed once); POS behaviour on 29px hairlined rows with the tile value in quotes. | The frame's mode is Unlimited (the fixture); Dated batches and Session pool disabled (D-POS-49); the low-stock threshold and lead time disabled. |
| W06_ProductChannels | Channel rows 54px with a 16px bold override; the rule sentence under the card gone (it is the right column's note, as the board draws it); the board's four policy selects under the channels (Returns · Refund policy · Discounts · Comp allowed, disabled with one sentence, D-POS-51); the right column's `Visible on` as four white cards with a green check where the item shows and a dash where it does not. | Tables, Table QR, Talent profile, Private link disabled (D-POS-50); the override value is the base price on every row (no per-channel price column). |
| W07_MenuStructure | The three columns stretch to the foot of the window; 40px card heads with `8 of 12` as a grey chip; 34px rows with the handle and the `×`; `+ Add to favorites` opens the picker on the click; the `Back to items` link the board lacks is gone. | The location switch is one disabled chip (D-POS-45); `Save` disabled (each change saves as it is made); sections and courses and the QR switch disabled (D-POS-46); the fixture has one category. |
| W08_Promotions | The board's layout: the table on the left, `Manual discount limits by role` (490px) beside it, `Stacking order` across the foot; the promotion cell one bold line (`CODE · code`); 39px limit rows with semibold values; `Edit limits` across the card's foot; the stacking steps as `1 · Price list` chips on one row with `Live` on Codes; `New promotion` with the plus glyph. | The row's last cell is the on/off switch (wired) where the board draws `···`; the fixture's codes are long SELL run codes and wrap; limits read `Not set` (D-POS-52). |
| W09_Entitlements | The segment strip the board lacks is gone; the `Used in` line carries the board's trailing note; cards on a 16px inset with the title and its kind on one line, 37px key/value rows, `Edit` across the foot; the coral banner replaced by one muted sentence under the cards. | Every value `Not decided`, `Create` and `Edit` disabled with the product-decision sentence (D-POS-44). |
| PackageEditor | `after.png` (the head) and `after-composition.png` (scrolled): the Composition table with the handle and the block pill (Required green, Optional grey), `+ Add component` as the pill; the board's two cards under it, `Dependencies` (one sentence: not recorded) and `Allocation method` (`Proportional to component list price` selected as the engine's rule, `Manual amounts` disabled with its reason, the sum line `$24.38 + $17.62 = $42 ✓`); the right column is the board's `Guest preview · Configure`: each saved component as a card with a lock (required) or a box (optional), the total, the holds line, drawn from the same rows (re-read after a save). | The composition stays on the Details tab under the item's fields (the WIRE-2 case opens `tab=details` and reads it there), not a `Composition` tab of its own; the component is a select (the board's shared picker with a room path does not exist); `When selected` and `Availability` columns are not drawn (nothing records them); the `Draft changes` chip shows because the frame's package is a draft. |
| P06_PackageRefund | Not touched here: the Orders desk's refund form is the pre-fidelity inline-styled one and the fixture has no order line on a package; board only. | — |
| P01, P02, P03 (till package screens), Offers, OfferWizard | Not built in this group (the till's package screens are the Counter group's; Offers is W46 under Projects; the wizard has nothing to draw from, D-POS-53); board only. | — |
| P04, P05, P07, P08, P09 | Memberships and gift cards: engine partial, screenshot only, no build (D-POS-44); boards in `fidelity-catalog/`. | — |

## Copy (en, es, fr)

Added: `dashboard.catalog.options.groupMenu`, `.options.reorderReason`,
`.structure.reorderReason`, `.passes.usedNote`, `.package.dependencies`,
`.package.allocationMethod`, `.package.proportional`,
`.package.proportionalNote`, `.package.manual`, `.package.manualNote`,
`.package.manualReason`, `.package.guestPreview`, `.package.total`,
`.package.holdsNote`. Removed (no reader left): `.structure.backToItems`,
`.channels.rule`. Changed: `.package.dependenciesReason` no longer names the
guest preview (it is drawn now). `npm run verify:ui-messages` exit 0.

## Gates (real exit codes, dev server stopped first)

| Gate | Exit |
|---|---|
| `npm run typecheck` (the tsc queue) | 0 |
| `npm run lint` | 0 |
| `npm run verify:ui-messages` | 0 |
| `tsx --test` on `message-key-usage.static`, `message-catalog-duplicate-keys.static`, `catalog-model.test`, `file-size-ratchet.static` | 0 (93 pass) |
| `npm run test:design-system` | 0 (125 pass) |

No selector the Playwright cases use was renamed (`catalog-package-composition`,
`catalog-package-add`, `catalog-package-save`, `catalog-package-outcome`,
the composition's `select[aria-label]` and the `Remove component` button,
`catalog-price-phases` and the `catalog-phase-*` ids, `discounts-new`,
`discounts-form`, the promotion `role="cell"` whose name still contains the
code, the `role="row"` named by the code). Two ids were added for the reveal
pills (`catalog-options-<group>-open`, `catalog-favorite-open`); the add
buttons keep theirs. The cases were not re-run here (one heavy process at a
time; the dev server and the gates were it).
