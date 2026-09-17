# Verified features → widgets for the page-builder templates (from the Tulala program session, 2026-09-16)

All of this is on `origin/main` and on production (tenant-gated). Engine = server actions + RPCs + tables; UI = the admin screens that already call them. Proof = Playwright rows on the QA host (`docs/plans/program/scenario-matrix.md`, "Wiring" section) + evidence under `docs/plans/program/evidence/**`. Anything marked (D-nnn) had a defect that PR #1993 fixes today.

## A. Public / customer-facing surfaces (what a website template can embed or link)
| Surface | Route | What it does | Engine entry |
|---|---|---|---|
| Book a service / class / appointment | `/book` (tenant host) | picker → people & place → time → details → deposit → confirmed; customer manage link by e-mail | `lib/server-actions/scheduling-engine.ts` (`createBooking…`, `reschedule/cancelBookingByManageToken`) |
| Customer self-manage | `/manage/<token>` | reschedule / cancel own booking (D-137 fixed) | same |
| Reserve a table | `/r/<slug>` + reservations block (block exists, never placed on a page: needs a widget) | party size, date, time, seat holds via capacity engine | `lib/server-actions/reservations*`, `reserve_resource_set_v2` |
| Events & tickets | `/events`, `/events/<slug>`, seat map + hold timer, checkout, `/ticket/<code>` (transfer / resend / lookup) (D-141 fixed) | admissions engine | `lib/venues/*`, `admission_*` RPCs |
| Guest QR at the table | `/visit/<token>` → menu / add / submit / share / bill (D-141 fixed) | guest order on the visit's check, kitchen ticket, pay | `lib/visits/*`, `lib/preparation/*` |
| Pay a link | `/pay/<code>` | payment link (cash desk, Messages, projects) → collects the sale (D-135 fixed), back-to-conversation (D-145 fixed) | `lib/payments/links.ts` |
| Customer thread | `/c/t/<token>`, `/c/<inquiryId>` | two-way thread with the workspace, payment request card, booking card | `lib/server-actions/messaging-engine.ts` |
| Menu / catalog display | `/p/<slug>`, `/menu` (`_menu`) | items, options, packages, live price phases (D-138), promotions, entitlements | `lib/catalog/*` |
| QR & links | `/q/<code>` | short codes to any of the above | links engine |
| Directory / profile | `/directory`, `/models`, `/me` | talent profiles, inquiry | inquiry funnel (`submitInquiry`) |

## B. Workspace (back office) — 24 destinations built (`web/src/lib/workspace/destinations.ts`)
Overview · Messages (5 tabs, needs-reply inbox, actions menu, payment request, create/link record) · Calendar (resources view) · Appointments & Classes (series editor, Generate sessions, substitute instructor with scope, move participant (D-136), cancel with scope + refund note) · Reservations · Orders · Projects (list, record with Overview/Scope/Money/Files/Who-sees-what, milestones, team replace, amendments, agreement, close, visibility) · Issues · Preparation (kitchen tickets, fire by course, prep stations) · Catalog (items, types, pricing, options, availability, channels, menu structure, promotions, entitlements, packages, price phases) · Events & Tickets (create, venue, seat map, door list, comp/exchange/multi-day/delivery (D-142)) · Spaces & Resources (locations, zones, layouts + activate, service periods) · Discounts · Clients (record, collect sheet, purchases) · People (applications, registration, rates) · Pitches · Reviews · Sales · Payments (links, activity, refunds at desk, role limits + approval inbox (D-139)) · Analytics · Website (builder) · Media · Settings (roles & limits, POS modes per location, devices, staff PIN, custom-amount limit). "My work" is intentionally unbuilt.

## C. POS modes (`web/src/lib/pos/modes.ts`, all built) — tablet 1194×834, portrait, offline
Counter (tiles, custom amount + manager PIN (D-133/134), discount, tip, link booking, hold/discard, cash tender EN/ES, cash open/close/movements/short, receipts, scan, customer attach/create, lock/unlock/switch operator, devices + heartbeat, offline cash outbox that replays and settles) · Floor/Tables (seat map, party waitlist join→notify→seat→leave (D-140), move table with version, split/merge/change server, check ops) · Door (tonight list, scan, exchange, comp) · Classes (check-in, waitlist offer accept/decline, released place) · Projects/Collect (office, payment link, collect sheet) · Messages rail row with unread badge in every mode.

## D. Money & identity rules the widgets must respect
USD only for display rules (never read default_currency); every order identified before payment (customer or guest session); collections idempotent by key with `expectedVersion` → "This just changed" conflict; refunds/discounts over role limit raise an approval request; payment link `paid` = sale collected; guest sessions are host-local cookies.

## E. What is NOT there (do not design a widget that pretends)
Stripe/Mercado Pago live keys (mock provider on QA); WhatsApp/SMS workers not hosted; passes/memberships/gift cards (boards P04–P09 exist, engine partial); WhatsApp threads engine-only.

## F. Where to look
Boards (approved design, 259): `docs/plans/program/evidence/fidelity-*/<Board>/board.png` (159 rendered) + `~/Downloads/Tulala-Blueprint-Workspace-and-POS.pdf` (all 262 pages). Engine contracts: `docs/plans/program/engine/{pos-money,scheduling,venue,messaging}.md`. Page-builder blocks: `web/src/lib/site-admin/builder-core/**`; the reservations block is the pattern for "a block that calls an engine" (`project_reservations_block_never_placed` memory).
