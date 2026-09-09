# Modes by the operator’s work, and the case → mode map

One shared POS shell; shared services for transactions, payments, identity, availability and fulfilment. A **mode** is a focused operational interface over those services with its own default view and repeated actions. Names are validated against the Navigation master (`Operate` group: Calendar · Sales · Orders · POS · Reservations) and the PR #1934 POS shell (`admin/pos/pos-client.tsx`, currently one register view + Tables + Preparation + Door): the seven modes below are proposed destinations under `/admin/pos` with stable ids; labels are configurable, ids are not.

| Mode (id) | Default working view | Views inside | Required focus | v3.3 screens |
|---|---|---|---|---|
| Counter (`counter`) | Sell / basket | Sell · Orders · Receipts · Cash · Issues | products, modifiers, anonymous walk-ins, held sales, pickup, checkout | C01–C32 |
| Appointments & Classes (`appts`) | Today / schedule | Today · Schedule · Sell · Receipts · Issues | appointments, sessions, participants, professional/resource availability, completion, collection | A01–A10, B01–B06, K01–K07 |
| Tables (`tables`) | Floor / open parties | Floor · Orders · Prep · Receipts · Issues | seating, checks, courses, preparation, table operations, settlement | T01–T28, Q01–Q07 |
| Spaces & Resources (`spaces`) | Availability / allocations | Availability · Allocations · Sell · Receipts · Issues | rooms, courts, stations, equipment; arrival, use, extension, release; custody/rental separately | S01–S06, R01–R06 |
| Tickets & Admissions (`tickets`) | Sell tickets **or** Gate, by role | Sell tickets · Gate · Lookup · Receipts · Issues | future presales, occurrences, seats, issuance, admission, benefits | E01–E15, G01–G07 |
| Projects (formerly Client Work) (`client`) | Due / projects | Due · Projects · Links · Receipts · Issues | offers, agreements, milestones, deliverables, deposits, fast collection | O01–O06 |
| Field Services (`field`) | Today’s jobs (phone) | Jobs · Schedule · Collect · Issues | address, travel, arrival, work, amendments, completion, collection; no office controls | F01–F09 |

Not modes: preparation station (T26, station shell), customer display (D01–D08), gate scanner (G01–G07 is a *view* of Tickets), subscriptions/passes/gift cards/memberships (products + entitlement/billing workflows: K03–K05, P04–P09).

## Safe switching (M33)
Only enabled + authorized modes are listed; a useful default is remembered per device/role; saved sales and the drawer survive switching and “Back to workspace”; an in-progress payment stays attached to its payable, device and owner; switching workspace or role re-authorizes and clears inaccessible data; deep links and return context are preserved; hybrids share records. Hiding a mode is not access control — `admin/pos/actions.ts` and every command must enforce permissions server-side (task POS-1.7).

## Who does not start in POS
| Role | Starts in | Collection |
|---|---|---|
| Assigned talent | Talent Today / Calendar / Assignments / deliverables (A08, O04) | Only when authorized (Field mode F05) |
| Agency staff | Projects · Projects (O03, O06) | Projects · Due (O01) |
| Online-only seller | Workspace Orders + fulfilment (C21, C25) | Not needed |
| Host | Tables · Floor or Spaces · Allocations (T01, S03) | Not by default |
| Kitchen / bar | Station screen (T26) | Never |
| Gate staff | Tickets · Gate + Lookup (G01–G07, E09) | Never (box office is a separate view/role) |

## Case → mode map (all 48)

Enabled activities and primary/secondary modes; operator role; customer entry; talent view; shared records; the documented critical combination; acceptance families (case-role records C0x-CUS/OP/TAL/DIFF/REC plus blueprint scenarios).

| Case | Activities | Primary mode / view | Secondary | Operator | Customer entry | Talent view | Shared records | Critical combination | Scenarios |
|---|---|---|---|---|---|---|---|---|---|
| C01 Nail salon | appointments, retail | Appts · Today | Counter | front desk | website booking widget, A07 | A08 | booking, stations, order | bridal group of 4 holds 4 techs + 4 stations atomically | C01-*, A11–A18, N25 |
| C02 Spa | appointments | Appts | Counter | reception | widget, A07 | A08 | booking, therapists, room | couples massage reserves 2 therapists + 1 room together | C02-*, A15, N25 |
| C03 Independent massage | mobile appointments | Field · Jobs | Appts | the professional | profile, A07 | F01–F08 | booking, travel, private clients | home visit blocks studio slot; spa sees busy only | C03-*, A19–A23, R25 |
| C04 Tattoo studio | multi-session agreement | Projects · Projects | Appts | studio | offer acceptance, O05 | A08 | agreement v2, per-session deposits | 4 sessions as one agreement | C04-*, C17–C18 |
| C05 Hair salon | phased appointments, retail | Appts | Counter | front desk | widget, A07 | A08 | booking phases, chair, wash | colour releases chair during development; wash held only for its phase | C05-*, A13–A14 |
| C06 Restaurant | reservations, dining, QR | Tables · Floor | Counter, Prep | host, servers | reservation block, Q01–Q07 | — | reservation, visit, checks, tickets | QR order, courses, table move, 3-way split | C06-*, S13–S49, P19–P21, P37 |
| C07 Bar | tabs, booths, gig tickets | Tables | Tickets, Counter | bar staff | Q01, E08 | performer O04 | tab/visit, booth reservation, admission, performer fee | tab across the night; booth ≠ ticket; performer fee separate payable | C07-*, N19, X-rows |
| C08 Agency | projects | Projects | — | agency staff | inquiry, O05 | O04 | inquiry → offer → assignment | 3-model shoot booked atomically; fees vs margin | C08-*, C17–C20, N22 |
| C09 Fitness studio | classes, passes | Appts · classes | Counter | front desk | timetable widget, K04 | A08 | session, enrollment, credits | walk-in at the door against the same pool; attendance without payment | C09-*, A25–A36 |
| C10 Photography studio | projects, appointments, studio | Projects | Appts, Spaces | studio | O05 | O04 | agreement, booking, studio allocation | photographer + assistant + studio together; overtime repricing approval | C10-*, C19–C20, S52 |
| C11 Beach club | cabanas, minimum spend, orders | Tables · Floor | Spaces, Tickets | host | reservation block, Q01 | — | reservation with terms, visit, checks | cabana minimum consumed by orders; remaining credit visible | C11-*, S45, T25–T28 |
| C12 Event venue | events, private hire, performers | Tickets · Sell/Gate | Spaces, Tables | box office, gate | ticket selector, E08 | performer O04 | event, occurrence, allocation, admissions | private hire invoiced; performer assigned; second layout cannot create capacity | C12-*, X01–X84, R06 |
| C13 Coworking | rooms, café, workshops | Spaces | Counter, Appts | front desk | reservation block, timetable | instructor A08 | space allocation, order, session | café sale, room booking, workshop place coexist | C13-*, N26, S51 |
| C14 Beauty academy | supervised services, demos | Appts | Tickets | academy | widget | student/supervisor A08 | booking with 2 people + station | student **and** supervisor **and** station, priced as training | C14-*, A15 |
| C15 Cooking school | classes, catering, pop-up | Appts · classes | Projects, Tables | school | timetable, O05 | A08 | session, agreement, kitchen allocation | private catering blocks the kitchen for the pop-up | C15-*, S14–S16 |
| C16 Diving school | lessons, departures, coaching | Appts · classes (departures as sessions) | Spaces (vessel) | school | timetable | A08 | session with vessel capacity, manifest | departure caps at vessel capacity; cancelled departure releases + refunds as one action | C16-*, A26, A58, X64 |
| C17 Padel club | courts, coaching, café | Spaces · Availability | Appts, Counter | front desk | reservation block | coach A08 | court allocation, session, order | tournament reserves all courts; café keeps selling | C17-*, S14, S26 |
| C18 Podcast studio | room hire, lessons, live audience | Spaces | Appts, Tickets | studio | reservation block, ticket selector | engineer A08 | room + engineer + audience seats | live recording holds room, engineer and seats together | C18-*, S52, X-rows |
| C19 Pet grooming | appointments, classes, events | Appts | Tickets | front desk | widget | A08 | booking, session, event in another room | adoption event does not block grooming in a different room | C19-*, S16 |
| C20 Art gallery | workshops, admission, private hire | Tickets | Spaces, Appts | gallery | ticket selector, timetable | — | event, allocation, session | workshop, hire and open admission cannot double-book the room | C20-*, S14, N26 |
| C21 Wellness retreat | multi-day classes, treatments | Appts · classes | Counter (packages) | organiser | package widget | A08 | package, sessions, treatments | add massage day 2, cancel day 3, refund touches only that component | C21-*, C09–C12 (catalog), P01–P06 |
| C22 Corporate training | consultations, conferences, breakouts | Tickets | Spaces, Appts | provider | ticket selector, O05 | A08 | event, 4 room allocations, group buyer | one organiser pays 40 attendees across 4 rooms; rooms cannot double-allocate | C22-*, R04, S15 |
| C23 Floral studio | commissions, workshops | Projects | Appts · classes | studio | O05, timetable | — | agreement, session | commission bills deposit + balance; workshops independent | C23-*, C17, A29 |
| C24 Escape room | game slots, party rooms, catering | Spaces · Availability | Counter (packages), Prep | front desk | package widget | — | package with 3 allocations | package holds slot + room + catering; cancel catering alone leaves the game | C24-*, P01–P06, C09–C12 |
| C25 Sushi restaurant | dine-in, takeaway | Tables | Counter, Prep | host, kitchen | Q01, pickup | — | visit, pickup order, prep tickets | pickup window, kitchen prepares to it, handoff of the right order | C25-*, P36, P44–P47 |
| C26 Jesús pizza | takeaway batches | Counter · Orders | Prep | Jesús | pickup order | — | dated batch pool, order | Friday batch sells out for Friday only; cancel returns to Friday | C26-*, C08 (catalog), P46 |
| C27 Laura agency | projects, ad budget | Projects | — | agency | O05 | O04 | agreement, deliverable versions | approval + revision limit; service ≠ ad funds | C27-*, R13–R15 |
| C28 Eyelash · 5 workers | appointments, stations | Appts | Counter | front desk | widget | A08 | booking, 3 stations | 4th simultaneous booking refused for lack of a station | C28-*, A12, A14 |
| C29 Alejandra immigration | milestones, documents | Projects | Appts | Alejandra | O05 | — | agreement, milestones, files | per-milestone billing; outstanding documents visible | C29-*, R13 |
| C30 Tania massage | recurring visits | Field | Appts | Tania | A07 | F07 | agreement → occurrences | weekly client; each occurrence moves/cancels without ending the agreement | C30-*, F07, A28 |
| C31 Chris private chef | dinners at client address | Projects | Field, Prep | Chris | O05 | assistant O04 | agreement, travel block, assignment | dinner for 12 records menu, blocks travel, assigns assistant | C31-*, R31, F02 |
| C32 House cleaner | fortnightly visits | Field | — | cleaner | A07 | F07 | agreement → visits | skip a visit without ending the agreement | C32-*, F07 |
| C33 Fabian handyman | quotes, variations | Field | Projects | Fabian | O05 | F04 | quote, amendment, balance | on-site variation repriced without rewriting the quote | C33-*, C19, F04, N20 |
| C34 Evy Solutions | provisional profile | **no POS** (workspace claim) | — | — | profile | — | profile claim | cannot take money until claimed | C34-*, N24 |
| C35 Idan tours | departures, manifest | Appts · classes (departures) | Tickets · Gate (meeting point), Spaces (rental S06) | Idan | timetable | manifest A08 | session with vehicle capacity, attendance | 9th passenger refused on 8 seats; attendance at meeting point | C35-*, A26, A42 |
| C36 Zvika jewelry | design changes, pickup | Projects | Counter | Zvika | O05 | — | agreement versions, balance, handoff | design change repriced; balance before release; pickup confirmed | C36-*, C31 (catalog), C25 |
| C37 Portrait photographer | gallery, prints | Projects | Counter | photographer | O05 | — | project, print order | select images, buy prints against the same record | C37-*, C30 (catalog), R30 |
| C38 Independent DJ | sets, travel | Tickets (assignment) | Field | DJ | — | O04 | assignment with travel | 4-h set books 6 h; second venue cannot overlap | C38-*, N22, A48 |
| C39 Language tutor | lesson packages | Appts · classes | Counter (pass) | tutor | K04 | A08 | credits ledger | 10-lesson package decrements; unused balance refunds by rule | C39-*, C13–C15 |
| C40 Personal trainer | weekly agreement + group class | Appts · classes | — | trainer | K04 | A08 | agreement, session | agreement and class draw from the right arrangement | C40-*, A34, C16 |
| C41 Makeup artist | bridal on-location | Field | Appts | artist | A07 | F01–F05 | booking with travel, one price | party of 5, one slot, travel buffer, one agreed price | C41-*, A19, A41 |
| C42 Translator | deliverables, revisions | Projects | — | translator | O05 | — | project, versions | one revision tracked, second chargeable | C42-*, R15 |
| C43 Dog walker | group walks, area | Field | Appts · classes | walker | A07 | F01 | session with 4 slots, area rule | 4 dogs from 4 clients; area boundary | C43-*, A43, F09 |
| C44 Yoga instructor | classes at partner studio | Appts · classes | — | instructor | timetable | A08 | session at external venue | does not claim the studio’s capacity | C44-*, C27 (catalog), R06 |
| C45 Voice-over | usage scope, re-records | Projects | — | artist | O05 | — | agreement, rounds | usage recorded; extra re-record chargeable | C45-*, R15 |
| C46 Car detailing | on-site upgrades | Field | Counter | detailer | A07 | F04–F05 | order, amendment | upgrade added to the existing order and collected on the spot | C46-*, F04, N20 |
| C47 Independent musician | gig tickets at others’ venues | Tickets · Sell | — | musician | ticket selector | — | event at external venue | sells tickets without claiming venue capacity | C47-*, C27 (catalog), R06 |
| C48 Event host / MC | assignments, travel | Tickets (assignment) | Field | host | — | O04 | assignment with travel | two events in one day refused if travel does not fit | C48-*, N22, F09 |

Requirements that do not fit a mode and get a concrete task and destination: profile claim (C34 → workspace `talent/profile`, task N-T06), external-venue capacity disclaimers (C44, C47 → Catalog policy, task C-T07), talent conflict projection across businesses (C03, C38, C48 → scheduling busy projection, task POS-5.7/A21–A23).

## Adjacent industries (outside the 48 — not in the launch program)
| Industry | Foundation fit | Additional lifecycle needed | Status |
|---|---|---|---|
| Equipment rental | Spaces & Resources + custody (S06) | inventory of units, overdue fees, damage assessment, deposit release rules | Designed once (S06); no schema; not launch scope |
| Repairs | Projects + Counter | intake ticket, diagnosis/estimate acceptance, parts, pickup | Not designed; would reuse O06 amendment + C31 return patterns |
| Laundry / dry cleaning | Counter + fulfilment | item tagging, batch processing, ready notification, storage fees | Not designed |
No claim of support is made for these; they are recorded so the foundation choices (resources, custody, amendments) do not preclude them.
