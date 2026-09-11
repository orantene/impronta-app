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
