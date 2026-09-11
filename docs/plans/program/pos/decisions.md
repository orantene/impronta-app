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
## D-POS-46 — the People page draws every board control on the three-hat readers; the ones the engine cannot serve are disabled with their reason

Decided 2026-09-11 by the people fidelity builder (fid-people). Boards W26,
W27, W28, W29, W30, W31, W32, W33, W34, W35, W11 and W22 are built on
`loadPeopleSurface` (the three hats over `agency_talent_roster`,
`agency_memberships` and `talent_booking_hours`, now also carrying the
roster's own card facts through `loadWorkspaceRosterForCurrentTenant`, each
person's `talent_offerings` and a one-line hours summary) and on the actions
that already exist. Wired: the four tabs as states of `/admin/people` under
`?view=` (the rail's children carry it, as Appointments' do); the Talent
cards, tiles and filters from the listed profiles; the Bookable and Access
tables; the person sheet with the hat strip, "Open the profile editor" (the
existing `talent-profile-shell` drawer, untouched), the Public profile and
Bookable switches (`setPersonPublicProfile`, `setPersonBookable`, with the
blanket-allow refusal kept), the Access role select, Give / Take access away,
the invitation to the address on the record; the Bookable hat's own offerings
list and "Edit X's offerings" (the drawer's Booking terms section); **Hours
& locations = the same `BookingHoursCard` the talent Calendar settings mount**
(`saveBookingHours`); Add a person → the roster's create drawer seeded with
the name and address (Public profile) or `invitePersonAccess` (Access), with
"Existing person?" matched by email against the loaded record set; Settings
› Roles & limits as an ACTION × ROLE matrix on `modesForPerson` and
`roleGrantsCapability` (the same table `userHasCapability` checks); the
Catalog page's "Who performs" block on `pickAProfessional` through
`loadWhoPerforms`. Drawn disabled with a one-sentence reason in en/es/fr,
because no reader or writer exists: **Invite a contractor** (a Bookable-only
person has no invitation; Add a person refuses Bookable alone the same way),
**Add from catalog** and the per-service **Add a professional** (a workspace
service names no required skill and is not assigned to a person; every
bookable person performs every item), **hours per location** (one hours row
serves every location), **Requirements checked at booking**, **Limits on
every brief**, **Pay** (talent cost lives on each booking's labor line, not
per person), the four **POS permission** switches (the Access role decides),
**Requirement to perform / Customer may choose / Phase rule** on the catalog
block (phases are D-POS-2), the **customer-facing word** (nothing stores it;
the POS and the booking page say "Professional"), Roles & limits' **Save**
and its untracked rows (comp / void, manual discount cap, drawer, void a sent
item, move tables, collect another way, re-authorising switch). The Access
and Bookable tables' **Locations, PIN, Drawer, Busy/free, POS permissions and
Pay** columns draw a dash whose title names what is not tracked. Trust
badges, skills and the "Earned" line are the profile drawer's own sections
and are not re-read into the sheet. Rooms and chairs (`profile_kind =
resource`) stay out of People (D-POS-1).

## D-POS-54 — passes, memberships and gift cards are drawn disabled behind one sentence

Decided 2026-09-11 (fid-catalog). W09 and the two W02 cards (`Pass or
membership`, `Gift card`) are built with every control disabled and the one
sentence the owner already knows, in three languages: "Selling passes needs
a product decision." `entitlement_credits` exists as a ledger a customer
holds; no product creates one, nothing bills a membership, and a gift card
is a liability nobody has decided how to carry. The three W09 cards show the
board's rows as the questions that decision answers, each reading "Not
decided". P04, P05, P07, P08 and P09 (the till's membership and gift-card
screens) are not drawn: they would be POS screens made only of disabled
controls under a mode the register does not offer, which the projects build
already ruled a fork (W19); the sentence lives on W09 and W02 instead.

## D-POS-55 — one catalog per workspace; location is a chip disabled with its reason

Decided 2026-09-11 (fid-catalog). W01's `Location: Centro`, W03's per-location
price lists and W07's `Centro · Polanco` switch all assume an item exists per
location. `talent_offerings` has no location column and no price-list table;
the list's Location chip, the structure view's switch and the price-list
rows are drawn disabled with "One catalog per workspace: items are not
recorded per location yet." The `Price lists` segment lists the one list the
engine has (every item's base price, always).

## D-POS-56 — preparation, fulfillment, photos and tables sections have no column on an item

Decided 2026-09-11 (fid-catalog). W01's Preparation column, W05's
`Fulfillment & preparation` (fulfillment, station, prep time, default
course), W04's station codes and preparation prompts, W07's `Tables & QR ·
sections → courses` and its QR-ordering switch, and W06's Tables, Table QR,
profile and private-link channels have no column on `talent_offerings` and
no related table. Each is drawn as the board draws it, disabled with one
sentence; the list prints a dash. Photos on a workspace item are disabled
too: `talent_offering_media` joins a talent profile and the workspace's rows
have none (the old editor said the same in English).

## D-POS-47 — tax category and cost are not read on the item; the receipt shows tax as unset

Decided 2026-09-11 (fid-catalog). `tax_categories` exists and `lib/catalog/tax`
computes a line's tax, but nothing on this surface reads or writes an item's
category, and no column records a cost. W03's `Tax category` reads "Unknown ·
not configured" disabled with its sentence; `Cost (optional)` is disabled;
the right column's example totals print "Not configured · not shown" for
tax, which is what the receipt does (`TAX_UNSET`), never 0.

## D-POS-48 — options are the two child rows the engine has; free-form groups have no writer

Decided 2026-09-11 (fid-catalog). W04 draws Milk · Size · Extras as option
groups. The engine has exactly two: OPTIONS (`talent_offering_variants`, the
buyer picks one; a row without a price is the base price) and EXTRAS
(`talent_offering_addons`, any number, each priced). Both are wired for the
workspace through `setWorkspaceMenuItemOptions`, the same replace-all writer
the talent editor uses (`replaceOfferingChildren`, now shared).
`catalog_modifier_groups` / `catalog_modifiers` (T1-04B) have a table and no
reader, writer or POS consumer, so `Add group` and `Copy groups from` are
disabled with "Two groups exist today (pick one, extras); free-form groups
have no writer yet." Per-option availability and station codes are dashes.

## D-POS-49 — availability is unlimited or one stock pool; dated batches and session pools are not on the item

Decided 2026-09-11 (fid-catalog). W05's four modes map to the engine as:
`Unlimited` and `Stock pool` wired through the capacity RPC
(`setMenuItemStockAction`: a number is AVAILABLE NOW and the pool total
becomes that plus what open orders hold); `Dated batches` disabled ("no table
yet; one stock pool per item today"); `Session pool` disabled ("places are
set on the session under Appointments & Classes, not on the item").
`When sold out` is shown as the engine's own rule, locked; low-stock warning
and lead time have no column. Cancellation is `cancellation_hours`.

## D-POS-50 — two channels exist: the website and the counter; every other switch is drawn disabled

Decided 2026-09-11 (fid-catalog). W06's six rows map to two flags: Website
is `visibility` (`agency_only` means staff can sell it and the site does not
show it, the storefront's own filter) and POS · Counter is `status` (the
counter's `addLine` refuses anything not `published`). Tables, Table QR,
Talent profile and Private link have no flag and a price override no column;
each is disabled with its sentence. The list's Channels column and the
right column's `Visible on` are derived from the same two flags
(`itemChannels`, tested).

## D-POS-51 — policies on an item are the identity rule, the account rule and pay-in-person; returns, refunds, discountability and comps are not recorded

Decided 2026-09-11 (fid-catalog). W06's Policies section is its own tab.
Wired: `requires_identity` with its reason (T1-04), `require_account_to_book`,
`allow_pay_in_person`. Returns, refund policy, `not discountable` and comp
allowance have no column; each is disabled with "No column records this
policy on an item yet; the counter's refunds desk decides case by case."

## D-POS-52 — the Promotions page is the codes table; manual limits by role have nothing to edit

Decided 2026-09-11 (fid-catalog). W08 at `/admin/discounts` (a child of the
Catalog destination) lists `tenant_promo_codes` with their redemption counts
from `tenant_promo_redemptions` (rows, never a counter), `New promotion`
opens the real form (`createTenantPromo`) and the on/off switch is
`setTenantPromoActive`. Stacking reads "One code per sale" on every row
because a sale carries one `promo_code_id`; the stacking-order card marks
`Codes` live and the other three steps as having no engine. `Manual discount
limits by role` reads "Not set" per role and `Edit limits` is disabled per
D-POS-22 (manual discounts and comps have no writer at the counter). Found
on the way: the old form sent `kind: "amount"`, which the table's CHECK
(`percent` | `fixed`) refused, so every fixed-amount code ever typed failed
with "unavailable"; the form now sends `fixed` with cents and the workspace
currency.

## D-POS-53 — packages, offers and the offer wizard are not built in the catalog group

Decided 2026-09-11 (fid-catalog). `Package` is a kind on `talent_offerings`
and is listed, created and edited as one item; PackageEditor's Composition
(components with their own capacity, dates and allocation), P01, P02, P03
and P06 (the till configuring, substituting, issuing and refunding a
package's components) need a package-components model that does not exist:
`lib/resources/hybrid-combinations` reserves several resources as one
command, but nothing on a catalog row names which rows are its components.
Offers.dc.html is the project agreement's version view, built as W46 under
`/admin/projects/[id]` by fid-projects; OfferWizard is a reservation-offer
wizard over pacing, buffers and assignment scope that Spaces & Resources
does not record. None of these is drawn as a page of disabled controls under
a route the registry does not know.

## D-POS-58 — the gate's second button, the manual admit's reason, and the "refund requested" state

Decided 2026-09-11 (fid-door). The Door mode's gate (G01 to G08) is the
counter's frame over Sessions' `scanAdmission` and Events' `admitAtDoor`;
the verdict hero is the engine's `DoorOutcome` and nothing else. The second
button under a verdict is decided by `gateSecondaryAction` (pure, tested):
`Look up the order` (G07) opens the lookup; `Redeem meal` (G02), `Let in
anyway · manager` (G03) and `Exchange date · box office` (G04) have no writer
(no meal benefit on a ticket, no manager override in `check_in`, no date
exchange) and are drawn disabled with their sentence in three languages.
G08's `Reason` and `Authorized by` are drawn disabled: `admitAtDoor` records
who was signed in, not a reason or a manager PIN. G05 (`Refund requested`)
is not a state the engine produces: `admissions.status` is valid, void or
refunded, and a refund request is not recorded on the row; a refunded ticket
scans as G07 `Cancelled`. It cannot be rendered from real data and is listed
as not wired rather than faked.

## D-POS-59 — ticket delivery, comps, passes, seats and the hold timer are not built at the door

Decided 2026-09-11 (fid-door). E15 (delivery) draws four rows over the one
fact the workspace has: the signed code was handed over at this till. No
ticket email is sent (`Resend` disabled), no SMS, no printer, no wallet
pass. E06's `Print tickets · Text link · Resend email` and E09's `Resend all
tickets` are disabled with the same sentences. E10's `Transfer` (re-issues
the credential; no writer bumps `token_version` for a new holder) and
`Exchange` (no writer moves a ticket to another night) are disabled;
`Cancel & refund` is the refunds desk's own `refundOrderAtDesk` with
`cancel_ticket`, and `Name it` is `posDoorNameTicket` (E13). E12 (comp from a
sponsor allocation) has no comp writer at the till (D-POS-22), E14 (a
multi-day pass issuing one credential per night) has no pass model, E03
(assigned seats) has no seat map (Spaces S4-S6), and E05 (a ten-minute hold
that expires) does not exist because `startCollection` reserves at the moment
the cash is confirmed: the box office says "Continue · N tickets" and "Seats
are held the moment the cash is confirmed", never "Hold N places".

## D-POS-60 — the Events destination: what a row does not carry is a dash or a disabled control

Decided 2026-09-11 (fid-door). W16, CreateEvent, EventDetail, W17 and W18
are drawn over `loadWorkspaceEvents`, `createEvent`, `addTier`, `updateTier`,
`setEventStatus`, `loadSessionPools` and `setSessionPoolUnits`. Sold, Left
and Door alloc. on the list print a dash with the reason (per night, on the
event's Tickets & Offers tab, where the night's pools give Attendance
capacity, Sold as committed peak, and Remaining). Venue is not on the row and
nothing edits `events.venue_id` after creation: the Venue column, W17's
Space / Layout / Blocked interval / Dining fields, `Change venue` and `Save`
are disabled with their sentence. Price phases, packages, allocations, named
ticket, transfer, re-entry, the venue commitment and `Block seats` have no
column on a tier. Templates, Import, Calendar, the Venue and Sales filters,
`Share`, and the Orders, Page & Promotion, Money & Reports and Settings tabs
have no engine behind them and say what they wait on. CreateEvent's
Essentials step writes the name, the sales model (`admission_kind`) and the
doors offset; every other field on the board has no column; steps 3 to 5
point at the Sessions page and the event's own tabs.

## D-POS-57 — event-day rules have no columns; the POS applies fixed answers and says so

Decided 2026-09-11 (fid-door). W18's Gate and Box office cards list every
rule the board names (entrances, scanner devices, re-entry, wrong night,
refund requested, refund confirmed, override, offline scanning, device, door
phase price, names, comp allocation, meal redemption, staff tonight) as a
disabled control whose value is what the engine actually does tonight (admits
once, refuses a wrong night by naming the night, a confirmed refund stops the
ticket immediately, manual admit without a PIN, no offline scanning, the
tier's price at the door, names optional at the till, no comps, whoever is
signed in). `Save` is disabled with the sentence. The Readiness strip is
derived from rows that exist: published, ticket types, nights scheduled,
pools on this night.
## D-POS-61 — the Tables mode and the Live Floor are one board; the moves the engine has no writer for are disabled with their reason

Decided 2026-09-11 (fid-tables). The till's Tables mode (`POSLiveFloor`,
`POSFloorTimeline`, `POSFloorList`, T04–T08, T12–T13, T23–T24, R01–R03) and
the workspace's Reservations destination (`LiveFloor`) draw ONE component
(`components/admin/floor/FloorBoard`) over the same readers (`listFloor`,
`loadHostStand`, `listBoard`) and the same writers (the Spaces page's
`tablesSeatParty` / `tablesMoveVisit` / `tablesCloseVisit` /
`tablesResetTable`, the host stand's `reservationsTakeWalkIn`, the counter's
`posSubmitPrep`, and the website block's own `loadReserveAvailability` +
`createReservation` behind a staff guard as `floorLoadReserveTimes` /
`floorCreateReservation`). The rail is the board's (Floor · Orders · Prep ·
Receipts · Issues): Orders is the list narrowed to open checks, Prep opens
the Preparation destination, Receipts and Issues open one sentence each
(the counter's readers are not mounted on this mode). Wired: seat (with the
join the combination rules allow, decided at seating), walk-in to the
waiting list, seat from the waiting list, move, party left → free the table
(the engine refuses while the check is unpaid), reset, send to the kitchen,
the staff reservation with the website's times and deposit, open order /
add items / collect on the counter. Drawn disabled over one sentence in
en/es/fr, because no writer or column exists: **Change server** (a visit
records no server), **Extend time** (the turn comes from the rules, not per
table), **Block table** (Spaces), **Split the check**, **Join tables** for
an already seated party and **Merge checks** (T15 after seating, T16),
**Keep the bill open / They paid another way / Walk-out** on T23, the
walk-in's **mobile** and **needs**, the waiting list's **Offer table** and
**Remove**, the move's **Why**, the seat sheet's **Server** and **No-show**
(the grace sweep stamps it), **Pause online bookings**, and the
reservation's **table preference / note / occasion**. A seated party's tile
is named `T2+T3` for a joined pair and the joined half is not drawn twice.
The floor plan has no coordinates (W13 is not built), so the map groups
tiles by room, else by kind. The list shows the next booking on a table
from tonight's book; the timeline draws seated, held, booked and vacated
blocks against the service window.

## D-POS-62 — Receipts on the Tables mode is one sentence

Decided 2026-09-11 (fid-tables). The board's rail draws Receipts; the
receipts reader (`listPaid…`, the counter's) is not mounted on the floor
route. The row opens "Receipts are the counter's screen. Switch to the
Counter mode to find a receipt by its code." rather than a blank, until a
shared receipts loader exists for every mode.

## D-POS-63 — the guest's table QR page greets, shows the bill, and cannot order or pay yet

Decided 2026-09-11 (fid-tables). Q01 is drawn on `loadOpenVisitByToken`
(now with the table's code, the visit's start and party): the venue, "Welcome
to table T2", when the visit started and for how many, the bill with its
lines and total in the check's own currency. Q02–Q07 (browse, submit,
substitution, pay at table, pay my share, already paid) have no engine:
`Start ordering`, `Pay all` and `Pay my share` are disabled over one
sentence each in en/es/fr. The server line says "Ask any member of staff"
because a visit records no server.

## D-POS-64 — the kitchen station is T26's own screen inside the Preparation destination; a station table and course firing are not built

Decided 2026-09-11 (fid-tables). The Preparation destination draws
`POSKitchen`: the station header with the venue's clock and counts, the
Preparing · Queued · Ready tabs (filters over the same `listBoard` rows),
one card per ticket with a timer from the send, the lines with `New` on
what this revision added (`addedLineIds`, the previous revision's snapshot
diffed on the server), `Start` / `Mark ready` / `Confirm handoff`, and the
K09 amendment banner. Not built, said: **Recall** (handed-off tickets are
not kept), station routing and dispatch rules (W15 has no stations table;
every ticket is `station = kitchen`), courses and firing, per-line cancel,
`avg` prep time. The board is drawn inside the workspace shell because the
destination lives there; a full-screen station mode is a later door.

## D-POS-65 — Settings › POS, Payments & providers, Locations and Booking policies: what is drawn and what is disabled

Decided 2026-09-11 (fid-money). The four settings boards are drawn over the
readers and writers that exist: `getPosModes` / `setPosModes` (the modes at
the one location), `getPosLocationFacts` (the default venue, its clock, the
open `pos_shifts` drawer, the platform's Stripe Terminal reader),
`getPaymentProviderStatus`, `loadTenantCommercialTerms` /
`updateTenantCommercialTerms` and `getBookingPolicyFacts` (the hold TTLs and
the waitlist offer window read from the modules that enforce them). Every
control the engine has no reader or writer for is drawn DISABLED with a
one-sentence reason in en/es/fr, never as a control that silently does
nothing: a second location and Field Services (no locations table, no service
zones); Pair a device (no device registry); every Tips, Receipts and Offline
field (tips, per-receipt language, text/email delivery, CFDI and an offline
mode are not modelled; the boxes show what the till actually does); Save and
Connect account on Payments & providers (providers are platform env, there is
no place to store a Mercado Pago account); Add location, Add zone, the zone
matrix, the surcharge and the professionals-per-zone control; Preview impact,
Publish, Manage forms, intake forms and per-role overrides on Booking
policies (no policy versions, no intake forms, capacity rules refuse everyone
alike). The method table is the engine's own facts (cash needs an open shift;
the reader row follows `stripe_terminal`; a payment link has no table; a
recorded bank transfer is not a tender `settleAtDoor` knows; credit is an
entitlement; two methods on one sale is `collection.split`). The Booking
policies table has no Rentals row (nothing sells a rental) and its
Reservations · tables row points at Reservations › Settings rather than
duplicating it. The nav label is the board's "POS" with the accessible name
"Point of sale" so the existing journeys keep their door.

## D-POS-66 — Sales, Payments and the first-run setup page: filters, imports and exports without a reader are disabled

Decided 2026-09-11 (fid-money). Sales (WS008) draws TYPE · REF · CUSTOMER ·
WHAT · WHEN · PAYMENT · FULFILMENT · AMOUNT · DUE over
`loadWorkspaceSalesActivity`; payment and fulfilment are ONE pill from the
row's status (`salesStatePill`), DUE is total minus collected, WHEN is on the
workspace's clock. The period, payment and seller filters and Export (scoped)
are disabled with their sentence (nothing filters by period, payment state or
seller); New sale opens the counter when that mode is on and says why not
otherwise. Payments (W25) is five tiles and six tabs over `loadPaymentsBoard`
(takings, owed, refunds, `pos_shifts`, the Issues queue's `refund_intent` and
`unresolved_collection` rows, `agencies.stripe_*`); Import terminal report
and Export are disabled (no table holds a terminal row), Next payout says the
schedule and amount are Stripe's and are not read, Reconciliation says
nothing has been imported and points unresolved collections at the Attempts
tab. The first-run page (W55, `/admin/setup`) is the Overview's setup reader
(`loadSetupItems`, now eight facts including "Who performs" and "Booking
policy") with a door per unfinished item, and "Blocked right now" is the
Issues queue's two most consequential rows. W56 (Approval review) is not
built: the engine has no per-action limit and no approval request to review,
so there is nothing to draw the dialog over; recorded here rather than as a
dialog that would approve nothing.

## D-POS-67 — a visit may own more than one order (split check)

Decided 2026-09-11 (engine-pos-money). L52 deferred a multi-order visit until
a case proved one visit needs several orders. Split check is that case:
`visit_split_check` moves unpaid lines onto a new draft order with the same
`visit_id`. Occupancy stays on `visits`. The commercial record stays `orders`.
There is no parallel check entity. Unique index `orders_one_per_visit` is
dropped. Recorded also as an L52 clarification in
`docs/plans/program/decisions.md`.

## D-POS-68 — waitlist_offers is the class/session hold, not restaurant T08

Decided 2026-09-11 (engine-pos-money). `waitlist_offers` holds a seat for a
`session_waitlist_entries` row via `reserve_resource_set_v2`. It has no party
or venue columns. Restaurant T08 party waitlist stays blocked until that
table exists.
## D-POS-69 — the till is full-bleed: no workspace top bar inside the point of sale; the rail's MODE chip is the mode switch (M33), the Tax row reads the tax outcome, tile badges are stock and variant facts

Decided 2026-09-11 (fid-polish1). `POSCounter` and `M33_ModeSwitch` draw the
point of sale with nothing of the workspace above it: a 96px rail, a 64px
header, the sell surface and the basket fill the viewport. The shell's POS
chrome branch therefore mounts no `TulalaIdentityBar`; the two things that
bar offered inside the till are on the rail. The `MODE · Counter` chip opens
the M33 menu (`PosRailModeMenu`, handed to `PosFrame` through
`PosModeMenuContext`), rendering the SAME model as the top bar's W00 switch
(`usePosModeMenuModel`: usable, turned off at this workspace, not your role,
no screen yet, remembered default); the `Workspace` door at the rail's foot
leaves. The board's per-mode live hints under each row ("14 today · 2
balances due") are not drawn: they need every mode's reader on every till
render. The customer display door moved from the rail (the board's rail is
five destinations, Lock and Workspace) to the cashier chip's menu beside
Devices and Connection, as a real `target="_blank"` link.

Tile badges come from facts the engine keeps: `Options` when the offering has
MORE THAN ONE `talent_offering_variants` row (one variant is not a choice and
sells as before), and a tap opens the chooser whose pick rides the line as
`variant_id` (`posAddLine` accepts it; `addLine` prices it); `N left` when
the offering's capacity pool mirror (`inventory_qty` WITH `capacity_pool_id`)
is at or under 5 units; `Sold out` at 0 (the tile cannot be tapped);
`Pick session` unchanged. A second tap on the same offering, variant and
session on an unsent line adds a unit to that line (`posUpdateLine`), so the
basket reads `2 · Latte · $90 each` as the board draws it, instead of a
second identical line. `Held until hh:mm` is the earliest live hold on the
line (`capacity_allocations`, state `hold`, not lapsed). The basket's Tax row
reads `orderTax` (`lib/catalog/tax`): `unset` says "Not set up" because no
line can carry a tax category yet (`talent_offerings` has no such column),
never a zero nobody decided; the `Saved hh:mm` line starts from the sale
row's `updated_at`. Favorites stays disabled (D-POS-31): nothing records one.

## D-POS-70 — a session's instructor is a user id on the row

Decided 2026-09-11 (engine-scheduling). Boards W39/W40 filter and substitute
by instructor. `sessions` had no instructor column. Additive
`session_series.instructor_user_id` and `sessions.instructor_user_id`
(nullable FK to auth users via uuid, no FK to a people table that does not
exist). Room stays `venue_id`. Overlapping room means overlapping scheduled
windows at the same venue. Numbered 70 because fidelity already used 60–69.

## D-POS-71 — Generate sessions is one explicit materialiser pass

Decided 2026-09-11 (engine-scheduling). `generateSessionsForSeries` calls
`decideMaterialisation` + `createSessionWithPools` once through `untilDate`.
The nightly cron is unchanged. Nothing is a second materialiser.

## D-POS-72 — cancelling a session never refunds inside the command

Decided 2026-09-11 (engine-scheduling). `session_cancel` voids admissions and
writes `ticket_refund_intents` with reason `session_cancelled`. The existing
cron pays. Same rule as `cancel_event_cascade`.

## D-POS-73 — customer manage is a signed token, not a new guest cookie

Decided 2026-09-11 (engine-scheduling). HMAC over `{bookingId, tenantId,
action, exp}` using `GUEST_COOKIE_SECRET`. The public page is the UI
session's. This package ships sign/verify only.

## D-POS-74 — a package is an offering with component rows

Decided 2026-09-11 (engine-scheduling). `offering_components` is the
composition. A price phase is stamped on the line the first time it is
priced and is never rewritten by a later phase. Passes, memberships and
gift cards stay out (D-POS-54).

## D-POS-75 — offering policy overrides and role limits are rows

Decided 2026-09-11 (engine-scheduling). `booking_policy_overrides` win over
offering / workspace defaults for deposit, free-cancel hours and no-show
fee. `role_limits` + `approval_requests` gate discounts and refunds above
the role's cents cap. W56 can now be a real review dialog over these rows.

## D-POS-76 — tenant places are venue_locations, not public.locations

Decided 2026-09-11 (engine-venue). `public.locations` is the city gazetteer
(country + city_slug). Spaces S2 already forbade reusing that name. Package 3
stores POS/workspace places in `venue_locations` and `venue_location_zones`.
Settings stay at `agencies.settings.pos.locations.<slug>.modes`. Every
existing agency is seeded with slug `default` so today's chip and modes path
do not change.

## D-POS-77 — ticket self-service is /ticket/[code], not /t/[code]

Decided 2026-09-11 (engine-venue). `/t` is `CANONICAL_TALENT_PREFIX` (talent
storefront). A second `/t/[code]` page would collide in the App Router.
Signed admission codes stay `adm1.…` from `admission-token.ts`. The public
ticket page is `/ticket/[code]`.
