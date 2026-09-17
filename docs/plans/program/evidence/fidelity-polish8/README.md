# fidelity-polish8: the second pass on Settings, Sales and Payments

**Group.** The settings groups the money boards draw (W20 POS, W21 Payments
& providers, W23 Locations & service areas, W24 Booking policies, W56's
approval inbox on Roles & limits), the Sales destination (WS008), the
Payments destination (W25 and its tabs), the first-use setup page (W55),
and the two shared patterns (W58 save states, W59 difficult states). Each
folder holds `board.png` (the board rendered at 1440x900, copied from
`fidelity-money/`) and `after.png` (this branch on a local `next dev` at
port 3182, proxied as the registered host `qa-journeys.local` on 3183
against the isolated database `qa-journeys`, signed in as the fixture owner
through `/api/dev/signin`, the dev-only identity banner hidden). The first
pass's `<Board>.live.png` in `fidelity-money/` is the "before".

**Branch.** `work/fid-polish8` off `origin/main` (`3dc0a719a`). Production
was never read or written; `npm run db:push` was never run. The isolated
database took two writes, both undone: the instant-book switch on Booking
policies (on, then off again, for the W58 chip: `aria-checked` read `false`
before and after), and one `approval_requests` row (`operation_key`
`fid-polish8-w56-frame`, kind `discount`, filed against the fixture's
newest order) for the W56 frame, deleted after it (`removed 1`).

## Method

Board and live at the same viewport, element by element, the differences
listed before anything changed (grid, spacing, type, colour, borders,
copy, states), then fixed in the screen's components with the wiring
untouched, then measured back. The kit rules polish3 to polish7 landed are
applied: 1.2 line-height, 26px page titles, 24px KPI figures on a 16px
inset, the board's block pill for a list cell, the kit's chevron over a
native select, 16px row menus, day-first dates. The owner's settings rule
(preset first, advanced hidden) decides W23: the location editor opens
under the row a person taps, not on the page by default.

## What changed, shared (`settings-ui.tsx`, `appointments-classes-ui.tsx`)

| # | Before | After |
|---|---|---|
| 1 | Device rows inherited the admin body's 1.65 line-height (a two-line row was 52px). | `DeviceRow` on a 1.2 line-height at the board's 38px. |
| 2 | Settings cards' key/value rows were the 29px record-column `FactRow`. | `SettingsFactRow`: the 37px row W21 and W24 draw (key muted left, value semibold right). |
| 3 | No row menu on the settings tables. | `RowMenu`: the board's "…" at 16px, disabled with its one-sentence reason (D-POS-58). |
| 4 | Grid tables' header 29px, rows on 1.65. | 33px header, 38px rows, 1.2 line-height (`GridHead`, `GridRow`, the Payments `GRID_HEAD` / `GRID_ROW`). |
| 5 | W58's Retry was a secondary button. | The board's primary. |
| 6 | Every state pill was the compact chip. | `StatePill block`: the board's list-cell pill (17px, fills the column, label left) and a `neutral` tone for the boards' grey Off / Closed / Draft. |
| 7 | `hour12: false` printed midnight as `24:55` on the Payments tiles and drawer rows. | `hourCycle: "h23"` in every clock this group formats (Payments, Sales, the settings chips). |

## Per board

| Board | What changed | Still differs |
|---|---|---|
| W20_SettingsPOS | Device rows at the board's 38px; `Pair a device` is the board's full-width grey button with the plus glyph (it still writes `pos_devices` through `posDeviceRegister`, WIRE-3.10). | The board's Save is the W58 chip (toggles save at once); the segmented control lists the fixture's one location and no second one; the `Device name` field stays above the button because the pairing writer takes a name (the spec fills it before pressing Pair); the fixture's devices are four `This till` heartbeats (3.10) and the board's six named iPads and two drawers are its sample data; Tips, Receipts and Offline stay disabled with their reasons (D-POS-58). |
| W21_SettingsPayments | Fact rows at the board's 37px; the method table on the board's columns (METHOD · THIS LOCATION 120px · RULES · menu) with block On/Off pills and the row menu; `Payment links` and the `Payment link` row now read the links engine (WIRE-1.7): `Yes · expires after 33 min` from `CARD_RESERVATION_TTL_SECONDS`, carried on `getPaymentProviderStatus` as `linkTtlSeconds`, and `Sends · does not collect · expires after 33 min` when Stripe is connected. | One location column, not two; `Connected` without `· live` (the platform does not say which key it holds); `Connect account` stays disabled (no store for a Mercado Pago account); Save disabled (providers are platform env). |
| W23_LocationsZones | `Add location` / `Add zone` carry the board's plus glyph; the location row is the board's (name muted, facts semibold, a hairline under it); the Name · Timezone · Address editor opens under the row when it is tapped (`after.editor.png`) and is not on the page by default; the `Venue and spaces` door is a link in the note; the travel-minutes sentence is a plain note under the surcharge, not a grey box. | The zone matrix is not drawn (travel minutes have no column, the fixture has no zones); the board's second location does not exist; Save is disabled until a field changes (the engine writes on Save, not on blur); the row carries a chevron the board lacks (it is the editor's door). |
| W24_BookingPolicies | The table on the board's columns (APPLIES TO 200px, four rule columns, the row menu) with every rule word on one line (`Booking notice · 2 h`, `Per event · at the desk`, `Default · at booking`, `Platform default`); the `Reservations settings →` link sits in the Reservations row's cutoff cell instead of under the name; Defaults for new offers · Holds · Intake forms on the board's three-card row (Defaults first: it is the writer, the owner's "preset first"); fact rows at 37px. | No `· v3` and no `Publish v4` (no versions); the board's Overrides card is the per-item table under the three cards (D-POS-75); no Rentals row; the no-show and cutoff columns say what the engine does. |
| W25_PaymentsReconciliation | 26px title; the board's `drill into the POS record`; tiles at the board's 86px (24px figure on a 16px inset, 1.2 line-height); the tab strip runs the column's width; a single-section tab opens straight on its table with its one-line note (the title is for the screen reader); block pills in every STATE column; refunds on the board's columns with the pending detail on one truncated line; the `last close` reads day-first (`Wed 16 Sep 00:55`, was `24:55`). | Import and Export disabled (no importer, no export); Attempts rows carry no Method or Owner; Next payout has no amount or date; the fixture's Attempts tab is empty; the Collections tab keeps its two titled sections (the board's single table is the Attempts tab). |
| Sales | 26px title; the board's `click a row to open the source record`; the first chip reads `All` (its accessible name stays `All kinds` for the MONEY journey); `Project`, not `Project booking`; 28px chips with the ink border when active, so the period · payment · seller selects sit on the chip row as the board draws them; TYPE and PAYMENT · FULFILMENT as block pills; rows 46px; `guest_qr` and `messages` read `Guest QR` and `Messages`; `New sale` carries the plus glyph. | Refs are the id's first eight characters; WHAT for an order is `N items · channel`; the payment · fulfilment pill is one status word; the period, payment and seller filters stay disabled with their reasons; the `Sold via` channel row is the engine's filter the board has no room for. |
| W55_FirstUseSetup | 26px title; 14px card titles; 20px checks; rows at the board's 43px; the blocked cards on the board's inset. | The fixture's facts (`America/Mexico_City` without a venue name, `5 of 8 ready`, two ticket issues) are not the board's sample; nothing else differs. |
| W56_ApprovalReview | The request is the board's card: `Approval requested · discount · 7ea75ccc` over who and when (day-first, 24h), the facts on a hairline card (Action · Reason · Scope), Reject and Approve in the footer on a hairline. The stale `Per-person limits` paragraph ("Tulala does not track individual discount or refund limits yet") and its `limitsGap` key are gone: the limits are live (WIRE-2.13). | An inbox on the settings page, not a dialog on the Overview; no PIN (the decider is the signed-in owner or manager, checked by membership); no amount on the title (the request row carries the reason sentence, not an amount column); the board's `limit for cashiers is $1,000` needs the requester's role, which the row does not carry. |
| W58_SaveStates | Retry is the board's primary; `Saved 23:32` shown live after the instant-book switch (toggled back). | The `Unsaved changes` dialog and the conflict card are not drawn (nothing on these forms buffers changes or detects a concurrent edit). |
| W59_DifficultStates | The no-results box is the board's compact one: left-aligned on the surface tint, a 13px title, one line, the button; never the first-use empty state. | The availability-changed, archive and lost-connection cards are other groups' screens; `Couldn't load · Retry` is unchanged from the first pass. |

## Copy (en, es, fr)

Added: `paymentsProviders.{linkExpiry,stripe.linksOff,methods.paymentLinkOffRule,
methods.rowMenu,notWired.rowMenu}`, `bookingPolicies.{rowMenu,notWired.rowMenu}`,
`rolesLimits.inbox.{factAction,factActionValue,factReason,factScope,factScopeValue}`,
`sales.filterAll`. Changed: `paymentsProviders.stripe.linksValue` (`Yes`),
`paymentsProviders.methods.paymentLinkRule` (`Sends · does not collect`),
`bookingPolicies.{noticeCutoff,ticketsRefund,depositPlatform,cancel.platform}`
(one line each), `rolesLimits.inbox.{title,kindDiscount,kindRefund}` (the
board's title shape), `sales.pageIntro`, `payments.pageIntro` (the boards'
words). Deleted: `rolesLimits.limitsGap` (stale since WIRE-2.13).
`npm run verify:ui-messages` exit 0.

## Gates (real exit codes)

See `gates.txt` beside this file.

No selector the Playwright cases read was renamed: `pos-pair-name`,
`pos-pair-device`, `pos-mode-row-*`, `pos-save-state`, `locations-row-*`,
`locations-add-zone`, `locations-new-zone-*`, `locations-save-state`,
`booking-policy-override-*`, `booking-policies-overrides-save-state`,
`role-limits-editor`, the `Manual discount · Owner` cell label,
`[data-approval-request]`, `[data-approval-approve]`, `[data-approval-deny]`,
the `Approved · ` text, `payments-owed`, `payments-refunds`,
`payments-drawers`, `[data-drawer-*]`, `[data-sales-channel]`,
`[data-sales-amount]`, `[data-sales-due]`, the `All kinds` / `All channels`
/ `Order` / `Counter` link names.
