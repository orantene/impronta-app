# Decisions needing the owner · external dependencies · queued approvals

## Decisions (routine technical choices are made inside the plan; these are product/policy/access)
| ID | Decision | Recommendation | Consequence of waiting |
|---|---|---|---|
| D-POS-1 | Resource identity for tables, seats, courts, stations, equipment | **New `resources` table** (draft from POS-1.6) | Floor, seating, packages and Spaces mode all block |
| D-POS-2 | Appointment phases (processing keeps chair, frees staff) | **Service segments** (draft from POS-5.0a) | C05, C14 cannot be modelled; A13–A14 stay failed |
| D-POS-3 | Layout versions now vs host-assigned first | **Host-assigned first**; layout model behind POS-6.2 | Only R06 and X seat-map rows wait |
| D-POS-4 | Card reader for launch: Stripe Terminal vs Mercado Pago Point | Cannot be decided from the repo: **needs the seller arrangement and a sandbox account** | Every card-terminal scenario stays Awaiting external verification; cash/free/link work proceeds |
| D-POS-5 | Offline scope | **Online + cash-only degraded mode** (POS-2.11) | Full offline would add a local capacity model — out of launch |
| D-POS-6 | Identity rule for anonymous sales | **By product (`requires_identity`), never by amount** (POS-2.1a) | Contradicts PR F07 until changed |
| D-POS-7 | Alternate-collection exception | **Keep, only with the M26 policy** (both records, provider-only refund, owner approval) | If dropped, M26 and POS-3.6 are removed |
| D-POS-8 | Fiscal invoicing (CFDI) at launch | **Defer**; receipts labelled “not a fiscal invoice” | None for launch cases |
| D-POS-9 | People model: one person, three independent hats (Public profile = the profile engine · Bookable = what the POS, calendar and booking widget read · Access = sign-in and role), one `People` entry replacing the Roster list + Team drawer; customer-facing word per preset. Bookable is built from what exists (`talent_offerings`, `talent_booking_hours`, `direct_booking_enabled`, `booking_talent`) plus per-person POS permissions and requirement rules. See people-model.md | **Adopt** (designs W26–W35, owner approved the direction 2026-09-09); no data moves | Represented talent and staff who perform stay in two lists with two edit paths; POS-5.x “eligible professionals” has no single source |

## External dependencies (visible in totals)
| Dependency | Blocks | Remaining procedure |
|---|---|---|
| Stripe test keys in the isolated Next env | C01 deposit collection, all card states on qa-journeys | add keys to gitignored isolated env; `npm run stripe:sandbox`; re-run C01-CUS |
| Mercado Pago sandbox account | POS-3.7, POS-3.10 | obtain credentials; run P13–P16 against Point sandbox |
| Physical card reader + tablet | POS-3.10, POS-1.3 | device × OS × browser proof; disconnect mid-attempt; keyboard insets |
| Resolving PR #1934 conflicts | everything | POS-1.1a |
| Production migrations `20261230000700–20261230002200` (plus `20261231*` once the money/capacity hardening files exist) | release only | after test verification, per `db:push` protocol; never during planning |

## Queued approvals (not requested now)
Implementation start (this program) · live financial actions · production migration apply · production release/promotion.

## D-POS-10 — the POS mode id is `projects`

Decided 2026-09-09 by the implementation lead under the owner's standing
authority. Two design files disagreed: `modes.md` called the mode `client`
(labelled "Projects (formerly Client Work)"), while the audit disposition of the
same day said the registry entry was `work` and becomes `projects`.

The id is **`projects`**, matching the sidebar destination of the same name, so
one name covers the destination, the POS mode and the URL. `client` and `work`
are accepted as aliases wherever a stored value may still carry them, and
neither appears in new code. The mode's landing action is "Collect a balance".

**Why:** a mode whose id differs from its destination gives the same idea two
names, which is how the old "Client work" confusion started.

## D-POS-11 — the customer display offers no tip until the engine has a tip line

Decided 2026-09-11 by the `cd-scan` build under the owner's standing authority.
Design boards D02 and D03 offer 10% / 15% / 20% / custom / no tip on the
customer display. The order engine has no tip or gratuity concept anywhere:
no column on `orders`, `order_lines` or `booking_transactions`, no line kind,
and `addLine` accepts only a published `talent_offerings` row of this
workspace. Writing a tip as a fake catalogue line, or adding cents to a total
outside `cartTotals`, would be a second totals rule, which the program forbids.

**The display renders tips as not offered, in one sentence, in three
languages** (`dashboard.pos.display.tipNotOffered`), and the review screen
carries no tip control at all. When a tip line kind exists in the engine
(one write path, one totals rule, its own money row so the shift's expected
cash and the payout both see it), the display's review screen gains the
choices the board shows. Nothing about the display's state machine changes.

## D-POS-12 — receipt by text is not offered; receipt by email attaches the customer and sends the existing order email

Decided 2026-09-11 by the `cd-scan` build. Board D07 offers "Text me" and
"Email me"; D08 collects a phone number. There is no customer-facing SMS
sender in the codebase (the only Twilio path is the owner-alert WhatsApp
channel, gated on `SUPPORT_OWNER_WHATSAPP_TO`), and there is no
`posSendReceipt`. What does exist: `ensureCustomer` (the attach the counter's
own collection uses, idempotent on `(tenant, email)`), the order-confirmation
email (`lib/email/order-confirmation.ts`, carrying the public `/r/<code>`
link) and `sendEmailResult`, which reports `sent`, `skipped` (no provider
configured) or `failed`.

**Email is the one receipt channel the display offers.** The address becomes
the sale's customer through `ensureCustomer`, attached to the order only when
the order has no customer yet (a name the cashier attached is never
overwritten), and the order-confirmation email is sent. A `skipped` send is
told to the customer as such ("we saved your address, this workspace cannot
send email yet"), never as "sent". "Text me" renders disabled with a sentence
in three languages. Refused unless the order is paid.

## D-POS-13 — a scanned code is an offering id or a link code; there is no barcode column

Decided 2026-09-11 by the `cd-scan` build. `talent_offerings` has no `sku` or
`barcode` column. The two things a printed code can carry today are the
offering's own id (a UUID) and a QR & Links code (`/q/<code>` or the bare
code) whose row names the offering in `context.offering_id`, the same
relation `findLinkForSubject` already queries. The counter resolves exactly
those two shapes; anything else is "Nothing matches <code>" in a sentence.
Adding a `barcode` column to `talent_offerings` (unique per tenant) is the
honest next step for retail; it is a schema decision and is not taken here.

## D-POS-14 — the customer display follows the counter by a same-device beacon, else the workspace's newest open sale

Decided 2026-09-11 by the `cd-scan` build. There is no devices or registers
table, and no realtime channel. The display polls the counter's own reader
(`loadPosSale`) every two seconds. Which sale it follows: the `localStorage`
beacon the counter writes on the same device (a second window of the same
browser, for a tablet with an external screen) wins; a display on another
device follows the workspace's newest open draft. A sale the display has just
finished with is never re-adopted. When a registers table exists, the beacon
becomes a row keyed by register and the read gains a `registerId`; the state
machine does not change.
## D-POS-15 — the POS switch keeps the modes' own labels for now

Decided 2026-09-11 by the shell fidelity builder (fid-shell). The approved top
bar (W00) lists the modes as Counter · Appointments & Classes · Tables · Spaces
& Resources · Tickets & Admissions · Projects · Field Services. The built modes
are labelled through `dashboard.pos.counter.mode.*` (Counter · Tables · Door ·
Front desk · Collect), and those words are also the POS rails' own names and
what four proven journeys click. The switch therefore shows the modes' current
labels, plus the two modes with no screen (Spaces & Resources, Field Services)
disabled with "No screen yet". The relabel to the board's words belongs to the
POS shells (disposition F33: "POS shells Office/Bookings/Door relabel pending")
and changes the switch and the rails in one move.

## D-POS-16 — search never carries a per-client balance

Decided 2026-09-11 (fid-shell). The search board (W53) shows a client's "Due
now", "Next booking" and "Pass" in the preview pane with a Collect action. The
search reader (`lib/search/global-search.ts`) returns a record's title,
summary and address; no per-client balance reader exists in the engine. The
pane shows the record's own summary, "Open record" and "New appointment";
"Collect" is drawn disabled with the reason. The three record kinds the board
groups that the palette never searched (Clients, Sales by receipt code,
Catalog) were added to the same reader under RLS.

## D-POS-17 — an assistant sees the union of the three staff rails

Decided 2026-09-11 (fid-shell). W38 draws three staff rails: a cashier
(Orders, Clients, Sales), an assistant (Messages, Calendar, Appointments,
Clients) and a host (Messages, Calendar, Reservations, Clients). The tenant
role ladder has five ranks (viewer · editor · manager · admin · owner) and no
cashier, host or assistant; `nav-context.ts` folds editor and viewer into one
`assistant` hat. The registry now carries W36's owner · manager clause on
every other row, so an assistant-rank person sees Overview, Messages,
Calendar, Appointments & Classes, Reservations, Orders, Clients and Sales, and
"Setup is owner-only · ask the owner" where Settings would be. Telling the
three apart needs a job-function field on the membership, which is a People
model decision (D-POS-9), not a navigation one.

## D-POS-18 — the counter's location chip is the workspace's own name until a locations table exists

Decided 2026-09-11 by the `fid-counter` build. `POSCounter` draws a location
chip (`Centro`) with a chevron. There is no locations table and no
per-register row, so the chip shows the workspace's display name and opens
nothing; the cashier · drawer chip beside it names the signed-in person and
whether a drawer (`pos_shifts`) is open. Its menu is the two device screens.

## D-POS-19 — a line's options, notes and server have no line-level writer; the editor draws them disabled

Decided 2026-09-11 by the `fid-counter` build. `POSLineEdit` shows Options,
two notes, Served by and Line discount. `updateLine` changes units only, and
`order_lines` carries no note or server column, so those fields render
disabled with one sentence each; quantity, `Duplicate` (a second `addLine` of
the same offering and session) and `Remove line` are live.

## D-POS-20 — the price on a line is read-only at the counter

Decided 2026-09-11 by the `fid-counter` build. A line is priced from the
catalog (`repriceAndValidate` re-reads `talent_offerings.amount_cents`), so
`Price each` is drawn locked with "Changing the price needs a manager". A
manager-PIN model (D-POS-20) is what would unlock it.

## D-POS-21 — a new customer is named on the sale and attached at collection; language and consent are not recorded from the counter

Decided 2026-09-11 by the `fid-counter` build. `POSCustomerCreate` collects
name, phone and email. The counter does not insert a `customers` row: the
buyer rides on the sale and `startCollection` attaches them through
`ensureCustomer`, idempotent on (tenant, email) and (tenant, phone), which is
also why the duplicate warning on the form is a search on the typed phone or
email. `Language` and `Send them offers` have no writer on this path and are
drawn disabled with a sentence.

## D-POS-22 — discounts at the counter are codes; manual percentages and comps are not writable yet

Decided 2026-09-11 by the `fid-counter` build. `POSDiscount` offers `Enter a
code · Manual discount · Comp an item`. Only the code reaches the engine
(`repriceAndValidate` with `promoCode`); the sale has no column for a manual
figure or a comped line, so those two tabs draw their controls disabled with
one sentence each and the eligible-lines list is read-only (which lines a
code covers is the engine's decision at apply time).

## D-POS-23 — custom amounts and manager approval are drawn, not wired

Decided 2026-09-11 by the `fid-counter` build. `addLine` takes an offering
id, so a free-text amount cannot become a line; there is no manager PIN
table. `POSCustomAmount` opens from the last tile and `Continue · ask a
manager` opens `POSManagerApproval` exactly as the boards draw them; `Approve`
is disabled with the sentence. The typed description and figure stay on
screen so the refusal is met with the work intact.

## D-POS-24 — a held sale has no name; it is found by time and total

Decided 2026-09-11 by the `fid-counter` build. `POSHoldSale`'s `Name it`
field has no column on the draft order, so it renders disabled with the
sentence. Hold is the draft staying open in Orders (the row never expires on
its own); `Discard sale` is `cancelSale`.

## D-POS-25 — an expired class place offers remove or re-pick; re-hold has no command

Decided 2026-09-11 by the `fid-counter` build. The engine's `sold_out` refusal
(`capacityGone`) on a sale that carries a session line opens
`POSHoldExpired` instead of the banner. `Remove it from this sale` is
`removeLine`; `Pick another session` removes the line and returns the cashier
to the tile's chooser; `Hold it again` has no re-hold command and is drawn
disabled with the sentence.

## D-POS-26 — linking a counter sale to a booking is not wired

Decided 2026-09-11 by the `fid-counter` build. There is no reader for a
customer's open bookings on the counter path and no command that attaches a
sale to one. `POSLinkBooking` opens with the board's frame, one sentence, and
`Keep separate` as the only live action; both forest actions are disabled.

## D-POS-27 — bank transfer and two-method collection are drawn disabled on the collect screen

Decided 2026-09-11 by the `fid-counter` build. `startCollection` takes
`cash | online_card`; there is no transfer record and no split allocation at
the counter (M09/M10 are another group's boards). The two tiles say so.
`Take {amount} · rest by card` on the short state is disabled for the same
reason.

## D-POS-28 — the cash drawer has no device driver

Decided 2026-09-11 by the `fid-counter` build. `POSCashDone`'s `Open drawer`
and `POSDevices`'s drawer row are disabled with "No cash drawer is connected
to this device." The money is recorded before the dialog opens; the change is
given by hand.

## D-POS-29 — the Cash screen records the float and the close count only; movements, hand-over and a close note are not stored

Decided 2026-09-11 by the `fid-counter` build. `pos_shifts` has an opening
float, a closing count, an expected figure and a variance (money.md §3: no
movements or denominations table). `POSCashOpen` → `openShift`,
`POSCashClose` → `closeShift` (blind count: expected cash is shown only in
the result the engine returns). Add cash / Take cash out / Drop to safe /
Open (no sale), the hand-over card and `What happened` are drawn disabled
with one sentence each; the movements list says why it is empty. A choice of
drawer or responsible is one per workspace and the signed-in person.

## D-POS-30 — receipts list the workspace's paid counter sales; the method filter is not available

Decided 2026-09-11 by the `fid-counter` build. `listPaidPosSales`
(`lib/pos/sale-read.ts`) reads paid `orders` with `source_channel = pos` for
the last seven days with the buyer's name and line labels; a row opens the
same `/r/<code>` page the customer holds. `Cash · Card · Refunds` need the
money row's method and are disabled with a sentence; `Today · Yesterday ·
This week` and the search are live.

## D-POS-31 — the counter has no issues; the Issues screen says so

Decided 2026-09-11 by the `fid-counter` build. There is no issues table and
no reader for one (the design's Issues is the workspace's own inbox). The
rail row exists so the board's rail is complete; the screen draws the board's
filters disabled and one sentence. No count is drawn because nothing is
counted. `POSIssueDetail` has no data to render.

## D-POS-32 — every device status is a fact the counter read; nothing is queued offline

Decided 2026-09-11 by the `fid-counter` build. `POSDevices` reports the card
reader from `reportTerminalAvailability`, the scanner from the keyboard-wedge
listener, the customer display as a second window, and the two printers and
the drawer as not set up. `POSConnection` reads `navigator.onLine`; the
`Offline · cash only` chip appears from the same fact. Because D-POS-5 chose
online + cash-only degraded mode and nothing is queued on the device, the
offline counter disables Charge and says "nothing can be saved until it
returns" rather than the board's "Saved on this iPad · will sync".

## D-POS-33 — the scan screen looks up anything a code can be; narrowing is not available

Decided 2026-09-11 by the `fid-counter` build. `POSScan`'s `Products only ·
Tickets only · Passes only` have no effect on the resolver (D-POS-13: a code
is an offering id or a link code), so they are disabled with a sentence and
`Anything` is the live state. `Look up` resolves the typed code exactly as a
wedge scan does.

## D-POS-34 — the Lock and Favorites controls are drawn disabled until their data exists

Decided 2026-09-11 by the `fid-counter` build. There is no register PIN, so
`Lock` on the rail is disabled with "Register PINs are not set up yet" and
`POSLock` cannot be reached. There is no favourites flag on offerings, so the
`Favorites` chip is disabled with its sentence and `All` is the default.
## D-POS-35 — the Appointments & Classes page draws every board control; the ones the engine cannot serve are disabled with their reason

Decided 2026-09-11 by the appointments fidelity builder (fid-appts). Boards
W39 (Sessions) and W40 (Series) are built on `loadSchedule`,
`loadAppointments`, `loadSessionWaitlists` and the Front desk's roster reader
(`readAdmissionsRoster`, now shared with the workspace through
`loadSessionParticipants`). Wired: the Week / Day / List window, the Location
filter (the sessions' own venues), the Needs-attention filter, the row menu
(opens the panel), Change capacity (`setSessionPoolUnits`, the events night
editor's own writer, so Capacity's shrink refusal names the floor), the
waitlist door, Open check-in on the POS (when the Front desk mode is on), and
on the Appointments tab the move (`reschedule_booking_set`). Drawn disabled
with a one-sentence reason in en/es/fr, because no reader or writer exists:
**Generate sessions** (the sweep is the nightly cron over 90 days; nothing
runs it by hand), **+ New series** (no series writer; the one-off night form
is the only write, kept below the table), **Room** and **Instructor** filters
(a session stores a venue and no instructor), **Substitute instructor**,
**Move participant** (a refund and a new ticket is the engine's path),
**Cancel session** (no session cancel writer), the **Future sessions /
Entire series** scopes (`planSeriesEdit` exists; nothing applies it),
**Add a service** and **Cancel appointment** on the appointment panel.
Equipment positions and cancellation rules are not modelled; the facts card
says so instead of inventing a value. W10 (Generate sessions preview) has no
surface of its own: the sweep's refusals and skipped collisions are shown on
the Sessions tab, which is the same `decideMaterialisation` call the preview
would make.

## D-POS-36 — the Front desk draws boards B01 to B06 on the till's own commands; five controls are disabled with their reason

Decided 2026-09-11 (fid-appts). The Front desk mode (`?mode=classes`) is now
the two-pane Today screen (B01: Today / Due / Done, Appts | Classes, the
selected appointment with its sale's lines from `posLoadSale`, the totals,
Collect through the Counter's cash charge, Move it), the Add-extra sheet
(B02: `posAddLine` on the appointment's own sale, version carried), the
Walk-in sheet (B04: service, customer, NEXT FREE from `computePublicSlots`,
Pay = cash at the end or now), the class check-in (B05: numbered roster,
Check in = `markAttendance`, Sell drop-in = the walk-in seat, Add to
waitlist) and the "A place opened up" dialog (B06: offer to the next in line
= `promoteFromWaitlist`, sell as a drop-in, or leave it). Disabled with a
reason: **Use a pass** (passes and memberships are not modelled), **Who did
what** (a sale line is not attributed to a person), **Send payment link**
(links are the Counter mode's), **Rebook**, **Undo** a check-in (no un-admit),
**Fix** a bad ticket, **Scan a pass**, **Substitute instructor**, **Close
check-in · mark no-shows** (no no-show state), seat **positions**. A timed
extra added at the chair does NOT re-plan the appointment's end (B02's "Ends
13:35 · next client 14:00" needs a calendar re-plan writer); the sheet says
so. B03 (a sale linked to an appointment for payment only) is the Counter's
link-a-sale flow and is not built here. The mode keeps its own label, Front
desk (D-POS-15).

## D-POS-44 — a project has no owner and no blank "New project"; both are drawn disabled

Decided 2026-09-11 by the `fid-projects` build under the owner's standing
authority. W45 draws an `Owner` column, an `Owner: any` filter and a `New
project` button, and W42 an `Owner` line. `agency_bookings.owner_staff_id`
is not read by the projects reader and no name is resolved for it, so the
column and the line print a dash glyph for the absence and the filter is
disabled with the sentence. A project is minted only by `Create booking` on
an accepted offer (`convertInquiryToBookingAction`); there is no writer for
a project with no offer, so `New project` is disabled with the reason and
`From inquiry or offer` opens Messages, where projects are actually made.

## D-POS-45 — no reminder is sent from a project; "Request approval" and "Remind" are disabled

Decided 2026-09-11 (fid-projects). W42's banner offers `Request approval`
and W46's proposed-change card `Remind Mariana`. No engine action sends a
reminder to a client about a deliverable or a version, so both are drawn
disabled with "There is no reminder sender yet; ask the client from the
conversation". `Record approval given verbally` is live: it is
`approveDeliverable`, the same call as W47's `Approve (client)`.

## D-POS-37 — milestones have no amount and no editor here; files have no store

Decided 2026-09-11 (fid-projects). The boards print `$6,000` on every
milestone and offer `Add milestone`, `Edit`, `Upload` and a `Files &
activity` tab. `booking_deliverables` carries no money column (the record's
`ProjectAmount` says so), so the amount cell is a glyph with the sentence
"No amount is recorded on a milestone", never a zero. A deliverable is
written on the booking it belongs to and no file store hangs off a booking,
so `Add milestone`, `Edit` and `Upload` are disabled with their sentences;
the activity half of the tab reads `booking_activity_log` through a new
reader (`loadProjectActivity`) and is live.

## D-POS-38 — replacing a person shows the impact and cannot be confirmed

Decided 2026-09-11 (fid-projects). W48's sheet lists `Replacement` from
"people whose skills and requirements fit the shoot" and confirms with
`Replace and invite`. No reader lists who fits a job, `booking_talent` has
no invitation state, and nothing notifies the outgoing person, so the
`Replacement` field is disabled with the sentence and the confirm button
cannot be pressed. The impact rows are drawn from the record's own facts
(the date, the fee line, that client money stands) so the operator reads
the consequence before going to the conversation's lineup, where the swap
is actually made (`deleteBookingTalentRow` + `addBookingTalentRow`).

## D-POS-39 — Complete and Cancel are live on the close sheet; Archive and Reopen have no writer

Decided 2026-09-11 (fid-projects). W50's four choices map onto the engine
as follows: `Complete` calls `closeBookingAction`, offered only when
`closeReadiness` has no blockers AND the status is one the engine accepts
(`confirmed`, `in_progress`); `Cancel` calls `cancelBookingAction`, offered
whenever the status is cancellable; `Archive` and `Reopen later` are
refused with "Not available yet · nothing records this state" because no
action moves `agency_bookings.status` to `archived` or back. `closeOptions`
in `project-record.ts` carries the four verdicts and their reasons.

## D-POS-40 — the client collect sheet takes one record at a time

Decided 2026-09-11 (fid-projects). W44 lets several unpaid records be
ticked and `Continue to payment · $1,255` collects the sum. Which unpaid
records a single payment applies to is not recorded anywhere (the project
page's own `notBuilt.allocation` finding), so the sheet ticks the first
record, allows any number to be ticked, and enables `Continue to payment`
only when exactly one is: it opens the counter on that sale
(`/admin/pos?mode=counter&order=<id>`), the engine's real door. Two or more
ticked disable the button with the sentence. `Send payment link` is
disabled per D-POS-27. Tip reads "Not asked" (D-POS-11); pass or credit
reads "Not applicable"; the receipt channel is the customer's email, else
phone, else a printed code.

## D-POS-41 — the client record has no editor, no participants, no preferences, no intake

Decided 2026-09-11 (fid-projects). W41 draws `Edit`, `Contacts &
participants` (a daughter with guardian consent), `Preferences`
(professional, times, receipts, marketing) and `Intake · restricted`
(colour history, allergies). `customers` carries none of those columns and
no related table does; `Edit` is disabled with its sentence, the
participants card states that none are recorded, the preferences read "Not
recorded" except `Receipts` (email or phone on file), and the intake card
shows the CRM pair's tags and notes when present, else that none are on
file. `New ▾` opens the calendar, where a booking is made.

## D-POS-42 — the Collect mode's rail draws Links and Issues over one sentence each

Decided 2026-09-11 (fid-projects). The boards' rail is `Collect · Projects
· Links · Receipts · Issues`. `POS_MODE_META.projects.destinations` now
lists all five. `Links` (POSPaymentLink) draws the board's frame over "No
table records a sent payment link yet" plus the board's own rule about
resending; `Issues` reuses the counter's not-wired Issues screen
(D-POS-31). POSOffice's `Due now · Later · Needs approval` segments are
drawn on the Collect landing (O07) over `collectSegment`, and its `Record a
bank transfer` is disabled per D-POS-27.

## D-POS-43 — an amendment is shown in the till and sent from the conversation

Decided 2026-09-11 (fid-projects). O06 draws `Send v3 to Laura` and
`Discard proposal`. `sendOffer` needs the offer composer's line items and
re-seeds approvals, and no action discards a draft version, so the till
draws the three columns (accepted · kept, proposed, if the client accepts)
from the record's own versions and disables both buttons with "An
amendment is sent or withdrawn from the conversation's offer composer, not
from the till", beside the door to the workspace. `Earned so far` and `Paid
out` on O03's money strip read "Not recorded" and "Not read here": nothing
attaches an amount to a milestone and the payout ledger is not read by the
projects reader.
