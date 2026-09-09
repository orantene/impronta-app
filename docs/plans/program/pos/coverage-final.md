# Final coverage · design handoff (2026-09-09)

Baseline: audit `audit-2026-09-09-disposition.md` and the corrections since. Status words: **Completed** (designed, connected, no known defect) · **Needs correction** (designed, a named fix pending) · **Missing** (no adequate design). Screen ids: W = workspace desktop, MW = workspace mobile, POS ids per deck (C/T/B/D/E/A/K/R/S/F/G/O/P/Q/M/CD). Devices: D desktop 1440 · T tablet 1194×834 (landscape) / 834×1194 (portrait) · P phone 390.

## 1 · Mobile workspace

| Screen / flow | Role | Entry point | Devices | Screen ids | Connected prototype | Status · remaining gap |
|---|---|---|---|---|---|---|
| Navigation: tabs + More sheet, workspace/location switch, role, search, notifications | owner, manager, staff | app open | P | MW00, MW01, MW05, MW35 | all mobile flows | Completed · tab set per role generated from the registry (W36) |
| Owner: Today → issue → action → result | owner/manager | Today | P | MW02 → MW03 → MW04 | yes | Completed |
| Clients: search → record → balance → action | owner/manager/cashier | Clients tab, ⌘K | P (D: W41, W44) | MW05 → MW06 → MW07 → MW08 | yes | Completed · paid-by-link result shown on W57 |
| Projects: list → detail → approval → result | owner/manager | More › Projects | P (D: W42–W51) | MW09 → MW10 → MW11 → MW12 | yes | Completed |
| Appointments: agenda → appointment → reschedule/reassign/complete | owner/manager/assistant | Calendar tab | P (D: Calendar, W39) | MW13 → MW14 → MW15 → MW16 | yes | Needs correction · reassign sheet reuses MW15 pattern but is not drawn; complete = MW28 |
| Orders: queue → order → readiness → handoff | owner/manager/cashier | More › Orders | P (D: W15) | MW17 → MW18 → MW19 → MW20 | yes | Completed · partial handoff branch is a sheet option |
| Catalog: find → essentials → save | owner/manager | More › Catalog | P (D: W01–W09) | MW21 → MW22 → MW23 | yes | Completed · full editor desktop-only, stated |
| Layout editor on mobile | owner/manager | Spaces & Resources | P (D: W13) | MW24 | view only | Completed · scope explicit: view, block/unblock, activate; draw/map desktop-only |
| Ticket configuration on mobile | owner/manager | Events & Tickets | P (D: W17, W18) | MW25 | view + pause/limit | Completed · seat map, phases, allocations desktop-only |

## 2 · Professional's My work

| Screen / flow | Role | Entry point | Devices | Screen ids | Prototype | Status |
|---|---|---|---|---|---|---|
| Start: waiting for me, today, coming up | professional (staff or represented) | My work tab / talent app | P (D: W52) | MW26, M1 (TalentToday), A08 | yes | Completed · Work vs Projects resolved (`projects` = the job; `mywork` = the person's side) |
| Project assignment: accept/decline, brief, permitted client info, own fee | professional | My work › item | P | MW27, O04 | yes | Completed · assignment access ≠ workspace access, stated on screen |
| Appointment assignment: phases, permitted client info, add extra, complete | staff professional | My work › item | P | MW28, A08 | yes | Completed |
| Field job → job screens | field professional | My work › item | P | MW29 → F02, F03, F04, F05, F06, F08 | yes | Completed |
| Schedule conflict / change | professional | on accept | P | MW30, M1 conflict row | yes | Completed · Accept withheld while the conflict stands |
| Earnings / payout | professional | My work › Earnings | P | MW31 | — | Completed · own fees only |
| Roster membership vs assignment access vs staff permissions | — | People (W26, W28, W29, W30), invitations | D, P | W26–W30, MW32, MW33 | — | Completed · F16 contract: Bookable never grants money permissions; professional access is a scoped grant (MW33) |

## 3 · Dedicated operational screens

| Role | Screens | Devices | Status |
|---|---|---|---|
| Host: arrivals, waitlist, seating, resource check-in | POSLiveFloor, POSFloorList, POSFloorTimeline, POSWalkIn, POSWalkInBooking, POSSeatParty, POSAfterSeat, POSWaitlistOffer, R01–R06, S02, S04 | T | Completed |
| Instructor: roster, attendance, waitlist | K10 (new), POSClassCheckin, POSClassReleasedPlace, K01–K07 | T | Completed |
| Gate: scan, lookup, admission recovery | POSScan, POSGateReady/Admitted/Already/Wrong/Pending, G07, E09, G08 (new manual admission) | T | Completed · scan-out/re-entry state drawn in W18 settings only → Needs correction (add gate scan-out screen) |
| Kitchen / bar: queue, amendments, readiness | POSKitchen, POSSendResult, POSSendReview, POSCancelSent, K09 (new) | station | Completed |
| Field professional | F01–F09, MW29 | P, D (F09 office) | Completed |
| Cashier: fast collection and receipt | POSCounter, POSCollect, POSPaid, POSReceipts, POSReceiptDetail, POSCashTender, POSCounterPortrait | T landscape + portrait | Completed |
| Customer-facing display | CDIdle, CDWaiting, CDReview, CDCustomTip, CDConfirm, CDDeclined, CDSuccess, CDReceiptContact | display | Completed |

## 4 · Screens reached outside the sidebar

| Flow | Entry | Return | Screen ids | Status |
|---|---|---|---|---|
| Staff invitation → accept/decline → workspace | email/SMS link | the workspace, correct role | MW32 | Completed |
| Talent invitation → representation / assignments | link | My work or public profile | MW33 | Completed |
| Expired invitation · wrong account · removed access | link / sign-in | request new, switch account, other workspaces | MW34 | Completed |
| Notification → record → action → read/resolved | bell | the record | MW35, MW03 → MW04 | Completed |
| Global search → grouped results → detail | ⌘K / search icon | the record | W53, MW05 | Completed |
| Quick create → save → return | Create ▾ | originating screen | W54 | Completed |
| Create client/item while booking/selling → attach once → draft kept | picker | the draft | W54, MW37, POSCustomerCreate, POSCustomerAttachFailed | Completed |
| First-use setup → missing configuration → fix → resume | Overview | interrupted task | W55, C32 | Needs correction · C32 header/context fix (F20) pending on the POS side |
| Approval request → review → approve/reject → updated record | notification / POS PIN | requester's task | W56, POSManagerApproval | Completed |
| Receipt / ticket / booking / project link → authorized record → action | customer link | — | POSReceiptDetail, E08, A07, R04, O05, K04 | Completed |
| Expired link · unavailable record · permission denied · session ended | customer link | sign-in, request | MW36 | Completed |

## 5 · Customer transactional journeys (Website and Messages unchanged)

| Journey | Customer screens | Operator result | Status |
|---|---|---|---|
| Manage / reschedule / cancel a booking | A07, A09, R04, R05 | W57 row 1 (calendar updated) | Completed |
| Retrieve tickets, transfer, exchange | E08, E10, E11, E13, E14, E15 | W57 row 4, E09, gate refuses old QR | Completed |
| View receipt, pay an existing balance | POSReceiptDetail, payment link (MW07/MW08) | W57 row 5, AP-2041 paid | Completed |
| Pass, gift card, membership status | K04, P07, P08, P09 | K01, B05 | Needs correction · F13 (credit ledger) and F28 (membership lifecycle) still open |
| Accept an offer or amendment | O05, O06 | W57 row 2, W46 | Completed |
| Approve a deliverable / request revisions | O05 | W57 row 3, W47 | Completed |

## 6 · Shared dialogs and difficult states

| State | Pattern | Screen ids | Status |
|---|---|---|---|
| Unsaved changes; saving/saved/failed/retry; another operator changed the record | dialog / inline | W58 | Completed |
| Availability changed before confirmation | inline with alternatives | W59, POSHoldExpired, POSSoldOutOnCharge | Completed |
| Payment pending / unknown; succeeded but issuance failed | POS states | POSCardUnknown, POSCardLate, M16–M19, E07 | Completed |
| Partial payment; refund pending; refund failed | POS states | POSSplitPartial, POSRefundPending, POSRefundFailed | Completed |
| Cancellation / archive with impact preview | sheet / dialog | W50, W59, K05 | Completed |
| Lost connection and reconnect, limits | banner + list | W59, POSConnection, POSCounterOffline, POSSyncConflict, F08 | Completed |
| Empty workspace vs no results vs failed load | inline | W59 | Completed |
| Long form with validation and open keyboard | full page | MW37, POSCustomerCreateKeyboard, POSSearchKeyboard | Completed |

## 7 · Visual coherence

Clients and Projects records redesigned at full size (W41, W42) with one purpose and one next action; mobile at 390 (MW*), POS tablet landscape and portrait (POSCounterPortrait), customer display, station. Explanatory copy removed from operational pages; W43 remains a documentation page. Remaining polish is listed below.

## 8 · Not completed in this pass (recorded, not hidden)

Needs correction (design): F01–F15, F18–F31 POS fixture corrections from the audit ledger (money, capacity, timing), gate scan-out/re-entry screen, reassign-professional sheet, C32 context.
Missing (design): D02 details editor and item lifecycle; D03 menu list/detail; D04 modifier and price-rule editors; D05 stock receive/adjust; D06 phase editor, effective hours, forms manager; D07 workspace appointment list/detail; D11 applications review and import flow; D12 location/resource create; D13 reservation list/detail; D14 event creation steps, ticket-type drawer, phases, allocations; D15 event change/cancel, gate scan-out; D16 issued benefits view; D17 order board (desktop); D19 job office create; D20 sales detail; D21 transfer recording, terminal import; D22 device pairing, drawer movements; D23 workspace issue record; D24 client list/merge; D25 preset change preview, analytics.

Optional polish (separate from launch scope): dark mode, animation specs, icon set audit, Spanish for every new screen (EN/ES exists on the Counter journey only), print stylesheet for receipts.

Implementation approval state unchanged: designs, records and plan only.
