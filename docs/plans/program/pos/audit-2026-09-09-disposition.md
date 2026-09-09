# Mockup audit 2026-09-09 · findings disposition

Source: `audit/2026-09-09-mockup-audit-source.md` (owner-supplied, 34 findings, 25 design areas, state inventory, IA proposal). Page numbers refer to the 262-page master PDF (five parts, global numbering).

Statuses: Confirmed fixed · Applied (design updated, awaiting the owner's re-review) · Design pending · Policy decision needed · Not applicable with evidence · Requires interaction/provider verification.

## Decisions taken by the designer (owner delegated the navigation decision on 2026-09-09)

- **Navigation** (F33, §3): one destination registry with stable ids and per-preset labels (W36). Groups: Overview · Operate (Messages, Calendar, Appointments & Classes, Reservations, Orders, Client work, Issues) · Sell & manage (Catalog, Events & Tickets, Spaces & Resources) · Relationships (Clients, People, Reviews) · Money (Sales, Payments) · Grow (Analytics, Website, Media) · Settings pinned. Open POS is the centered top-bar switch only; the sidebar POS link is removed; POS setup lives in Settings › POS & devices. "Clients" is kept (Tulala language rule), not "Customers". Website, Messages, Media, Reviews are preserved as existing pages.
- **Schedule** = the live Sessions page (series and their dated occurrences with the series editor; `fixtures.ts` `sessions: { label: "Schedule" }`). It becomes Appointments & Classes › Sessions and › Series (W39, W40); W10 is the generate step. Nothing is deleted; the route can keep its id.
- **Preset and role visibility** (W37, W38): café, independent professional and hybrid navigations from the same registry; a second role in each (cashier, assistant, host). Disabled destinations are absent for staff; owners find setup in the Overview checklist.
- **Projects, My work, Clients, POS Collect** (2026-09-09, after the advisor's second note): there was never a separate “Work” destination in the workspace registry; the entry called Client work (id `work`) is the one now called Projects (id `projects`), so nothing merges. **Clients** = the person or business (contact, purchases, bookings, projects, balances; one primary client record per project with several contacts and an explicit payer). **Projects** = the commissioned job (inquiry, offer, agreement versions, assignments, milestones, deliverables, money, closure). **My work** (id `mywork`) = the signed-in professional's assigned work across projects, appointments and field jobs, shown only to roles that perform. **POS Projects mode** keeps the word Projects but lands on “Collect a balance” (search → what is due under an accepted agreement → collect; full project one tap away); its old landing “Due” is renamed Collect. Screens W41–W52, O07. Explanatory copy removed from operational pages (kept only on the W43 explainer).
- **Client and project records redesigned** to one purpose and one next action: header (identity, shortcuts, primary action), summary tiles (due now first; lifetime spend secondary), six tabs, main list + secondary column; Collect from a client opens the unpaid records and allocation (W44); the project's next-action panel decides the primary button, so Collect is not offered while a milestone needs approval (W42).
- **Supplies strip** (F32): replaced by a compact "Used in · n" control with the list beside it; architecture wording sweep on all W pages is pending.

## Findings F01–F34

| Finding | Priority | Title | Status | Revised screen |
|---|---|---|---|---|
| F01 | P0 | The corrected linked balance has a clipped collection action | Design pending | |
| F02 | P0 | Linking says two different things about record ownership | Design pending | |
| F03 | P0 | Package timing corrections stop before the issued record | Design pending · workspace side (p49 package preview) + POS P03 | |
| F04 | P0 | Court extension overlaps the next customer | Design pending | |
| F05 | P0 | Table extensions and new court reservations omit buffer consequences | Design pending | |
| F06 | P0 | Reservation pacing alternatives do not follow their stated reason | Design pending | |
| F07 | P0 | Event attendance, allocations and totals do not reconcile | Design pending | |
| F08 | P0 | The assigned seating map invents additional tables | Design pending | |
| F09 | P0 | Ticket eligibility and admission timing conflict | Design pending | |
| F10 | P0 | Cancellation acts on a line already paid on another check | Design pending | |
| F11 | P0 | The completed refund promises two unused tickets when one was used | Design pending | |
| F12 | P0 | Pass redemption is represented as deleting a service’s value | Design pending | |
| F13 | P1 | Pass history predates purchase and credit states drift | Design pending | |
| F14 | P0 | Appointment duration and Olaplex behavior change across screens | Design pending | |
| F15 | P0 | Professional eligibility and availability contradict the picker | Design pending | |
| F16 | P0 | Bookable versus Access needs an explicit authorization contract | Design pending · Professional access as a scoped grant (D10) | |
| F17 | P0 | People card identities and save boundaries need repair | Design pending · card/drawer identity fixture; save scope | |
| F18 | P0 | Shared gate user and role examples undermine attribution | Design pending | |
| F19 | P0 | Several financial fixtures cannot be the same transaction | Design pending · W25 ledger and POS receipts | |
| F20 | P0 | Setup readiness is not the same thing as device pairing | Design pending · readiness per action (W20, C32) | |
| F21 | P1 | Card-dependent features are advertised beyond the proven setup | Design pending | |
| F22 | P0 | Unknown-payment alternate collection remains a policy-dependent exception | Design pending | |
| F23 | P0 | Shared bill recovery offers “nothing to pay” with a balance still due | Design pending | |
| F24 | P0 | Staff substitution does not require the agreement shown to the guest | Design pending | |
| F25 | P1 | Waitlist and no-show policy drift | Design pending | |
| F26 | P0 | Quote, earned, payable and due are still conflated in places | Design pending | |
| F27 | P1 | Field-work amounts and times contradict their setup | Design pending | |
| F28 | P1 | Membership pause is a policy summary, not a completed lifecycle | Design pending | |
| F29 | P1 | Custom amount is being used as an unstructured deposit | Design pending | |
| F30 | P1 | Important controls and values are clipped or over-compressed | Design pending · W-pages 14/23/39/45 + POS 78/125 | |
| F31 | P1 | Spanish coverage and quantity labels remain incomplete | Design pending | |
| F32 | P2 | Technical explanations crowd ordinary product screens | Applied 2026-09-09 · supplies strip replaced by compact “Used in”; copy sweep pending | |
| F33 | P1 | Mode naming and navigation are not yet one system | Applied 2026-09-09 · one destination registry (W36), Schedule → Appointments & Classes (W39–W40), Clients kept, Events & Tickets, Spaces & Resources; POS shells Office/Bookings/Door relabel pending | |
| F34 | P2 | Minor fixture counters and dates should be generated | Design pending | |

## Design areas D01–D25

| Area | Title | Status | Screens |
|---|---|---|---|
| D01 | Overview and first-run setup | Partly: W00 overview; first-run, partially ready, load-failed pending | |
| D02 | Catalog item basics, variants and lifecycle | Partly: W02–W06; Details editor, variants, lifecycle pending | |
| D03 | Menu/collection manager | Partly: W07 favorites; menu list/detail pending | |
| D04 | Modifier groups and price rules | Partly: W04, W08; create/edit group, price-rule drawer, promotion editor pending | |
| D05 | Stock and dated batches | Partly: W05 batches; stock view, receive/adjust pending | |
| D06 | Services, effective availability and intake forms | Partly: W11/W28 hours; phase editor, effective hours, forms manager pending | |
| D07 | Appointment management | Missing · to design | |
| D08 | Classes, series and attendance | Partly designed: W10 generate, W39 Sessions, W40 Series (2026-09-09); waitlist lifecycle and cancel-session impact pending | |
| D09 | People, roster and access lifecycle | Partly: W26–W35; Everyone list, invite lifecycle, remove-bookability impact pending | |
| D10 | Professional access, pay and qualification detail | Partly: W28/W30 pay; professional access grant, qualification detail pending | |
| D11 | People applications and import | Missing · to design | |
| D12 | Locations, resource creation and layout management | Partly: W12–W14, W13 layout editor; location and resource create/edit pending | |
| D13 | Reservation management and resource lifecycle | Missing · to design | |
| D14 | Events: creation, ticket editor and publication | Partly: W16–W18; creation steps, ticket-type drawer, phases, allocation editor pending | |
| D15 | Events: changes, attendee operations and gate | Missing · to design | |
| D16 | Packages and issued benefits | Missing · to design | |
| D17 | Orders, preparation and pickup/delivery | Partly: W15 stations; order board and detail pending | |
| D18 | Client Work management | Partly designed 2026-09-09: W45 list, W42 record, W46 agreement versions, W47 milestones & deliverables, W48 assignments with replace impact, W49 money, W50 closure, W51 visibility, O07 POS collect; offer builder, inquiry list, deliverable review flow and amendment acceptance pending | W42, W45–W51, O07 |
| D19 | Field job office and mobile management | Missing · to design | |
| D20 | Sales, receipts and customer balances | Partly: W25 attempts; Sales detail pending | |
| D21 | Payment reconciliation and refunds | Partly: W21, W25; transfer recording, terminal import, refund selection pending | |
| D22 | Devices, drawers, lock and approvals | Partly: W20 devices; pairing, drawer movements, lock states pending | |
| D23 | Issues and operational ownership | Partly: POS Issues; workspace issue record pending | |
| D24 | Customers, organizations and search | Partly designed 2026-09-09: W41 client record, W44 collect sheet; list, empty/error states, duplicate merge, organization payer editing pending | W41, W44 |
| D25 | Settings, analytics and meaningful setup changes | Partly: W36 destinations registry; preset change before/after pending | |

## Order of work (design)

1. P0 fixture and money contradictions on existing screens (F01–F15, F18–F20, F22–F24, F26) — regenerate from shared fixtures; the POS kit screens are rebuilt from `v3/fixtures.mjs`.
2. Authorization contract (F16) and People lifecycle (D09–D11).
3. Setup forms D02–D06, D12–D14 (create-to-publish, impact reviews, readiness per action).
4. Operations D07–D08, D13, D15–D19; money D20–D23; clients D24; settings D25.
5. State inventory (§6) mapped to the eight patterns (§4); mobile/tablet variants (§7).
6. Connected prototypes (§9) per representative business.

Implementation remains gated on owner approval; this ledger tracks design completion only.

## Final coverage pass

See `coverage-final.md`. Applied in this pass: mobile workspace navigation and six connected flows; My work on mobile with the three assignment kinds; invitations and access states; notifications; global search; quick create with return; first-use setup; approval review; customer→operator results; save states and difficult states; gate manual admission (F-gate recovery), kitchen amendment acknowledgment, instructor roster. Still open: the F01–F31 POS fixture corrections and the D-area editors listed under “Not completed”.
