# Messages & Inquiries in POS — design handoff (v1, 10 Sep 2026)

**Canvas:** https://claude.ai/code/artifact/68d97592-64ad-4a41-8071-1dbc7d321895 (64 artboards · 6 pages · sources under the design session scratchpad `msg-canvas/`, generated from `kit.mjs` / `shell.mjs` / `fixtures.mjs` copied from `tulala-canvas/v3`).
**Baseline:** `origin/main` c4f8bafeb · PR #1934 head a6b04b8c60 (draft, conflicting). Screen-code families `MS` (operator, tablet 1194×834) and `MC` (customer, phone 390×844) are new; checked against `screen-index.md` (no collision; `X`, `N`, `M`, `MW`, `WS` were avoided).
**Approval state unchanged:** design and records only. Nothing here authorizes implementation, migrations or live money.
**Scope guard (audit F-prompt line 31, coverage-final §5):** the workspace Messages page, the Website and the public profile are not redesigned. This package adds the POS destination and the customer transactional cards. The existing `/admin/messages` shell (three POV shells, inquiry stages, offers, lineup, payment tab) is the engine underneath; the POS surface reads and writes the same records.

## 1 · What Messages is inside POS

One shared destination in every mode's rail (`inbox` icon, unread count), below the mode's own destinations and above Lock (MS01). Opening it keeps the current sale, drafts, drawer session, in-progress payment attempt and its owner; a "Back to sale #1188 · $485 · 3 lines" strip returns to it (every MS board). An incoming message during an open card attempt is a toast beside the sale, never a modal (MS01). A conversation that needs another mode opens that workflow with the same return strip.

Three status families, always shown separately on the thread header (MS02), never merged into one pill:

| Family | Values | Source of truth |
|---|---|---|
| Conversation | Unread · Needs reply · Awaiting customer · Resolved | thread read state + last sender (`markClientThreadReadAction`, seen-state in `conversation-stash.ts`) |
| Opportunity | Gathering details · Offer sent · Awaiting acceptance · Won · Lost | the existing `InquiryStage` (`submitted`/`coordination` → gathering · `offer_pending` → sent/awaiting · `approved`/`booked` → won · `rejected`/`expired` → lost). No new pipeline. |
| Transaction | Draft · Confirmed · Payment pending · Paid · Fulfilled · Cancelled | order / booking / admission / allocation status + payment attempt state (`loadInquiryPaymentState`, `lib/pos/collection.ts` PR) |

A resolved conversation never cancels a record; a paid record never resolves the conversation. A support question with no sale keeps Opportunity = "No opportunity".

## 2 · Screen inventory (stable ids)

Devices: T = tablet 1194×834 (POS shell) · P = phone 390. Desktop 1440 and tablet-portrait variants: **Missing** (see §7).

| Id | Screen | Device | Purpose · one primary action | Reuses | Status |
|---|---|---|---|---|---|
| MS01 | Rail entry · unread · toast during payment | T | Reach Messages from any mode without losing the sale | `posShell` rail (kit MODES + shared item), M05 attempt state | Completed |
| MS02 | Inbox · list · thread · context panel | T | Find the conversation that needs me; reply | `AdminInboxList` rows/filters (admin-1.tsx), `AdminInquiryDetail` | Completed |
| MS03 | Inbox empty · no results · failed | T | Distinguish nothing-yet / nothing-found / could-not-load | W59 pattern | Completed |
| MS04 | Thread with no profile · progressive capture | T | Answer first; save only what the next action needs | `ensure-customer.ts`, C06–C10 create-and-return (POS-1.8) | Completed |
| MS05 | Match existing · duplicate · wrong link | T | Link to the right client, never merge people | `ensure-customer.ts` duplicate suggestion, C10 | Completed |
| MS06 | Assign conversation owner | T | Who replies and follows up | `coordinator` on inquiry (`inquiries.coordinator_id`), coordinator sheet in admin-2 | Completed |
| MS07 | Send options picker | T | Send choices or add to the draft; preview = customer card | catalog (`talent_offerings`, `product_packages`), sessions, events tiers, spaces; `SearchOrCreatePicker` (PR) | Completed |
| MS08 | Sent card states · shared draft · assisted basket | T | Keep one draft for both sides | `lib/pos/draft.ts` (PR) with `expectedVersion`; guest basket Q02 | Completed |
| MS09 | Time / availability selection | T | Send live slots; hold only on the customer's pick | `scheduling/public-slots`, `reservation-hold`, `capacity/reserve.ts`, hold TTL bounds | Completed |
| MS10 | Professional & resource picker | T | Eligible, available, preference vs confirmed, acceptance | People › Bookable (W30, D-POS-9), `reserve_resource_set` (PR), `talent_booking_hours`; resource identity D-POS-1 | Completed (resource rows depend on D-POS-1) |
| MS11 | Create or link… · multi-record panel | T | Show what is linked before creating more | C11 link-a-booking, `booking-shell.ts` (PR), inquiry↔order links | Completed |
| MS12 | Offer builder from the conversation | T | Customer content vs internal; catalog + custom lines | `createOffer` / `updateOfferDraft` (inquiry-engine-offers.ts), `Offer` type (rows, agencyFee, coordinators), W46 versions | Completed |
| MS13 | Offer preview · sent card · versions | T | Customer accepts an exact version | `sendOfferAction`, `reopenOfferForAmendment`, `counterOffer`, `clientRejectOffer`; O06 amendment | Completed |
| MS14 | Payment review · deposit/full/balance · remote or here | T | Same numbers as the customer card; one settlement | A05 deposit review, `requestInquiryPayment`, `createInquiryTransactionDraft`, POS Collect (M01–M13) | Completed |
| MS15 | Checkout handoff and return | T | Six states from requested to fulfilled; unknown never double-collects | `webhook-v2`, `stripe-payment-intent`, M06/M08/M26, `mint-on-paid` pattern | Completed |
| MS16 | Follow-up queue · reminders · close lost | T | One nudge per row; reminders that stop themselves | `reminders` cron, `setInquiryPinned/Archived`, stage `rejected` with reason | Completed |
| MS17 | Post-purchase change · impact preview | T | Open the real record; show effects before confirming | `rescheduleInquiry`, A09/A10, `ImpactPreview` (PR), K05 | Completed |
| MS18 | Recovery · conflict · duplicate · permission · setup | T | Named recovery for each failure | C22 conflict, `command_idempotency` (PR), M31, C32 | Completed |
| MC01 | Menu options card | P | Choose an item | public menu (Q02), `talent_offering_variants` | Completed |
| MC02 | Configure item sheet | P | Required choice, extras, quantity | C04/C05 rules, `lib/pos/addons.ts` (PR) | Completed |
| MC03 | Self-service basket · pickup window | P | Review and go to payment | same draft as MS08 | Completed |
| MC04 | Service card | P | Choose services; see deposit terms | A01 | Completed |
| MC05 | Professional + time options | P | Pick; hold with countdown | A02/A03, hold TTL | Completed |
| MC06 | Class / session · credits · waitlist | P | Enrol or join waitlist | K01/K02/K07, `drawdown_lesson_package` (PR) | Completed · waitlist schema missing (decisions.md) |
| MC07 | Resource interval · event tickets | P | Reserve an interval; pick ticket types | S02, E02/E04 | Completed · seats: E03 reference |
| MC08 | Offer review · accept / changes / decline | P | Accept the exact version and pay the deposit | O05, `approveOfferAction`, `rejectOfferAction` | Completed |
| MC09 | Offer and option states | P | Expired · unavailable · price changed · already accepted · already paid · cancelled | W59, E05, MW36 | Completed |
| MC10 | Payment request → secure page → result | P | Pay on the provider page; result back in the thread | Stripe Checkout (`stripe-checkout.ts`), `/checkout/success` | Completed |
| MC11 | Confirmation cards | P | Manage with the actions that exist | A06/A07, R03/R04, E08 | Completed |
| MC12 | Channel without cards (SMS) | P | Same secure link in text | notification catalog, `/q/[code]` short links | Completed |
| MC13 | Change request → change confirmation | P | See old vs new and what was kept | A09 | Completed |
| MC14 | Talent view · assignment arrives | P | Dani's day; no conversation content | A08, MW28 | Completed |
| PZ·pay, PZ·kitchen | Counter payment review; station | T | Family-specific steps of prototype 1 | C21/C25, T26 station shell | Completed |
| SA·deposit | Deposit card with hold countdown | P | Prototype 2 | A05 | Completed |
| AG·accepted | Accepted → deposit → project → assignments | T | Prototype 8 | O03, O04, W46–W49 | Completed |
| RC01/RC02 | Paid but not issued (operator / customer) | T/P | Prototype 11 | E07, M24/M25, outbox (PR) | Completed |
| CC01 | Customer sees both changes | P | Prototype 12 | C22 | Completed |

## 3 · Action contracts (format of `actions.md`)

| Action | Role | Preconditions | Inputs / validation | Command (existing → task) | Persisted effects | Success → | Failure / retry | Evidence |
|---|---|---|---|---|---|---|---|---|
| Open Messages from a mode (MS01) | any POS role | — | — | route `admin/pos?dest=messages` (task POS-11.1) | none; sale/draft/attempt untouched | MS02 with return strip | — | N05, new MSG-01 |
| Reply / internal note (MS02) | owner or any staff with Messages | thread visible to role | text; internal notes never sent | `sendClientMessageAction` (existing); internal → coordinator notes (`writeConvNote`) | message row; read state | thread | unsent kept on device; retry same id | MSG-02 |
| Save suggested details / link client (MS04, MS05) | staff | suggestion accepted explicitly | name required for a record; phone/email optional; duplicate choice | `ensure-customer.ts` + inquiry↔client link | one client; link by id; visitor label replaced | MS02 | attach failure → retry same record (C10) | R01, R21, MSG-03 |
| Assign conversation owner (MS06) | staff | — | staff user | `inquiries.coordinator_id` | owner; unassigned filter updates | MS02 | — | MSG-04 |
| Send options (MS07) | staff | items sellable at this location/channel | selection; preview shown | new `messages/option-cards` (task POS-11.2) writing structured cards (Messages plan §5) | card message with ids + version; no price snapshot as agreement | MS08 | send failure → retry same card id | MSG-05 |
| Customer selects / configures (MC01–MC03) | customer | card current | required options; qty | `lib/pos/draft.ts` (PR) with `expectedVersion`; `addons.ts` pricing | draft line; version bump | MC03 | stale → CC01; sold out → MC09 | P02–P03, MSG-06 |
| Send times / pick a time (MS09, MC05) | staff / customer | eligible professional; slots live | slot; recheck at pick | `public-slots` + `reservation-hold` (hold TTL bounds) | hold with expiry (customer pick only) | MS10 / MC05 | slot gone → MC09 alternatives | A11–A18, A33, MSG-07 |
| Assign professional / resources (MS10) | front desk | eligibility, location, availability; resource free incl. buffers | preference vs confirmed; acceptance rule | `reserve_resource_set` (PR); People › Bookable | booking assignment; holds | MS14 | conflict → alternative; represented talent → pending (O04) | A15, A47, MSG-08 |
| Create or link (MS11) | staff | shows linked set first | choice | `booking-shell.ts` (PR), inquiry links | one record per choice | record | already-created → open (MS18) | N18, MSG-09 |
| Offer draft / send / revise (MS12, MS13) | staff with offer permission | customer + ≥1 line | totals server-side; validity; terms | `createOffer`, `updateOfferDraft`, `sendOfferAction`, `reopenOfferForAmendment` | versioned offer; internal fields never in customer payload | MS13 | — | C08-OP, MSG-10 |
| Customer accepts / requests changes / declines (MC08) | customer | version current, not expired | exact version id | `approveOfferAction` / `counterOffer` / `clientRejectOffer` | acceptance on that version; deposit request | MC10 → AG·accepted | expired → MC09 | C08-CUS (currently pending), MSG-11 |
| Record acceptance on behalf (MS13) | manager | policy allows; evidence attached | evidence file/reference | new field on acceptance (task POS-11.3) | acceptance with `recorded_by` + evidence | MS13 | — | MSG-12 |
| Request payment (MS14) | cashier/manager | payable exists; no open attempt | deposit/full/balance | payment links (task POS-3.11) + `requestInquiryPayment` | link with expiry; attempt lock | MS15 | resend reuses link; unknown → M06 rules | P13–P16, MSG-13 |
| Collect here (MS14) | cashier w/ drawer | same | method | `lib/pos/collection.ts` (PR) | one payment per payable | M13 → thread | decline/unknown per M07/M06 | P11–P18 |
| Issue on paid (MS15) | system | payment confirmed | — | `mint-on-paid` pattern per record type (task POS-11.4) | order/booking/admissions created once (idempotent) | MS15 issued | issuance failed → RC01 (Issues) | E07, MSG-14 |
| Follow-up reminder / close lost (MS16) | owner | offer or request outstanding | time; reason | reminders cron + template; stage `rejected` w/ reason | one scheduled message; stops on reply/accept/pay/expiry/cancel | MS16 | — | MSG-15 |
| Amend / reschedule / cancel from thread (MS17) | staff per policy | record exists | impact preview accepted | `rescheduleInquiry`, refund plan | original kept until replacement; terms until amendment accepted | MC13 | policy fee shown before confirm | A09, A10, MSG-16 |
| Resolve conflict / duplicate (MS18, CC01) | staff | version mismatch | choice | `command_idempotency` (PR), draft `expectedVersion` | one record, one charge | thread | — | C22, MSG-17 |

Permissions: the POS role matrix (W22) gets four new keys — `messages.read`, `messages.reply`, `messages.send_options`, `messages.request_payment` — enforced server-side (POS-1.7 rule). Hiding the rail item is not access control.

## 4 · Connected prototypes

| # | Prototype | Boards (in order) | Destination record(s) | Status |
|---|---|---|---|---|
| 1 | Pizza · Counter | P1·01–P1·12 (= MS02, MS04, MC01, MC02, MS07, MC03, MS08, PZ·pay, MC10, MS15, MC11, PZ·kitchen) | order #1203 · kitchen ticket (T26) · receipt | **Complete** (operator, customer, kitchen) |
| 2 | Salon · Appointments | P2·01–P2·11 (= MS06, MC04, MS09, MC05, MS10, MS14, SA·deposit, MC11, MC14, MS17, MC13) | AP-2041 · Dani's day (A08) · chair/basin allocation | **Complete** (operator, customer, professional) |
| 8 | Agency · Projects | P8·01–P8·05 (= MS12, MS13, MC08, AG·accepted, MS18) + O03, O04, O05, O06, O02 | IQ-512 → PJ-27 · assignments · deposit | **Complete via linked screens**; customer acceptance + payment link are the new steps |
| 11 | Recovery | P11·01, P11·02 (+ M24/M25) | order from existing payment | **Complete** |
| 12 | Concurrent | P12·01, P12·02 (+ C22) | one draft, one order, one charge | **Complete** |
| 3 | Spa group | MS07/MS09/MS10 with several recipients + A02 "people & place", A05, A06 | booking set (couples/group) | **Mapped, not drawn**: multi-recipient card (per-recipient services) is Missing |
| 4 | Restaurant | MS11 + R01–R05, T01–T09, Q05 | reservation → visit → checks | **Mapped, not drawn**: reservation-with-deposit card and arrival→visit link are references only |
| 5 | Resource booking | MC07 (top) + S02, S04 (extend) | allocation | **Mapped, not drawn**: extension request card is Missing |
| 6 | Class | MC06 + K01, K02, K07, K10 | enrolment / waitlist | **Mapped, not drawn**: participant/pass validation sheet is Missing |
| 7 | Event | MC07 (bottom) + E02–E06, E08 | admissions | **Mapped, not drawn**: attendee naming in the thread is Missing (E13 reference) |
| 9 | Field service | MS12 (quote) + F02–F05, F09 | job, amendment, balance | **Mapped, not drawn**: address/scope capture card and travel-aware assignment are Missing |
| 10 | Hybrid package | MS11 + P01–P03 | package with dependent allocations | **Mapped, not drawn**: dependent-availability card is Missing |

## 5 · Existing · unfinished · new (per baseline.md and PR #1934 START-HERE)

| Layer | Exists on `main` / PR | Unfinished | New (this package) |
|---|---|---|---|
| Inquiry, offers, lineup, talent acceptance | `inquiry-engine-*`, `_pipeline-actions.ts`, `/admin/messages` three shells; C08-OP/TAL proven on qa-journeys (invite, draft, send, talent accept) | C08-CUS acceptance (client still pending); amendment acceptance UI (O06) | customer acceptance card (MC08) tied to `approveOfferAction`; acceptance-on-behalf evidence |
| Customer thread | `/c/[inquiryId]` guest thread, `client/messages` shell, structured cards (Messages plan §5) | option/time/professional/ticket cards | MC01–MC07 card family; SMS text fallback (MC12) |
| Drafts and baskets | `lib/pos/draft.ts` + `commands.ts` with `expectedVersion` (PR); guest QR basket (Q02) | draft shared between customer and operator | one draft id across MC03/MS08; conflict surfaces (CC01, MS18) |
| Availability and holds | `scheduling/*`, `capacity/reserve.ts`, hold TTL bounds, `reserve_resource_set` (PR) | resource identity (D-POS-1); segments (D-POS-2) | hold-on-pick semantics in cards (MC05, SA·deposit) |
| Payment | Stripe PI/Checkout, webhook-v2; POS collection (PR); MP Point (PR) | **payment links: none exists** (POS-3.11); unknown-outcome UI | payment request card (MC10) and MS15 state ladder on top of POS-3.11 |
| Issuance | `mint-on-paid` (events), orders `complete-order` | issuance-failed state for orders/bookings | RC01/RC02 recovery |
| POS shell | `admin/pos/pos-client.tsx` (PR): register + Tables + Preparation + Door | seven modes (POS-1.x) | shared Messages rail item + return strip |

## 6 · Tasks (append to `execution-plan.md` as project POS-11 · Messages; deps on POS-1.1a, POS-1.7, POS-3.1, POS-3.11)

| ID | Task | Deps | Acceptance | Reuse | Config / migration / permissions | Checks & evidence | Owns | Next ready |
|---|---|---|---|---|---|---|---|---|
| POS-11.1 | Messages destination in the POS shell + return strip (MS01–MS03) | POS-1.7 | rail item in every mode; unread count; opening keeps sale/draft/drawer/attempt; toast never over an open attempt | `pos-client.tsx` (PR), `AdminInboxList` | `messages.read` permission | N05; browser MS01→MS02→back | `admin/pos/messages/*` | POS-11.2 |
| POS-11.2 | Option / time / professional / ticket cards (MS07–MS10, MC01–MC07) | POS-11.1, POS-1.2 | operator preview = customer card; card carries version + state; no internal fields in payload (static test) | structured cards (Messages plan §5), `public-slots`, catalog reads | card message type + `card_version` (migration) | MSG-05–08; payload allow-list static test | `lib/messages/cards/*` | POS-11.3, POS-11.5 |
| POS-11.3 | Offer from the thread + customer acceptance + acceptance-on-behalf evidence (MS12, MS13, MC08, MC09) | POS-11.2 | accept binds to a version id; expired/superseded refused; evidence stored | `inquiry-engine-offers.ts`, `approveOfferAction` | `acceptance_evidence` columns (migration) | C08-CUS re-run to accepted; MSG-10–12 | offers engine | POS-11.4 |
| POS-11.4 | Payment request → issuance ladder (MS14, MS15, MC10, MC11, RC01) | POS-3.11, POS-3.1 | requested/opened/pending/paid/issued/fulfilled distinct; second request disabled while pending; issue-from-payment recovery | `links.ts` (POS-3.11), `mint-on-paid` pattern | none beyond POS-3.11 | P13–P16 on links; MSG-13–14; failure injection for issuance | `lib/messages/payment-request.ts` | POS-11.6 |
| POS-11.5 | Shared draft between customer and operator (MS08, MC03, CC01, MS18) | POS-11.2 | one draft id; `expectedVersion` on both sides; conflict shown with diff; never a second order | `lib/pos/draft.ts` (PR) | none | MSG-06, MSG-17; two-writer test | draft module | — |
| POS-11.6 | Follow-up queue + reminders that stop (MS16) | POS-11.3 | one scheduled message per row; cancelled on reply/accept/pay/expiry/cancel | reminders cron, templates | `followups` table (migration) | MSG-15 | `lib/messages/followups.ts` | — |
| POS-11.7 | Amend / reschedule / cancel from the thread (MS17, MC13) | POS-11.4 | impact preview from the real record; original kept until replacement | `rescheduleInquiry`, refund plan, `ImpactPreview` (PR) | none | A09/A10 rows; MSG-16 | — | — |
| POS-11.8 | SMS/WhatsApp text fallback (MC12) | POS-11.4 | same link, same receipt; no promised buttons | notification catalog, `/q/[code]` | provider config | MSG-18 | notifications | — |
| POS-11.9 | Prototypes 3–7, 9, 10 family-specific cards (§4 Missing list) | POS-11.2 | each Missing card designed + one acceptance row each | journey screens named in §4 | — | design review | canvas | — |

New acceptance rows MSG-01–MSG-18 go to the scenario register on the PR (`scenario-register-404.md`) under family "Messages"; they are case-role records, never summed with blueprint scenarios.

## 7 · Not completed in this pass (recorded, not hidden)

- **Missing (design):** desktop 1440 layout for MS boards (three-pane at 1440 is a spacing change, not a new pattern — still undrawn); tablet portrait 834×1194 for the thread with open keyboard; the seven family-specific cards listed in §4; a long-thread board with attachments and a large basket; EN/ES variants of MS/MC boards (label map exists for the rail only).
- **Needs decision:** whether `messages.request_payment` is a cashier default or manager-only (W22); whether acceptance-on-behalf is enabled per workspace or per role.
- **Depends on external work:** payment links (POS-3.11) do not exist on `main` or the PR; every "request payment" state is designed against that task. Resource rows in MS10 depend on D-POS-1.
- **Verification:** none of these screens is "complete" in the program sense until POS-11.x actions are implemented and verified on qa-journeys; the C08 rows on the PR are the only executed evidence in this area today.
