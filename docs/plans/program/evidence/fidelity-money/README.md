# fidelity-money: Settings and Money against the boards

Group: SETTINGS and MONEY. Workspace boards at 1440x900: W20, W21, W23, W24,
W25, Sales (WS008), W55, W56, W58, W59. Every `*.board.png` is the board's
HTML rendered at that viewport; every `*.live.png` is this branch on a local
`next dev` (port 3220, proxied as the registered host `qa-journeys.local` on
3221, isolated database `qa-journeys`), signed in through `/api/dev/signin`
as the fixture owner, at the same viewport, with the dev-only identity banner
hidden. The rail and top bar are the shell group's; this group skins what
sits inside them: the settings frame, four of its groups, the Sales and
Payments destinations, and the first-run page the Overview links to.

Where the board's sample data says Casa Nube, Centro, Polanco, Ana or
Laura Méndez, the live frame says what the fixture workspace holds on
2026-09-11: its one venue "QA Floor" on America/Mexico_City, its open drawer,
the platform's Stripe keys (checkout on, no reader), the 200 most recent
sales of each kind, the 4 refund intents and the closed shifts the money
journeys left behind. Nothing was written to production; the one write on
the fixture (the instant-book switch, for the W58 chip) was toggled back.

## Boards

| Board | Verdict | Live frame | What differs, and why |
|---|---|---|---|
| Settings frame (W20 to W24's left column) | **matched** | every `W2*.live.png` | The 200px column of plain labels with the active group white with an inset hairline, the search box above it (kept: the existing settings index), every existing group kept and reordered toward the board (Locations and Payments & providers now sit where the board puts them), the pane's 22px title and its own actions. The fake "Saved just now" indicator is gone. The nav says "POS" and reads as "Point of sale" to assistive tech, so the three journeys that open the group by name keep their door. Differs: the column sits inside the shell's padded main (10px in from the rail) rather than flush against it; the board has ten groups, this workspace's settings have twenty-two, so the column is longer. |
| W20_SettingsPOS | **partial** | `W20_SettingsPOS.live.png` | "POS · QA Floor" (the venue's name, the board's "Centro"), the one location as the segmented control with "Add a location" disabled, the W58 save chip where the board's Save sits (toggles save at once; nothing is left to press); Modes at this location: the five engine modes as the board's switch rows with the Ready pill, Field Services drawn off with "No service zones yet"; Devices & drawers: every device, Drawer 1 (the open shift's float and time from `pos_shifts`), the card reader (the platform's Stripe Terminal status), Pair a device disabled; Tips, Receipts and Offline as the board's four select fields each, disabled, showing what the till actually does. Differs: the board lists seven modes (Appointments & Classes and Spaces & Resources are separate) and six devices; the engine has five modes and no device registry. |
| W21_SettingsPayments | **partial** | `W21_SettingsPayments.live.png` | Header + Save (disabled: providers are platform env), Used in · 6, Stripe (Connected / Not connected from `stripe_checkout`; seller, online payments, in-person reader from `stripe_terminal`, refunds, payment links, test mode) beside Mercado Pago · Point (Not connected; reader, capabilities, unknown outcomes, sandbox, Connect account disabled), then the method table METHOD · This location · RULES with On/Off pills from the engine's own facts. Differs: one location column, not two; "Card · online" is a row the board folds into the reader row; Test mode says the keys stay on the platform rather than naming a sandbox. |
| W23_LocationsZones | **partial** | `W23_LocationsZones.live.png` | Header with Add location · Add zone · Save (each disabled with its sentence), Used in · 3, the Locations card with the one row (venue name · address or "No address yet" · timezone · 1 drawer · the modes on) and "Edit this location" (opens the Venue group), the Service zones card with the reason sentence, the surcharge and professionals fields disabled. Differs: the travel-minutes matrix is not drawn (no zones exist to head it); the board's second location does not exist. |
| W24_BookingPolicies | **partial** | `W24_BookingPolicies.live.png`, `W58_SaveStates.live.png` | Header + W58 chip + Preview impact + Publish (both disabled: no versions), Used in · 7, the table APPLIES TO · DEPOSIT · FREE CANCEL UNTIL · NO-SHOW · RESCHEDULE CUTOFF over the workspace's commercial terms and the appointments notice, Reservations · tables pointing at Reservations › Settings; the Defaults card (deposit %, refund policy, instant book: the real writer, `updateTenantCommercialTerms`); Holds from the enforcing modules (15 min POS hold, 33 min checkout hold, 30 min waitlist offer); Intake forms disabled with their sentence. **2026-09-11 (wire-scheduling), D-POS-75:** the Overrides card is the per-item table (Item · Deposit % · Free cancel (hours) · No-show fee) over `booking_policy_overrides`, each cell writing on blur through the engine's `writePolicyOverrideAction` with the W58 chip; a blank cell keeps the default; `W24_BookingPolicies.overrides.live.png`. Differs: no "· v3" in the title and no Rentals row (no versions, nothing sells a rental); no-show and reschedule columns say what the engine does (nothing charges a no-show; the booking notice is the only cutoff) rather than the board's rules. |
| Sales (WS008) | **partial** | `Sales.live.png` | Header + Export (scoped) (disabled) + New sale (opens the counter, or says why not); the kind chips; period, payment and seller chips disabled with their sentence; the Sold via chips (the engine's channel filter, which the board has no room for); TYPE (coloured pill) · REF · CUSTOMER · WHAT · WHEN (the workspace's clock) · PAYMENT · FULFILMENT (one pill from the status) · AMOUNT · DUE · Open →; the footnote. Differs: refs are the id's first eight characters, not AP-2041; WHAT for an order is "N items · channel" (no line titles on the list reader); the payment · fulfilment pill is one status word, not two facts. |
| W25_PaymentsReconciliation | **partial** | `W25_PaymentsReconciliation.live.png` (+ `.refunds`, `.attempts`, `.drawers`) | Header + Import terminal report + Export (disabled), five tiles (Collected · today with cash/card, Refunds pending from `refund_intent` exceptions, Unknown attempts from `unresolved_collection` (T1-06) with the oldest's age, Drawer variance from the last closed shift, Next payout from `agencies.stripe_*`), the six tabs as `?tab=`, the callout. Collections = takings by method + Still owed; Refunds = pending intents + completed refunds; Attempts = the T1-06 rows with their resume action into Issues; Drawers = the shift rows with opening · expected · counted · variance; Payouts = destination state + doors; Reconciliation = the honest sentence. Differs: Attempts rows have no Method or Owner (the exception row does not carry the terminal or the cashier); Next payout has no amount or date (Stripe's, not read); the fixture's attempts tab is empty (every collection resolved). |
| W55_FirstUseSetup | **matched** | `W55_FirstUseSetup.live.png` | `/admin/setup`, the page the Overview's "Finish setup" now opens: "Welcome, QA" (the profile's first name), "QA Journeys (48-case fixture) · Restaurant · 5 of 8 ready" (the industry preset, the shared setup reader), Set up to sell with eight rows (check, label, the fact or the consequence, Set up door), Blocked right now with the Issues queue's two most consequential rows and their own action, the footnote. |
| W56_ApprovalReview | **partial** | `W56_ApprovalReview.live.png` | **2026-09-11 (wire-scheduling), D-POS-75 / D-POS-78:** on Settings › Roles & limits, under the matrix: `Manual discount and refund limits` as a row per action and a cell per role over `role_limits` (each cell saves on blur, owner or admin; blank is no limit), then `Approval requests` over `approval_requests` with the requester, when, the reason, and `Approve` / `Reject` through the engine's `decideApprovalAction` (`not_manager`, `already_decided`, `conflict` as sentences). Differs: the board draws the request on the Overview as a dialog with a PIN; here it is an inbox on the settings page and the decider is the signed-in owner or manager, which the engine checks by membership; the fixture has no request, so the inbox reads its empty sentence. |
| W58_SaveStates | **partial** | `W58_SaveStates.live.png` | The chip pattern (Saving… · Saved HH:MM · Save failed · Retry) on the POS modes header and the Booking policies header; on failure the input stays and Retry sends the same change once. Shown live as "Saved 09:09" after the instant-book switch (toggled back). Differs: the "Unsaved changes" dialog and the "Ana changed this item" conflict card are not drawn (nothing on these forms buffers changes or detects a concurrent edit; the board's own page is the Catalog group's). |
| W59_DifficultStates | **partial** | `W59_DifficultStates.live.png` | The "no results vs empty workspace" pattern on Sales (`?kind=project`: "Nothing matches these filters" with "Show every sale", never the first-use empty state); "Couldn't load · Retry" on every settings card and every Payments tab whose reader fails (`CouldNotLoad`, `FailedCard`), with the failed tile saying "could not load" instead of 0. Differs: the availability-changed, archive and lost-connection cards are other groups' screens and are not drawn here. |

## Readers and writers behind the screens (nothing is mocked)

- `getPosModes` / `setPosModes` (the modes), `getPosLocationFacts` (new: the
  default venue, `resolveTenantTimezone`, `currentShift`, the provider
  status), `getPaymentProviderStatus`, `loadTenantCommercialTerms` /
  `updateTenantCommercialTerms`, `getBookingPolicyFacts` (new:
  `RESERVATION_TTL_SECONDS`, `CARD_RESERVATION_TTL_SECONDS`,
  `DEFAULT_WAITLIST_OFFER_MINUTES`, the appointments notice).
- `loadWorkspaceSalesActivity` (now carries `lineCount`), `salesStatePill`
  (new, pure); `loadPaymentsBoard` (new: `loadTenantTakings` since the
  venue's midnight, `loadTenantOwedOrders`, `loadTenantRefunds`,
  `loadTenantDrawerSessions`, `loadExceptions`, `agencies.stripe_*`).
- `loadSetupItems` / `readAgencySetupRow` (new, `setup-checklist.ts`): the
  Overview's readiness bar and the setup page read the same eight facts;
  "Who performs" is `pickAProfessional` over the People surface, "Booking
  policy" is a deposit or refund preset of the workspace's own.
- The settings pane's `?focus=<group>` now opens any group (the setup page's
  doors); `/admin/setup` is a canonical route.

## Not wired (each drawn disabled with a one-sentence reason in en/es/fr)

A second location; Field Services; Pair a device; every Tips, Receipts and
Offline field; Save and Connect account on Payments & providers; Add
location, Add zone, the zone matrix, the surcharge, professionals per zone;
Preview impact, Publish, Manage forms, intake forms and overrides on Booking
policies; Export (scoped), the period, payment and seller filters on Sales;
Import terminal report and Export on Payments. Recorded as D-POS-58 and
D-POS-59 in `docs/plans/program/pos/decisions.md`.

## Copy

Every new sentence is in `web/messages/{en,es,fr}.json` under
`dashboard.adminWorkspace.posModes.*`, `.paymentsProviders.*`,
`.locations.*`, `.bookingPolicies.*`, `dashboard.sales.*`,
`dashboard.payments.*`, `dashboard.setupPage.*` and
`dashboard.overviewBoard.setup.item.*`. Dead rows the old screens read were
deleted (`bookingTermsLabel/Desc`, `posModes.onLabel/loading`,
`paymentsProviders.statusReady/statusNeedsSetup/providers/desc`, the old
Sales column and Payments column keys). `CommercialTermsSettingsCard`
(English-only, its own hex colours) is deleted, replaced by
`BookingPoliciesCard`.

## Playwright

Against this branch's dev server on the isolated database:

- `e2e/cases/POS-platform-switch.spec.ts` — passed (`fid-money-pw3.log`).
  Selector updates: the Saved assertion reads the W58 chip
  (`data-save-state="saved"`); the test now sets the journeys' 420s budget
  (five sign-ins on a cold dev server exceeded the 30s default).
- `e2e/cases/MONEY-manager-reads-the-money.spec.ts` — passed
  (`fid-money-pw-money7.log`, 5.2 min). Selector updates: the Sales columns
  and cells (`[data-sales-channel]`, `[data-sales-amount]`,
  `[data-sales-due]`, `[data-state]`); Still owed, Refunds and Drawers by
  their test ids and tabs; the counter seed ported to the re-skinned Cash
  screen (the spec was already red on `program/fidelity` at the counter's
  old "Shifts" rail; it now opens Cash, parks a resumed draft with Hold sale,
  and closes the drawer through Close drawer & count); `_money-db.ts` pages
  100 ids per `in()` (500 ids was an 18 KB request line the dev server
  refused). No assertion was weakened.
- `src/components/admin/shell/canonical-routes.test.ts` covers `/admin/setup`.
