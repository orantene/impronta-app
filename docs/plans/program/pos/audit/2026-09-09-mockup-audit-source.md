# Tulala: latest mockup audit and designer correction prompt

Reviewed 9 September 2026. Source: the five supplied Blueprint PDFs, 262 pages / 242 advertised screens.

## Audit basis and how to use this handoff

This is a **design audit and a ready-to-send prompt**, not a live application, repository, security or payment-provider verification. All five PDFs were text-reviewed; every page was included in a rendered visual overview, with enlarged inspection of selected dense/problematic screens. Interaction, scrolling, keyboard behavior and permissions cannot be proven by a static PDF.

References below use the **printed global page number**, followed by the screen ID where available. To find a page inside a split file:

| Supplied file | Global pages | Local PDF page |
|---|---|---|
| Part 1: Workspace, Back Office, People | 1–63 | Same as global |
| Part 2: POS Counter, Tables | 64–120 | Global minus 63 |
| Part 3: POS Bookings, Money | 121–178 | Global minus 120 |
| Part 4: Events, Appointments, Reservations | 179–215 | Global minus 178 |
| Part 5: Packages, Spaces, Field, Remaining | 216–262 | Global minus 215 |

**Assessment:** the pack has a useful shared visual language and much broader journey coverage. The next revision should concentrate on consistency, operable management forms, accessible layouts and connected outcomes. More isolated success screens will not resolve the central problems.

**Evidence labels:** “Observed” means visible in these PDFs; “Unclear” means the pack does not settle the rule; “Missing design” means an adequate state or flow was not found in these supplied PDFs, not that the feature is absent from the application. Priorities are design priorities: **P0** money, identity or capacity contradictions; **P1** core operation and setup gaps; **P2** clarity and polish. These are not claims of reproduced production defects.

---

# Prompt to send to the UX designer and development lead

Review and complete the latest Tulala workspace, People/roster, POS and connected transactional mockups using the five attached PDFs and this audit.

Keep the existing light workspace shell, restrained green primary actions, useful POS layouts and shared business records. Make complicated business workflows feel straightforward. Work from **what the owner must configure → what the operator does → what the customer or professional receives → where the result is managed**.

**Do not redesign Website pages, the Website editor or Messages.** Page 58 is reference-only and outside this redesign scope. Retain their existing navigation and links. Transactional booking, ticket, pass, table-ordering and customer-project states already in this pack remain in scope; use the existing public shell and components. Do not interpret transactional fixes as permission to redesign the marketing site, page builder, inbox or public profile visual system.

For now, complete the design corrections, connected prototypes and execution plan. Do not treat this prompt as authorization to implement or deploy the application. Keep the previously agreed implementation approval state.

## 1. Preserve what is already covered

Keep and improve these existing foundations:

- Seven operational modes, with dedicated preparation and customer-display surfaces.
- Payment uncertainty, late success, split-payment recovery and cross-device ownership screens, pp. 150–157.
- Distinct table move, join and check merge, pp. 105–112.
- A unique below-minimum-spend screen, **T28, p. 121**. This earlier gap is now represented.
- Dependency-aware admission exchange, **E11, p. 188**. The workshop now moves or is explicitly cancelled.
- Full-interval replacement for RS-509, **R05, p. 210**, showing 19:55–22:10. Preserve this improvement while reconciling resource capacity.
- Package selection separates guest use from setup, **P01, p. 218**; Room C is correctly refused for ten guests, **P02, p. 219**. Propagate the fix to the other package screens.
- Ticket lookup now has four credential rows for AD-733, **E09, p. 186**.
- Agency and talent views now agree on Vale’s $1,800 earned/payable, pp. 224–225. Clarify the other remaining milestone semantics.
- Resource operations, field jobs, gift-card conflicts, naming, delivery and membership states, pp. 228–262.

Do not copy old page-number findings into this revision as though they are still current. Use current screen IDs and rendered evidence.

## 2. Fix the following concrete inconsistencies

### F01 — The corrected linked balance has a clipped collection action

**P0 · Observed · pp. 74 C11 and 125 B03.** The balance is now correctly $1,255 + $485 = **$1,740**. On p. 125, only the top edge of the green action is visible at the bottom of the viewport. The appointment/class controls also collide with the selected customer avatar/header.

Keep the money summary and **Collect $1,740** in a fixed, independently sized right column. Scroll the appointment lines and linked records inside their own body. Set a minimum width for the master list or collapse filters rather than letting them intrude on the detail header. Show the result with a long basket and at the actual tablet size. Do not mark the correction complete because the number is fixed while the action remains cut off.

### F02 — Linking says two different things about record ownership

**P0 · Observed · pp. 74 C11 and 125 B03.** C11 says the sale’s three items become extras on the booking. B03 says they are linked for payment only and the class keeps its own registration.

Use: **“Collect these records together. Each keeps its own items, fulfillment and history.”** Show the appointment and Counter sale as separate expandable groups, each with its balance, source link and payment allocation. Add an Unlink action before collection; after collection, use an explicit allocation correction flow. Never silently convert a class registration into an appointment extra.

### F03 — Package timing corrections stop before the issued record

**P0 · Observed · pp. 49, 218 P01, 219 P02 and 220 P03.** P01 now shows game 16:00–17:00, guest room use 17:00–18:30, setup 16:45–17:00 and catering ready 18:00. Page 49 and P03 still show room 16:00–18:30; P03 also changes catering to 17:00.

Use one package fixture across setup preview, selection, confirmation, resource reservation, kitchen order and customer confirmation. For this example retain **game 16:00–17:00; room guests 17:00–18:30; setup 16:45–17:00; catering 18:00**, with an explicit cleanup interval. Replacement rooms must cover setup and cleanup too. Show optional catering removed with its revised price. Resolve whether the $0 photo booth is an included benefit or a priced upsell; those are different offers.

### F04 — Court extension overlaps the next customer

**P0 · Observed · p. 231 S04.** Now is 11:25; Soto starts 11:30; the design offers **until 11:40, “fits before Soto”**. It also requires reset before reuse. Even releasing now may already delay the next booking.

Disable this extension. Show “Next booking starts 11:30; reset requires 15 minutes” and a clear conflict action. Offer **Release and reset**, or a validated relocation with its full interval and price. “Move to Court 3” needs an actual configured Court 3 or must use an existing eligible resource; pp. 22 and 228 only establish Courts 1–2. Show the result of resolving the affected next booking, not just a warning.

### F05 — Table extensions and new court reservations omit buffer consequences

**P0 · Observed/unclear · pp. 24, 106 T13, 115 T22 and 229 S02.** T22 calls an end at 21:11 compatible with a 21:15 arrival despite the table setup/cleanup defaults. T13 validates a destination “free now” but does not show whether the whole remaining visit fits before 21:30. S02 says the tournament ends at 17:00 and a new booking starts at 17:00 with 15-minute reset included.

Show **guest use**, **reset/setup**, and **next commitment** as three short lines. Clarify whether tournament use ends 16:45 and reset ends 17:00, or shift the new start. Reuse one availability validator and one impact preview across move, extend, join and reschedule. Availability must cover the full occupied interval, not merely the start time.

### F06 — Reservation pacing alternatives do not follow their stated reason

**P0 · Observed · pp. 24, 206 R01 and 207 R02.** The configured limit is four parties per 15 minutes, but R02 rejects a fourth party. It then suggests changing six guests to five at the same time, which would not solve a party-count limit. R01’s “cleanup … from 21:50” also conflicts with its two-hour visit ending 22:00 and allocation to 22:10.

Display the actual limiting rule: **Parties 4/4**, **Covers 16/16**, or the exact physical constraint. Only show alternatives that solve that rule. Do not suggest excluding a guest as a default recovery. Prefer a nearby time or a compatible area. Correct cleanup to follow the actual end of customer use.

### F07 — Event attendance, allocations and totals do not reconcile

**P0 · Observed · pp. 26–28, 51, 134 G06 and 179 E02.** Page 51 shows 8 GA, one four-person table package, 2 children and 2 sponsors: **16 admissions** if these are distinct rows, while the headline says 14. It displays $3,600 net without explaining how that relates to the paid GA and package rows. The admission pool allocation also needs to explain where sponsor and child places come from. G06 offers door, GA and a four-person table while saying six tickets remain. E02 advertises 12 GA and two four-person tables while saying 14 of 20 remain.

Create a capacity breakdown with **capacity, committed admissions, active held admissions, reserved channel allotments and available admissions**. Distinguish package units from people. If options share a pool, state the shared limit and constrain the final combination. If pools are partitioned, each lane must reconcile. Rename Sold to Issued/Committed where it includes free or complimentary attendance. Explain revenue versus collections with a drill-down; do not invent historical fees to make a sample total fit.

### F08 — The assigned seating map invents additional tables

**P0 · Observed · pp. 27 W17, 180 E03 and 211 R06.** W17 and R06 establish two event tables T1–T2. E03 shows six tables and sells T3 under the same Dinner v3/event context.

Use the actual mapped T1–T2 resources, or explicitly identify a different occurrence, layout version and capacity. Add an owner-side mapping editor and a validation state for an unmapped seat/table. The selling map must be generated from the selected occurrence’s valid layout.

### F09 — Ticket eligibility and admission timing conflict

**P0 · Observed · pp. 28, 50, 134, 179, 181 and 185.** The event is 18+ with all-attendees age confirmation, yet sells a child-under-12 ticket. G06 is operating after 19:42 but still sells the 18:00 workshop. The workshop starts before the main doors; its customer entry instructions are not established.

Choose a coherent fixture: adult-only with no child ticket, or a family occurrence with ticket-specific eligibility. Disable finished or closed workshop sales. Add workshop entry time, entrance and lookup/admission rules independently of the later main event. Do not make a workshop attendee wait until the main doors open.

### F10 — Cancellation acts on a line already paid on another check

**P0 · Observed · pp. 102, 111 T18 and 113 T20.** Check B’s two sea bass and water are paid with deposit + card. T20 cancels seat 4’s sea bass and says “no money has been taken yet.”

Open the line’s actual paid state. Use **cancel fulfillment**, **replace**, and **refund review** as the applicable operations. Preserve the paid check and show the maximum refundable amount and proposed refund destination. A “remove $430” action cannot erase a completed allocation.

### F11 — The completed refund promises two unused tickets when one was used

**P0 · Observed · pp. 161–164 M16–M19.** Tomás is already admitted and his ticket is not refundable. Guests 2 and 3 are refunded, leaving Tomás and guest 4. M19 nevertheless says “2 unused tickets + meals” and $2,000 refundable later.

Derive remaining rights and refundability from each credential, meal and table allocation. Show Tomás used, guest 4 unused, cancelled benefits and the table rule. Do not hard-code $2,000 without a supported allocation calculation. Define whole-package cancellation when a component is already consumed.

### F12 — Pass redemption is represented as deleting a service’s value

**P0 · Observed · pp. 62, 83 C20 and 199 K01.** C20 says “The $250 line becomes $0.” K01 shows Laura’s class at $0; the portal calls a pass-backed class “Free.”

Preserve the service value and show **Covered by pass: 1 credit; cash due $0**. Keep the pass purchase and its allocation identifiable without recognizing the sale twice. Use distinct labels for **Free trial**, **Complimentary**, **Included in membership**, **Covered by pass**, and **Paid with gift card**. Do not combine all of them into Free.

### F13 — Pass history predates purchase and credit states drift

**P1 · Observed · pp. 19, 83, 127 B05, 199 and 202 K04.** K04’s pass was bought 2 September but includes August and 1 September activity. Expiry changes between 30 November and 1 December without an activation explanation. B05 shows Laura Here while her credit remains Reserved although consumption is on attendance.

Show purchase date, activation event/date and exact expiry. If activity was migrated, identify its origin. Use **issued = used + reserved + available + expired** for the sample ledger, including explicit adjustments. After attendance, move the reserved credit to used; show the inverse consequence on Undo under the configured rule.

### F14 — Appointment duration and Olaplex behavior change across screens

**P0 · Observed · pp. 7, 42, 48, 123–126 and 191–198.** The service header says 2h30 on p. 42; p. 48 auto-displays 1h30 despite phases 20 + 30 + 20 and cleanup 10. Olaplex adds 15 minutes in some screens and no extra time in others. A03 starts cleanup at 14:55 but tells Laura her visit lasts until 15:05 while describing cleanup as staff-only. B02 adds another Olaplex to a completed appointment that already includes it.

Define one phase model per service/version. Display **customer duration** separately from **resource occupancy** and **professional occupied intervals**. Derive the itinerary and all end times. If an add-on fits during processing, show which professional/resource it occupies and stop claiming the same professional is completely free then. Use an in-progress appointment for the extra-service example; show Already added when an add-on should not repeat. A completed visit needs an explicit correction or follow-up service path.

### F15 — Professional eligibility and availability contradict the picker

**P0 · Observed · pp. 21, 37, 40–42, 48, 61, 126 and 192–198.** Dani is at Polanco on Thursday in setup but bookable at Centro on Thursday in the journey. Tuesday’s break overlaps the p. 7 booking. Ana Torres is described as access-only front desk, missing certification, and certified bookable stylist in different places. B04 offers Dani at 13:05 while the underlying Laura visit runs to 13:20. M1 offers Accept for an overlapping assignment.

Reconcile people, skills, locations, shifts, exceptions and qualification states. For M1, make the action **Review conflict** or disable Accept until the conflicting commitment is resolved. For the walk-in, offer a time that respects the current service phases and all return commitments. A different chair does not make a busy professional available.

### F16 — Bookable versus Access needs an explicit authorization contract

**P0 · Unclear · pp. 37–46.** The model says Access owns sign-in/roles; Bookable-only contractors can nevertheless open professional links, check people in or collect cash. “No workspace access” can be valid, but it cannot mean “no authenticated or scoped permission required.”

Retain one person with independent relationships. Separate **may be scheduled**, **has workspace staff access**, and **may act on assigned work through the professional portal**. Show professional access as an explicit scoped grant with identity, accepted invitation, expiry/revocation and permitted actions. Never grant money permissions from the Bookable toggle. Keep role limits and per-person exceptions in one effective-permissions view. Do not create duplicate person records to solve this.

### F17 — People card identities and save boundaries need repair

**P0 · Observed/unclear · pp. 38–46.** On the roster grids, the card labelled Pau is shown with TAL-00045 while Pau’s drawer is TAL-00047; adjacent initials/IDs/names also need reconciliation. “Update saves every hat” means a profile edit may include unsaved access or fee changes elsewhere.

Render each card and drawer from the same identity fixture. Retain TAL IDs during migration. Show dirty sections and save scope. Save the current section by default, with an explicit Review all changes option if batch saving remains. Role changes, ownership/claim actions and pay changes need their own consequence summary and permission check. A failed save must identify which changes remain pending.

### F18 — Shared gate user and role examples undermine attribution

**P0 · Observed · pp. 32, 40, 160, 167, 175 and 176.** People includes “Gate crew (shared)” as a person with a shared PIN and drawer. Ana’s refund limit is $1,000 in the role matrix but $5,000 on the receipt. Dani is a non-collecting professional, server, drawer recipient and suggested manager across examples.

Use named operators; a gate crew may be a group or station assignment, not a shared human identity. Keep login, temporary approval and drawer handover separate. Pick one role fixture per scenario. Approval identifies the approver and exact action without changing the requesting operator’s role. Show invite acceptance, revocation, PIN reset and manager-unavailable states.

### F19 — Several financial fixtures cannot be the same transaction

**P0 · Observed · pp. 35, 88–89, 119, 151, 159–160, 170 and 173–174.** W25 lists both $500 cash and $1,390 approved card against AP-2041, although the split-payment remainder is $890. Attempt #a1f3 is used for Laura’s $1,390 and Table 4’s $340. Order #1187 is reused for different customers/orders; KDS #1188 includes toast absent from its sale. Offline #1161 changes from $60 to a $55 croissant.

Create unique scenario/branch IDs and consistent records. Do not put mutually exclusive payment branches into one ledger. Payment history must show collected, allocated, unapplied and refund amounts separately. If a list is a sample subset, label it. Reconcile pickup quantities and totals: two toasts $240 + cold brew $70 + croissant $55 is $365 at the shown catalog prices, not $360 unless a visible accepted adjustment explains it.

### F20 — Setup readiness is not the same thing as device pairing

**P0 · Observed · pp. 26, 28, 30–33, 59, 245 and 249.** An event is Ready while its drawer is not opened; Counter is Ready while reader payments are off; Field has no zones while zone setup exists; Spaces is Ready and later Turned off without a branch label. C32 is for Polanco but the header still says Centro/Drawer 1. It offers cash-only sales when no local drawer exists. Its setup links do not match the established POS settings destination.

Show readiness per action: **Cash selling ready**, **Reader not verified**, **Booking ready**, **Gate ready**, **Box-office drawer needs opening**. Distinguish configuration, authorization and current shift readiness. Correct C32’s entire context and route to **Settings → POS → Registers & drawers / Devices**, or the final canonical equivalent. Cash-only fallback must first create/assign a supported cash session; owner approval alone does not create missing configuration. Clearly label demo branches and plan/capability variants.

### F21 — Card-dependent features are advertised beyond the proven setup

**P1 · Unclear · pp. 31, 146–164, 172, 185, 221, 233, 239, 247 and 258.** The pack asserts reader capabilities while the provider is unconnected, offers card capture for recurring billing through a reader, card security holds, tap-on-phone and a connected scale. P185 offers Add to Wallet while p258 says the integration is unverified.

Design an explicit capabilities matrix supplied by the integration team: merchant/location/currency, collection, refunds, partial refund, recurring credential setup, authorization hold, release, tap-on-phone and hardware. Gate controls by the actual verified capability, not by a generic Connected badge. Remove the Wallet action from the unverified branch. A disconnected reader should not automatically disable every online refund if the supported adapter can process it independently; model dependency per action. These PDFs do not verify provider claims.

### F22 — Unknown-payment alternate collection remains a policy-dependent exception

**P0 · Unclear · pp. 170–171.** M26 now acknowledges duplicate-payment risk and recovery, which is useful. It still presents “guest has to leave” as a ready path before the policy and supporting repayment capability are established.

Keep reconciliation and Continue other sales as the default. If this exception is retained, identify its approved policy and show **authorization → actual tender/recorded transfer → unresolved reconciliation → late-success overpayment → refund/fallback → customer notification**. Approval is not cash received. A recorded transfer is not cleared money. Explain the unresolved risk to the customer before alternate tender and show where the receipt/update can be retrieved. Keep the action unavailable when its recovery method is unsupported.

### F23 — Shared bill recovery offers “nothing to pay” with a balance still due

**P0 · Observed · pp. 253 Q06 and 254 Q07.** Q06’s $462 share and $473 remainder reconcile. Q07 says only guacamole was paid but still uses $473 remaining; if only $160 + its $16 service allocation were paid, the remainder would be $759. It also offers “Done · nothing to pay” while $473 is open.

Show exactly which items/share were paid and recompute the remaining bill. Use **Back to bill** or **Close** when this visitor owes nothing but the table does. Separate payment success, another guest’s payment and an unknown local attempt. Include the simultaneous Pay all versus Pay share case.

### F24 — Staff substitution does not require the agreement shown to the guest

**P0 · Observed · pp. 114 T21 and 215 Q04.** Staff copy says swap nachos “and the guest is told”; the guest flow requires approval.

Make the staff action **Propose substitution**. Show Pending guest approval, declined, expired/no response, withdrawn and accepted. Only an accepted replacement is dispatched/charged, except an explicitly recorded staff-mediated agreement under the configured policy. Show both the new total and the original line’s disposition.

### F25 — Waitlist and no-show policy drift

**P1 · Observed · pp. 20, 34, 127–128, 200 and 252.** Setup says 12-hour class cancellation, B06 uses 24 hours and issues a credit note for late cancellation. Its class starts 11:30 but the offer expires 11:35; the banner says Offered before the primary sends the offer. B05 offers marking three no-shows six minutes before class start.

Separate **Place available**, **Offer sent**, **Accepted**, **Expired** and **Attendance closed**. State late-entry cutoff and no-show marking time. Use the enrollment’s accepted cancellation policy; a pass restoration, store credit and fiscal credit note are different outcomes. Show bulk no-show review with eligible participants and consequences before confirming.

### F26 — Quote, earned, payable and due are still conflated in places

**P0 · Observed/unclear · pp. 29, 57, 135, 224–226 and 259.** The template says three milestones of 33%, totaling 99%. The project says due on approval while the customer can pay milestone 2 before approving it. The tattoo example marks $4,500 artist earned and $3,000 margin earned from $7,500 collected although only one $6,000 session is completed.

Use milestone amounts that sum exactly. State the commercial trigger for each milestone and distinguish **Can pay early** from **Due now**. Show earned and approved payable separately, even when equal in the fixture. The tattoo screen must identify whether the fee is earned on collection or completion under the actual agreement; do not infer earnings from cash alone. A changed talent fee needs acceptance before committing work on the revised terms.

### F27 — Field-work amounts and times contradict their setup

**P1 · Observed · pp. 33 and 235–243.** Travel Roma→Coyoacán is 40 minutes in setup and 45 in the schedule. Sofía’s original total is $900 ($300 deposit + $600 due), but the amendment calls $600 the original agreement. F03’s running time places the proposal after 11:00; F04 calls it sent 10:40 and accepted 10:41. “Bring [table] · she has no space for it” is ambiguous. F01 calls Marcos visit 3 of 12; F07 calls the agreement open-ended.

Use one job/zone fixture with original price $900, extra $300, revised total $1,200, deposit $300 and remaining $900. Keep labor start, actual elapsed time, new finish, cleanup and travel consistent. State “Customer has no massage table; bring yours” only if that is intended and space is confirmed. Separate fixed-series and open-ended agreement examples.

### F28 — Membership pause is a policy summary, not a completed lifecycle

**P1 · Unclear/missing design · pp. 19, 221 and 262.** P09 combines pause, cancellation and renewal failure but shows only pause fields. “15–30 Sep” and 15 days needs an inclusive/exclusive explanation. The design moves renewal 15 days while allowing existing classes in the pause: that can be an intentional benefit, but must be explicit rather than accidental.

Show the last active day, pause start, resume date, next renewal and impacted bookings. Separate pause confirmation, cancellation confirmation, scheduled cancellation, undo cancellation, renewal retry and update-payment states. Decide how existing bookings use membership eligibility and how annual pause usage is counted. Do not silently change that policy while drawing the interface.

### F29 — Custom amount is being used as an unstructured deposit

**P1 · Observed · p. 77 C14.** “Deposit for custom cake” is a free-form amount with no linked obligation or remaining balance.

Use an ordinary custom-sale example for this screen. For a deposit, require a connected order/offer with total, deposit amount, balance, due trigger and refund terms. Allow a quick draft custom order inside the flow; return once with its identity attached. Do not label a generic charge Deposit and expect reconciliation to infer what it belongs to.

### F30 — Important controls and values are clipped or over-compressed

**P1 · Observed · pp. 14, 23, 39, 45, 51, 78 and 125.** Dense panels lose bottom content; p. 51 gives ticket names a narrow column that breaks them into many short lines. On p. 78 the sticky footer partially covers the PIN pad’s bottom row. P171’s redesigned PIN layout is a useful reference, but does not fix C15 automatically.

Give headers, footers and scroll bodies explicit layout space. Do not reduce fonts to fit more columns. Keep a two-line record name and move entitlement details into a drawer. Let safe secondary columns hide on smaller widths. Show full selected policy, date, location and money values in the editor instead of ellipses such as “Full or $100…” where the distinction changes behavior. Show actual overflow/scroll affordances and verify keyboard access in the prototype.

### F31 — Spanish coverage and quantity labels remain incomplete

**P1 · Observed · pp. 88–92 and 149.** C28 retains English system labels such as Options, Pick session, Sold out and Approval. C25 calls two toasts plus a drink “2 items” and all three product lines “all 3,” while other screens use item count to mean quantity. M04 says Payment in progress during its cash-entry example.

Translate all system labels, validation and state chips, while letting merchant product names retain their entered language. Choose distinct wording for **units**, **lines**, **guests**, **admissions** and **packages**. For pickup, say **Hand over 3 units** or enumerate the selected products. Correct the cash payment-status branch. Format currency consistently and keep seller/currency context visible without hard-coding MXN throughout the product.

### F32 — Technical explanations crowd ordinary product screens

**P2 · Observed · pp. 11–46, 52–53, 187, 196, 212, 216, 246 and 261.** Operators are asked to read “one record,” “snapshotted,” “server-enforced,” “typed owner-scoped,” schema names, internal screen IDs, credential rules and “first one won.”

Move implementation contracts and migration explanations into annotations. Replace them with the user consequence: **“Existing bookings keep their price,” “Your draft is saved,” “This gift card is empty,” “Open the other seller’s checkout.”** Replace the always-visible Back office supplies strip with a compact **Used in** action where the connection helps the owner. Keep useful policy explanations visible; remove architecture lessons from every transaction.

### F33 — Mode naming and navigation are not yet one system

**P1 · Observed · pp. 3, 5–10, 37–46, 59, 64 and 245.** Schedule and Calendar remain unexplained siblings; Events versus Events & Tickets, Clients versus Customers and Office/Bookings/Door versus the canonical modes vary. The preset preview still introduces Team and Roster after the People consolidation. The switcher’s rule says only authorized modes, while disabled role/mode rows are also displayed.

Publish one destination and vocabulary registry. Keep configurable labels with stable IDs. Define whether disabled destinations appear for setup discovery, and only expose setup/upgrade choices to relevant owners. Show ordinary staff only what they can use. “Gate” and “Sell tickets” are entry views of Tickets & Admissions, not additional modes. Keep the switcher predictable and role-specific.

### F34 — Minor fixture counters and dates should be generated

**P2 · Observed · pp. 5, 35, 94–99, 119 and 224–225.** “3 things need you” has five rows; floor counts fail to update after seating; KDS elapsed time conflicts with its fire time; “Fri 12 Sep” is inconsistent with the September 2026 calendar. Some samples may be different snapshots, but do not label them as such.

Give each scenario an explicit clock and branch. Derive dates, elapsed times, counts and chip statuses. Do not use arbitrary hard-coded badges around an otherwise connected journey. Sample subset lists must say so.

## 3. Simplify the information architecture

Treat this as a proposed organization of the existing destinations, not a second application. Validate against the actual navigation master and preserve existing routes.

| Group | Destination | Secondary views / purpose |
|---|---|---|
| Start | Overview | Today, setup checklist, exceptions and useful quick actions |
| Operate | Calendar | Actual appointments, sessions, reservations, resources and jobs; agenda/resource views |
| Operate | Appointments & Classes | Appointments, sessions, enrollment, attendance, waitlist; class definitions link to Catalog |
| Operate | Reservations | Arrivals, waitlist, live floor, resource arrivals; each opens its original record |
| Operate | Orders | Acceptance, preparation, pickup/delivery, handoff, returns |
| Operate | Client Work | Inquiries, offers, agreements, projects, milestones and field-job office view where enabled |
| Operate | Issues | One actionable queue shared with POS; may begin as an Overview entry if volume is low |
| Sell & manage | Catalog | Items, collections/menus, packages, price lists, promotions, benefit plans |
| Sell & manage | Events & Tickets | Event details, occurrences, offers, attendees, event day, changes |
| Sell & manage | Spaces & Resources | Resource tree, layouts, availability rules, maintenance and bookable offers |
| Relationships | Customers | Buyers, recipients, organizations, balances, activity and issued benefits |
| Relationships | People | Everyone, Public profiles/Talent, Bookable, Access, Applications |
| Money | Sales | Cross-product commercial history, linked records and balances |
| Money | Payments | Collections, refunds, reconciliation, drawers, applicable settlements and talent payables |
| Growth | Analytics | Relevant business metrics with clear definitions and drill-down |
| Existing | Website, Messages, Media and other established growth links | Preserve existing pages and behavior; no Website or Messages redesign |
| Administration | Settings | Business, locations, hours/availability defaults, POS/devices, permissions, policies and integrations |

**Open POS stays a prominent launcher/switch.** Avoid three equally prominent ways to perform the same navigation. If the sidebar POS link remains for discoverability, it opens the same launcher; POS configuration is clearly labelled in Settings.

If Schedule is working hours, rename it **Availability** and connect it to the shared configuration view. If it is staff shifts, label it **Staff schedule** and design that distinct purpose. Do not delete a real staffing capability simply to remove an ambiguous label.

Keep common actions close to their records: the owner editing a service reaches its performers and hours directly; a cashier who encounters a setup block reaches a request/owner handoff, not a full administration form they cannot save.

Show three navigations side by side: a café, an independent professional, and the hybrid Casa Nube. Show a second role within each. Use the full hybrid menu only where enabled activities justify it. Do not require a solo provider to understand event allocations, kitchen stations and agency fees to take one appointment.

## 4. Use a small number of reusable interaction patterns

Do not solve this inventory with dozens of unrelated modal designs. Use these patterns consistently and show their compact/mobile variants.

| Pattern | Use it for | Required behavior |
|---|---|---|
| List + detail | Catalog, people, customers, sales, orders, memberships | Useful search/filter, understandable empty state, stable selection and return position |
| Full-page editor | Event, complex service, package, offer, permissions | Basic settings first, advanced sections collapsed, draft/save state, clear publish/review action |
| Side drawer / mobile full-screen sheet | Quick create, modifier, customer, resource, price rule | One focused task; no stack of drawers hiding an unsaved parent |
| Picker with create-and-return | Person, product, venue, service, resource | Search, eligibility reason, Add new, save once, attach once, saved-but-not-attached recovery |
| Impact review | Archive, disable, capacity/hours change, reschedule, cancellation | Before/after, affected records, money/resources/access effects, safe alternatives, explicit confirm |
| Action approval | Refund, comp, override, sensitive access action | Requester, approver, exact scope, amount/reason, PIN or supported reauthentication, denial and timeout |
| Readiness check | First use, publish, payment/device setup | Ready for which action, missing requirement, direct fix/request action, return to task |
| Result with next action | Sale, booking, invite, publish, refund | What succeeded, what remains pending, where to retrieve it, one next primary action |

Use a modal for a short consequential decision, a drawer for a focused edit, and a full page for multi-section work. Routine sends, ordinary saves and harmless navigation should not demand repetitive confirmation. Show a preview when a change actually affects commitments, money, access or public availability.

Every editable state needs required/optional fields, defaults, inline validation, role scope, save destination, error recovery and linked record identity. Every destructive action needs the actual operation: delete unused draft, detach from collection, archive definition, cancel commitment, revoke access or refund money. These must not all be called Delete.

## 5. Complete the workspace management designs

The following are missing or insufficiently demonstrated in this PDF pack. Reuse any verified existing design after linking it by screen/component ID. A button or a note saying the feature exists is not a substitute for its editing and result states.

### D01 — Overview and first-run setup

**Anchors: pp. 5, 30–35, 249. Priority P1.**

Add first-use, partially ready, normal populated and load-failed Overview variants. Let owners see a short checklist tailored to their enabled activities. Each readiness task opens the actual form and returns to the interrupted operation. Show the non-owner version with **Ask owner to configure**.

Keep 3–4 relevant KPIs on the default view, with date range and links. Use the action queue for urgent unresolved work instead of repeating the same payment problem in multiple cards. Define what counts as arrival, open order and amount due. A payout destination missing must not automatically block unrelated cash selling or free scheduling unless that is the actual configured requirement.

### D02 — Catalog item basics, variants and lifecycle

**Anchors: pp. 11–16, 42, 48. Priority P1.**

The type chooser is present; the full create-to-publish flow is not. Add the actual **Details** editor: name, internal/public description, category, image from existing media picker, status, seller/owner, unit and relevant channels. For products show SKU/barcode, variant attributes, variant price/stock and duplicate-barcode validation. For services show fulfillment at venue/mobile/virtual and connect to scheduling sections.

Show create draft → minimum valid setup → preview → publish, plus edit published item with draft changes. Add duplicate, archive, restore and delete-unused-draft actions. Archive preview lists future bookings, menus, packages and channels affected. A safe type correction in an unused draft need not force a new record; for used items, explain why a new definition is required and offer a copy flow.

### D03 — Menu/collection manager

**Anchor: p. 17 W07. Priority P1.**

Add a menu list and named menu detail, not only a favorites board. Required controls: create/rename/duplicate, location/channel/time window, add existing item, create item and return, sections, reorder, remove from this menu, preview and publish/pause. Preserve the shared catalog item when removing it from a collection.

Use a simple left section list and main item list. Give keyboard move up/down alternatives to dragging. Use a preview switch for Counter, Tables and guest ordering without redesigning Website. Resolve item-to-station versus section-to-station precedence and show it as an effective routing value. Provide a schedule-conflict state when two active menus overlap.

### D04 — Modifier groups and price rules

**Anchors: pp. 13–14, 18, 67–68, 76. Priority P1.**

Add create/edit group: name, required/optional, min/max, defaults, option quantities, prices, incompatible choices, sold-out status and applicable items. Show **Edit shared group** versus **Customize for this item** with usage count and impact. Include invalid min/max, too many defaults and removing the last required choice.

Add a price-list rule drawer: location, channel, customer eligibility, effective dates/hours/timezone, amount and precedence. Clarify whether Staff pricing applies to a staff purchaser or the cashier operating the register; the cashier role should not silently discount every customer. Use **Test price** with a sample item/customer/time to show which rules won.

Create/edit promotion needs code or automatic trigger, eligible products, window, usage cap, stacking, exclusion, pause and usage history. Show conflict resolution on C13: **Remove WELCOME10 and apply manual discount**, including the recalculated total. Do not leave only a disabled Apply action with no way to remove the conflict.

### D05 — Stock and dated batches

**Anchors: pp. 15, 81, 88–90, 174, 247–248. Priority P1.**

Add owner/staff stock view per location with on hand, reserved and available. Include **Receive/adjust stock**, quantity, reason, reference and history; show counted quantity versus adjustment clearly. Add batch create/edit/repeat with production quantity, pickup window, cutoff, preparation release and cancellation-return rule. Page 15 must be titled Pizza when it is configuring pizza batches, not Latte.

Show reducing stock below existing commitments, changing a sold batch’s pickup window, spoiled stock, and returning goods after a partial refund. Keep this scoped to the documented retail/menu lifecycle; do not add a complete procurement or warehouse suite. For measured quantity, add unit, tare/net weight where applicable, unstable/disconnected scale and manual-entry permission states. Specify whether manual measured sales can launch before a hardware adapter is verified.

### D06 — Services, effective availability and intake forms

**Anchors: pp. 7, 21, 34, 42, 48, 191–198. Priority P1.**

Add a service phase editor with a simple default **one duration, one professional, one resource**. Advanced mode enables processing segments, additional professionals/resources, continuity, setup and cleanup. A timeline preview should show customer time and occupied time without requiring the owner to understand scheduling internals.

Provide effective-hours editor with weekly hours, breaks, location, timezone, leave, temporary override and source inheritance. A **Why unavailable?** drawer lists the specific blocking rules and links to the editable source; it must not expose another business’s customer.

Manage forms needs list, create/edit questions, required/optional, recipient/guardian, due time, blocking/warning policy, audience, preview and version. Show an existing response, missing/invalid response and a change to a form already requested. Keep medical or other sensitive information limited to roles and work where it is needed. Link into the existing customer interface without redesigning the site.

### D07 — Appointment management

**Anchors: pp. 6–7, 123–128, 191–198, 250–251. Priority P1.**

Add workspace appointment list/detail with filters for day, location, professional and status. Detail owns services, participants, resources, intake status, timeline, deposit/balance and related records. Show arrival, start, complete, no-show, reassign, reschedule, cancel and rebook. A new appointment must work from an empty Calendar as well as from a customer record.

Demonstrate deposit link sent → awaiting deposit → paid or expired; show a late payment after the hold expires. Distinguish a confirmed booking with an outstanding deposit from a temporary hold. If the policy uses a 24-hour hold, make it bounded by the appointment and sale deadline rather than a generic seven-day payment-link lifetime. Add a customer reschedule selection and confirmation using the existing public components, not just the initial Manage button.

### D08 — Classes, series and attendance

**Anchors: pp. 20, 127–128, 199–204, 252. Priority P1.**

Add class-template list/detail and scheduled-session detail with instructor, room, equipment, capacity, enrollment window, eligibility, pass rules and participants. Show generate preview → conflicts → skip/fix dates → generated result. Show **This session / Future sessions / Entire series** with affected bookings before a change.

Provide substitute-instructor selection, lower-capacity impact, cancel session with affected participants and refund/credit consequences, equipment position change and move participant. Add the full waitlist-offer lifecycle and recovery if a pass expires between offer and acceptance. A course’s missing required date should offer a validated substitute date/resource or another course; three drop-ins must be sold as a different purchase with explicit consent. Add make-up selection only where the documented course offers it.

### D09 — People, roster and access lifecycle

**Anchors: pp. 37–46. Priority P1, with F16–F18 resolved first.**

Keep the one-person model, but use ordinary labels **Public profile**, **Bookable here**, **Workspace access**. “Hats” can remain a brief setup explanation, not a term needed on every card. Put Public profiles, Bookable and Access in tabs/filters over the same person records. A receptionist should not need the full talent-profile editor.

Add the actual Everyone list, search-existing picker, duplicate-identity review, add-person steps, invite sent/accepted/expired, resend, cancel invite, claim ownership and conflict states. Preserve the current public profile sections and privacy controls. Do not copy sensitive values across businesses simply because an email matches.

Add remove-bookability impact: future appointments, assignments, substitutes, notifications and outstanding pay remain visible. Add access suspension/revocation with active-device consequences. Add profile-hidden-but-internally-bookable as an explicit audience choice; reconcile it with the current “show booking on our pages” toggle so internal scheduling does not accidentally publish a person.

### D10 — Professional access, pay and qualification detail

**Anchors: pp. 21, 39–46, 61, 198, 225. Priority P1.**

Add a scoped **Professional access** section for invitation/identity, assigned-work permissions and revoke/resend actions. Keep cashier/drawer privileges separate. Show each skill or qualification’s requirement, issuer/scope, status, expiry, supporting evidence and the affected service. Avoid an unexplained global “verified” badge unlocking unrelated work.

Add pay-agreement detail: flat/hourly/session/percentage basis, who pays, earning trigger, effective date, accepted version, current assignments and amendment acceptance. A generic “Fee 60%” is insufficient without its basis. Show the professional’s own fee and payout state without exposing agency margin or other people’s fees.

Keep one talent landing/navigation across My work, assignment, class and field variants. Adapt actions to the assignment type. Clearly separate personal context from the selected business context; the consolidated personal calendar may show the person’s own information, while each business receives only authorized availability.

### D11 — People applications and import

**Anchors: pp. 38, 40, 43, 46. Priority P1 where these existing buttons remain.**

Applications is present in navigation but not demonstrated. Add list, detail, review, request information, accept/reject and invite result. Acceptance must let the reviewer choose the relationship and permissions; it must not grant all three capabilities by default.

Create a reusable import flow: select file → map fields → validation preview → duplicate choices → import result → failed-row download/retry. Apply it to the existing People, Customer, Catalog and Event import entry points with type-specific fields. Retrying failed rows must not create duplicates. Do not require a separate import design system for each page.

### D12 — Locations, resource creation and layout management

**Anchors: pp. 22–24, 33, 52–54, 210–211. Priority P1.**

Add location create/edit with address, timezone, activity scope, operating hours and relevant payment/register context. Add resource create/edit: type, parent space, name, capacity, eligibility/accessibility, bookable status, permitted uses, linked offerings and setup/cleanup. Distinguish a physical unit, a combination of units, a pooled quantity and an external venue address with no inventory authority.

Layouts need list, create from existing resources/template, duplicate, version, archive, validation and activation review. Add numeric position/rotation and move controls as a drag alternative. Activating a layout with commitments opens a relocation list with per-record destination and approval/notification state. Unmapped or duplicate resource identities block publication. Keep layout editing unavailable to hosts who only seat guests.

Complete the six-step reservation offer wizard shown only at its assignment stage: what is reserved; duration/hours; allocation/pacing; money; guest fields/policies; preview/publish. Show a simple hourly-room version and a table-service version using the same underlying form sections.

### D13 — Reservation management and resource lifecycle

**Anchors: pp. 54, 94–121, 206–211, 228–233. Priority P1.**

Add reservation list/detail outside the live floor, including future dates, source, requests needing approval, customer, resources, payment and visit state. Show accept/reject request, no-show review, cancel, late arrival and advance amendment. A table preference stays separate from a promised exact table.

Resource operations need actual check-in/start-use results, extend review/payment result, move result, release/reset and block/unblock results. Add the create-maintenance-block dialog with scope, time range and affected allocations. For a returned rental show condition/photo capture, damage review, proposed deduction, dispute/approval state and hold-release pending/failed/expired. Keep rental as a documented conditional workflow; do not claim this screen alone proves a full rental business suite.

### D14 — Events: creation, ticket editor and publication

**Anchors: pp. 26–28, 50–51, 178–189. Priority P1.**

Add the missing event creation steps and their working controls: recurrence/date range, timezone, doors/start/end, buffers, occurrence exceptions and conflict resolution. Show publication readiness separately from opening ticket sales. A public informational occurrence may remain tentative; it must not silently sell inventory for an unresolved venue hold.

Add ticket-type drawer with title, entitlement, price, eligibility, capacity source, channel, quantity limits, name requirement and refund/transfer rule. Add sale-phase editor with time windows, quota, price and overlap/exhaustion validation. Add allocation editor showing how online/door/sponsor quotas fit the shared capacity and when unused quota is released. Show free RSVP, paid admission and table-package examples without duplicating the whole editor.

Use an event header with clear selected occurrence. Condense its ten secondary destinations into workable groups if needed: Overview, Schedule, Tickets, Attendees, Event day and More. Keep public-page styling in the existing Website flow.

### D15 — Events: changes, attendee operations and gate

**Anchors: pp. 129–134, 161–164, 183–189, 255–258. Priority P1.**

Add owner event cancellation/postponement and occurrence change preview: buyers, attendees, seats, workshops, meal/table benefits, refunds, notifications and per-record progress. Distinguish postponing with pending customer choice from moving every ticket automatically.

Add actual ticket transfer form, recipient validation, confirmation, replaced-QR result and delivery failure. Add exchange with price increase/decrease, destination full, expired hold and payment/issuance failure. For groups, select individuals and dependent benefits explicitly.

Gate needs scan-out, re-entry, invalid/unrecognized QR, wrong seller/event, unreadable scan, unavailable network and authorized manual admission with an audit result. Separate **Look up ticket** from **Admit**. A gate-only role must not inherit receipt/refund access. Meal redemption belongs to an authorized benefit station, with unused/used/refunded states; do not leave Redeem meal as an unexplained gate button. Show admission of a committed but not-yet-issued order without later minting a second usable right.

### D16 — Packages and issued benefits

**Anchors: pp. 19, 49, 201–203, 218–223, 260–262. Priority P1.**

Package setup needs a component picker/editor: existing item, required/optional, quantity, participant relationship, timing dependency, resource constraints, sold-now versus redeem-later, allocation and cancellation effects. Show the dependency in plain words such as **Party room starts after the game**, with a timeline preview. Use a diagram only when multiple dependencies warrant it.

Create an **Issued benefits** view linked from Customers and Catalog plans: holder, plan, purchase, status, used/reserved/available value, expiry, renewal and history. Show admin adjustment with reason and permission; plan definition edits must not rewrite purchased terms. Gift cards need issue/delivery result, partial-value input, invalid/expired/wrong-seller states and post-redemption remaining value. Separate store credit issued after a refund from a purchased gift card.

Define whether gift-card value covers tips, deposits, fees and other stored-value products. Show these eligibility rules before applying value. Treat accounting labels as configured/reporting requirements agreed with the finance owner, not universal recognition rules embedded in UI copy.

### D17 — Orders, preparation and pickup/delivery

**Anchors: pp. 25, 84, 88–89, 102–104, 114, 119, 169. Priority P1.**

Add the actual workspace order list/board and detail, not only the POS list and routing settings. Include source, promised time, location, buyer/guest, acceptance, preparation, fulfillment and payment as separate states. Show accept/reject, amend, assign, partial ready, partial handoff, not collected, cancel and retrieve after completion.

Station creation/edit needs name, item/category routing with precedence, device, acknowledgment behavior, fallback, alerts and print/display test. Show routing preview for a configured basket and blocking unroutable items. Use caution with the p. 25 fallback to hot kitchen: an owner should explicitly choose an appropriate fallback, not route every unknown drink/task there automatically.

Add preparation amendment/cancel acknowledgment, reconnect, partial quantity ready, recall and expediter view. Distinguish **Resend command**, **Reprint copy**, and **Confirm verbally delivered** so staff know whether new work is being requested. Add the customer Waiting for acceptance and delivery-failed states before the accepted screen. If Delivery remains a supported fulfillment option, add its address, assignment, handoff, proof/outcome and failed delivery; otherwise label its scope honestly rather than leaving an apparently complete selector.

### D18 — Client Work management

**Anchors: pp. 29, 57, 135–136, 224–226, 259. Priority P1.**

The inquiry-to-project overview describes the sequence but does not let someone perform it. Add inquiry list/detail with customer, request, owner and next action; offer builder with catalog/custom lines, participants, scope, milestones, dates, terms and preview; send/accept/reject/expire states; accepted agreement detail; project list/detail with assignments and deliverables.

Show assign professional → proposed fee → accept/decline → deliverable upload/version → customer review → milestone approved/due → collect. Complete amendment proposal, customer acceptance, talent acceptance and failed/conflicting acceptance. Keep the old agreement valid until the supported transition succeeds. Add a rejected deliverable/revision flow and a missed deadline state. Collection in POS should open the existing obligation, not create a new project or sale.

### D19 — Field job office and mobile management

**Anchors: pp. 33, 235–243. Priority P1.**

Add office job list/detail and Create job: customer, service/offer, address confirmation, zone, professional, time, travel/setup, materials if relevant, deposit and access notes. Show unassigned, assignment declined, address incomplete, outside area and no compatible travel slot. A paid-but-unconfirmed-address job needs a visible office owner and resolution deadline.

Complete the mobile states behind Problem: late ETA, no access, reschedule selection, incomplete work and partial charge agreement. Show the customer’s extra-work proposal, accept/decline/expired state and the professional’s result. Add explicit Start work after arrival, Finish work before collection, and a choice to leave an authorized balance. Next job must preserve the completed job and unresolved amount.

Connect on-site cash to the professional’s permitted cash session or cash-on-hand ledger and later handover; do not imply cash disappears into a generic register. “Call via Tulala” requires the supported contact mechanism and an unavailable-state fallback. Add reconnect and stale-job conflict recovery, not only the offline banner. One professional’s lost connection must not authorize a new shared-resource booking.

### D20 — Sales, receipts and customer balances

**Anchors: pp. 8, 35, 56, 125, 159–160. Priority P1.**

Add Sales detail with original commercial lines, accepted terms, customer/participants, connected business records, payments/deposits/credits/refunds and timeline. Show **Sale total**, **Collected**, **Refund pending**, **Refunded** and **Remaining**, rather than overloading Amount and Due. The reservation row with “$400 / credit” needs a clear deposit presentation.

Add balance collection from a customer account with selected obligations and allocations, including different due dates. Preserve seller boundaries. For linked transactions, show partial payment allocation and what remains unpaid. Add receipt-delivery retry, change contact, refund history and print failure independently of payment success. If fiscal invoicing is not configured, open a truthful explanation/setup request, not an apparent issue-invoice action.

### D21 — Payment reconciliation and refunds

**Anchors: pp. 31, 35, 146–176. Priority P1.**

Add actual bank-transfer recording: amount, currency, payer/reference, received date, supporting file where applicable and destination obligation. Result is Awaiting verification; add confirm/reject/duplicate evidence states with the balance consequence.

Terminal-report import needs file/range selection, parsing validation, matched/unmatched/duplicate rows, manual candidate comparison and confirm allocation. A provider row must not be matched to a booking by amount alone without an accountable review.

Complete refund selection across multiple original tenders, refundable remainder, partially returned quantities, tips and benefit restoration. Add store-credit acceptance and manual-repayment recording to the existing failed-refund flow. Add paid-but-capacity-unavailable resolution: preserve payment, show alternatives or an explicit refund action, customer agreement and resulting reservation/issuance. M24’s Resolve button currently leads to an undesigned core operation.

### D22 — Devices, drawers, lock and approvals

**Anchors: pp. 30–32, 78, 156–157, 166–176. Priority P1.**

Device pairing needs device name/type, location/register, supported provider, discovery/pair steps, test, success and failure. Add replace/unpair with active-session impact. Separate a provider account connection from pairing hardware. Show test environment clearly so the designer does not imply a live test charge is harmless.

Drawer movements need amount, reason, method/receipt, responsible person and confirm result. Handover needs receiver identity, permitted role, shared count or discrepancy, acceptance and new responsibility. Show blind-count entry before the expected amount is revealed, recount and variance approval. Add lock, failed attempts, lockout, recovery, active-operator switch and unavailable manager. Unsynced work must remain recoverable while the device can still be locked for privacy.

### D23 — Issues and operational ownership

**Anchors: pp. 5, 35, 169–171. Priority P1.**

Use one issue record visible from Overview, Payments and POS. Add owner assignment, next check/action, last update, related record, action history and reopen. Include unowned issue, failed retry, permission-restricted action and a resolved result. Do not let “Mark resolved” pretend that payment or issuance succeeded; it records the actual resolution or dismissal reason.

Group alerts by affected transaction and consequence so one payment timeout is not counted as three independent business failures. Give ordinary staff one appropriate next action; finance can expand provider details. Add a non-blocking notification when a background outcome changes while the operator is serving another customer.

### D24 — Customers, organizations and search

**Anchors: pp. 56, 69–73. Priority P1.**

Add workspace customer list, first-use empty, no-results, load-failed and import result. Detail actions need edit, participant/dependent relationship, organization payer, duplicate review/merge preview and archive. Do not auto-merge household members with a shared email or phone. A company buyer and individual attendee need separate contact and receipt ownership.

Separate marketing consent by actual channel from receipt/booking communication. Display only necessary contact/intake data per role. Add record search with type, location and source context; a result must reopen the actual sale/booking rather than a duplicate detail page. Preserve existing Messages and use deep links to its thread.

### D25 — Settings, analytics and meaningful setup changes

**Anchors: pp. 18, 24, 30–35, 59. Priority P1 for configuration; P2 for extra reporting polish.**

Add activity/preset changes with before/after navigation and real effect summary. Disabling an activity hides future entry points without deleting records; show how existing commitments are still managed. Separate subscription capability, role permission, business activity, label override and theme.

Provide domain-linked policy edits with inheritance/effective-date preview. Do not place every domain editor into a giant Settings page. Analytics needs a minimal populated view for sales, collections, refunds, outstanding balances and relevant utilization/attendance; explain time range and drill into source records. Package components must not double-count totals. Keep expenses/payouts only to documented scope and identify any missing finance-management destination required by the existing program.

## 6. Finish the small but essential popup and state inventory

These are reusable states or compact variants, not necessarily new pages. Map each to an existing pattern and assign stable IDs in the next design revision.

| State / dialog | Entry and fields | Primary result and recovery |
|---|---|---|
| Unsaved changes | Leaving a dirty editor; changed sections | Save draft / discard changes / stay; failed save keeps input |
| Concurrent configuration edit | Another owner edits same record | Compare relevant fields, reload or apply permitted changes; no silent overwrite |
| Publish impact | Catalog, event, policy, layout | Publish scoped valid changes; link to blockers and preserve draft |
| Archive / deactivate | Used definition or person | Show impacted future work; archive preserves history; prevent orphaned commitments |
| Delete unused draft | Draft detail overflow menu | Name object and consequence; no refund/cancellation implied |
| Create-and-return failure | Child saved; attachment failed | Reattach saved child, use another, or return to parent; no duplicate save |
| Person invite | Person + relationship/access | Invite, resend, cancel, expired/accepted result; no automatic role escalation |
| Requirement missing/expired | Professional or service assignment | Upload/review evidence or choose eligible professional; authority remains scoped |
| Financial approval | Exact action, amount, requester, reason | Authenticate approver, approve once, deny/expire; return to original task |
| Hold expiring / expired | Booking, class, ticket or package | Renew after revalidation or choose alternative; preserve entered data |
| Payment succeeds after hold expiry | Deposit/ticket/resource | Check commitment outcome; resolve without double charge or silent oversell |
| Payment succeeds but issue/fulfill fails | Tickets, gift card, package | Paid + pending; retry issuance against same right; owner and retrieval path |
| Price changed before acceptance | Live catalog/phase change | Old versus new quote with reason; accept new price or keep shopping context |
| Discount conflict | Basket promotion or manual change | Remove conflicting rule and recalculate explicitly |
| Pacing/resource conflict | New reservation, extend, move | Compatible alternatives with full interval; original commitment preserved |
| Waitlist offer | Named participant, deadline, charge/credit | Accept, decline, expiry, already taken and eligibility changed |
| Guest substitution | Original/replacement and price change | Accept/decline; waiting state on staff screen; unchanged line until accepted |
| Partial handoff | Selected products and remaining quantities | Handoff exact units, already handed off recovery, uncollected remainder |
| Return / refund | Selected original lines/tenders | Stock decision distinct from money; pending/failed/completed refund |
| Ticket transfer/exchange | Person/date, credentials, dependencies | Review effects, confirm, replaced credentials and delivery result |
| Manual admission | Order/right, person, reason, authorized operator | Admit once; reflect issued-later recovery and gate count |
| Gift-card partial use | Credential result, usable amount, selected amount | Apply value, show remainder, invalid/expired/wrong seller/concurrent recovery |
| Membership change | Effective dates, renewal and affected bookings | Pause/resume/cancel/retry with separate confirmation/result |
| Field-work change | Scope/time/price, customer acceptance | Proposed/accepted/declined; schedule and balance updated together |
| Drawer movement/handover | Cash amount, reason, receiver/count | Logged cash result and new responsibility; failure does not invent a transfer |
| Export | Record scope, filters, columns, date range | Preparing, ready, failed/retry; role-appropriate contents |
| No access / load error | Any list or deep link | Explain restriction or retry; never display a first-use empty state for a failed fetch |

## 7. Mobile, tablet and visual specifications

Use the PDF’s advertised desktop, tablet and phone sizes as starting frames, then show actual responsive behavior. A landscape screenshot squeezed into a phone frame is not a mobile variant.

1. **Desktop workspace:** comfortably readable record names, deliberate column widths, one main content scroll, no essential policy values hidden by truncation. Use contextual details instead of seven dense columns plus an always-open preview.
2. **Landscape POS:** keep transaction context, amount due and next action stable. Let the list/catalog and basket scroll independently when needed. If there are multiple records, collapse the inactive groups instead of letting the payment button fall outside the frame.
3. **Portrait tablet:** finish C29 with search, customer/booking selection, mode/location controls, saved sales, keyboard-open state and expandable basket. The current p. 92 composition is a starting layout, not full portrait coverage.
4. **Mobile owner:** provide agenda, reservation detail, order detail, quick catalog availability change and People invite/assignment views. Put heavy layout editing in an explicitly suitable larger-screen flow while keeping simple resource edits accessible.
5. **Mobile professional:** keep Today/My work, assignment and field navigation coherent; show sticky action, keyboard, long address, missing required details, offline and permission variants.
6. **Customer transactional pages:** keep the existing visual shell. Add actionable status, amount and policy consequences. No internal payment-token or credential architecture explanations. A plain **Ask your server** link is better than a paragraph about table-code security.
7. **Touch and keyboard:** use generous touch targets; test the supplied 56–60 px primary-action direction where appropriate. Provide visible focus, labelled icon buttons, keyboard alternatives to drag/scan and correct focus restoration after a dialog. Show the last focused field above the on-screen keyboard. Static mockups do not prove these behaviors.
8. **Color and typography:** keep the current palette. Strong text for primary information, restrained helper text, status word plus icon/color. Use red for the issue/destructive consequence and normal primary styling for safe recovery. Do not shrink text to rescue a crowded table.
9. **Forms:** show required fields without making every possible field mandatory. Use sensible defaults, progressive disclosure and a short effective-setting summary. Explain default/inherited/override next to the setting with Reset to default.
10. **Localization:** complete EN and ES system text on at least one full setup journey, Counter sale, receipt/refund, booking and handheld job. Test long names and translated status labels; merchant content translations are a separate completeness state.

## 8. Resolve the remaining behavioral decisions with explicit designs

Use the agreed product policy where it exists. Recommend a practical default where it does not, and separate a real owner decision from a routine design choice. Do not interrupt progress for every label, spacing choice or default filter.

| Decision | Recommended design treatment | What must be recorded |
|---|---|---|
| Saved sale versus inventory hold | Save the basket independently; expired capacity remains a visible unavailable line pending user choice | C16 says the line is removed while C17 keeps it. Choose one behavior and preserve the customer’s intent |
| Anonymous Counter purchase | No contact/account required for ordinary cash/card goods; ask participant details only for the product that needs them | Class enrollment identity timing, receipt choice and supported unnamed admission policy |
| Quick sale versus collection | Separate New sale from Collect existing balance | Source record, seller, allocations and return destination |
| Multiple payment methods | Start with one method and allow Pay part; show remaining amount clearly | Whether more than two tenders are supported; gift value, cash and card sequencing; no artificial Two methods limit if three are required |
| Gift cards versus passes | Give gift card/stored credit a recognizable payment action; show passes within eligible service/enrollment context | Current Collect screens say Pass or credit not for services, but p260 uses gift value on the same service |
| Tax/fee display | Show the accepted configuration and itemized quote; use Unknown/setup-needed where applicable | Reconcile configured categories in setup with blanket Exempt sample baskets. Do not choose tax rules from the mockup |
| Optional versus mandatory service charge | Label the configured charge and tip separately; show eligibility and base | Accepted minimum-spend terms and whether service charge applies to a shortfall; no silent duplication with tip |
| Same business, multiple roles | One identity with explicit capabilities and effective permissions | Account access, assignment-only access, approval and drawer responsibility |
| Public profile ownership | Preserve identity and per-business relationship/overrides | Claim/co-edit/revoke and duplicate-match visibility; global ownership does not expose another business’s private data |
| Scan Anything | Resolve code purpose then open the correct authorized preview | A general scan must not unexpectedly admit a guest or spend a credit without a defined mode/action |
| Event publish versus sale opening | Separate publishing information from committing inventory and taking money | Occurrence readiness and resolution of tentative venue conflicts |
| Interrupted multi-seller checkout | Show each seller, amount and independent completion status | Reauthorization/handoff, second checkout unavailable, first completed/second failed and return to remaining basket |
| Offline cash | Preserve completed local cash facts and distinguish shared-stock risk | Allowed items, stock reservations/quota or oversell policy, sync conflicts, local actor/session and later reconciliation |
| Booking cancellation versus refund | Cancellation and money state remain separate | Resources may release while money is pending; never label refund completed before confirmation |
| Service completion versus payment | Finish service even with an authorized remaining balance | Customer/account balance, next due date and collection owner |
| Membership pause and existing bookings | Explain the chosen benefit rule in advance | Access/credit/billing effect, resume date and renewal policy |

The pack’s refund timelines, security holds, fiscal-document rules, expiry policies and provider abilities are examples requiring confirmed configuration. Do not embed them as universally applicable rules. Keep unresolved provider/account dependencies visible without blocking independent design work.

## 9. Build connected prototypes that prove the owner can operate

Design complete representative journeys with a shared fixture. Show the exact starting screen, each consequential action, saved outcome and one realistic recovery. Reuse shared screens rather than redrawing the same payment form for every business.

| Prototype | Owner setup | Operator journey | Matching result/recovery |
|---|---|---|---|
| Café / retail | Item → modifiers → menu → stock → station/register | Anonymous sale → options → cash/card → receipt → next customer | Correct preparation, stock and Sales; sold-out option or failed print |
| Salon | Person → eligible service/phases → resource → hours → deposit/intake | Booking → arrival → extra → completion → balance | Professional day, customer manage booking, safe reschedule, consistent duration |
| Fitness | Class definition → series → room/equipment → pass | Buy pass → enroll buyer/child → attendance | Credit ledger, waitlist offer, cancelled session and renewal eligibility |
| Restaurant | Layout → service period → menu/routing → booking terms | Reserve → seat → order → amend → split/collect → leave/reset | Deposit once, paid-line refund, guest substitution and minimum shortfall |
| Venue | Event → dates → capacity/layout → tickets/phases → gate | Presale → issue/deliver → name/transfer → admit | Exchange with workshop, partial refund, sold-seat protection, scanner failure |
| Resource business | Court/room → offering → availability/reset | Reserve → arrive → start → extend/move → release/reset | No overlap with next customer; maintenance relocation |
| Agency | People/fees → offer template → actual offer | Accept → assign → deliver/revise → approve → collect | Customer/talent boundaries, revised agreement, approved payable and payout status |
| Mobile professional | Area/travel → service → assignment rights → job | Navigate → arrive/start → extra accepted → finish → cash/balance | Office schedule, no access, offline/reconnect, cash handover |
| Hybrid birthday package | Required components → timing → optional choices → allocation | Configure → hold → pay → issue → fulfill | Identical room/catering times, valid alternative, component cancellation |
| Hybrid venue / beach club | Shared resources, event and dining rules | Ticket or space access → table/order → benefits → settle | Shared physical capacity, separate benefits/payment and no duplicate sale |

For tours/diving/departures and any other previously documented cases, first obtain the actual case registry. The supplied PDFs mention Tours & departures in activity settings but do not demonstrate a complete departure/manifest workflow. Identify the required booking/session, participant, staff, resource and departure operations from that registry; design a manifest or check-in variant only where the case requires it. Do not assume ticket admission alone makes a tour operational.

**The 48-case registry was not supplied as an auditable standalone inventory in these five PDFs.** Preserve it in the handoff, but do not claim that all 48 cases have passed or invent their IDs. Map the real cases when the registry is available. Adjacent industries such as laundry or repairs should be recorded as fit/gap assessments, not silently expanded into full launch suites.

## 10. Organize the execution plan for Cursor without slowing design

Keep the existing program conventions and the user’s approved working style. Break the program into **projects → milestones → small executable tasks**. This prompt requests design and planning now; application implementation begins after approval. After that approval, keep moving through authorized ready tasks without asking again after each one.

Recommended order:

| Project | First milestone | Immediate output | Dependencies |
|---|---|---|---|
| PRJ-01 Consistency | Correct shared fixtures and critical states | F01–F29 reconciled; critical PDF screens fixed | Current design source; policy questions recorded |
| PRJ-02 Shared UX | Navigation, forms, impact review, responsive shell | Reusable patterns and stable screen registry | PRJ-01 record/role definitions; visual work can proceed independently |
| PRJ-03 Workspace setup | Owner can configure minimum viable business | D01–D14 core setup forms and results | Shared patterns and relevant fixtures |
| PRJ-04 Operational completion | Complete Counter, appointments, tables, resources | Connected journeys and their recovery states | Their own setup dependencies, not every setup feature |
| PRJ-05 Events and benefits | Ticket, pass/package, membership lifecycle | D15–D16 and related QA | Capacity, entitlement, money contracts |
| PRJ-06 People, client and field work | Assignment to completion and collection | D09–D11, D18–D19 | Identity/permissions and scheduling contracts |
| PRJ-07 Money and operations | Reconciliation, devices, drawer, issues | D20–D23 | Shared records; provider verification separately tracked |
| PRJ-08 Continuous QA and handoff | Case traceability and focused verification | Evidence, defects, resume document | Starts immediately and stays active |

These are planning groupings, not rigid build-then-wait phases. Carry out independent design, implementation planning and QA preparation together where the environment supports it. Do not create a second tracker or duplicate the existing QA system.

Each task must contain:

- Stable task ID, project, milestone, priority, status and dependencies.
- Linked finding/design-state IDs, actual case/scenario IDs and acceptance criteria.
- Exact current screen/component and, when repository access exists, verified file paths and reusable code. Do not invent filenames from the PDF.
- Field/action/state specification, persisted outcome and permissions.
- Configuration, migration and provider requirements; explicit test environment.
- Focused test/procedure, expected visible and business result, evidence location.
- Recovery or forward-fix procedure, bounded retry limit, next-ready task and blockers.

Maintain **Start Here / Resume Execution** with scope/revision, current state, ready-task order, actual commands, evidence, blockers, queued owner decisions and next action. Verify Cursor’s actual runner/task capabilities before claiming unattended background execution or automatic session restart.

Once implementation is approved: choose the highest-priority ready task, implement, run relevant checks, record evidence, update status and continue. If blocked, record the exact blocker and proceed with independent work. Keep production changes, live financial actions and destructive operations within their actual authorization. Do not turn cosmetic issues into approval gates or shrink the agreed program to fit one session.

## 11. Verify the designs and later implementation continuously

### Design acceptance now

For each F finding, record **Confirmed fixed**, **Design pending**, **Policy decision needed**, **Not applicable with evidence**, or **Requires interaction/provider verification**. Link to the revised screen and inspect the final export, not only the source component.

Check arithmetic and connected fixture consistency automatically where possible: order sums, deposit allocation, refunds, credit ledger, package allocation, event attendance, unique resource identities, dates and interval conflicts. Validate screen IDs and task links. Check that every visible create/edit/change action has either an actual designed destination or a precise existing component reference.

Exercise connected prototypes at the representative device sizes. Confirm bottom actions, focus/keyboard, long content and safe return to draft. A written statement saying “sticky,” “server enforced” or “atomic” remains a requirement until demonstrated and later implemented.

### Implementation QA after approval

Run the browser/code/integration audit alongside development. Prioritize real business loops, money, identity, capacity and recovery. Use two isolated workspaces and meaningful owner, cashier, host, preparation, gate, customer and professional roles. Use backend fixtures for setup, but exercise the tested business action through its actual interface.

For each meaningful work package, record scenario, environment/revision, roles/setup, exact steps, expected visible and persisted result, negative/recovery case, test or manual procedure, evidence and severity. Specifically include:

- No duplicate charge, refund, enrollment, admission, deposit credit or preparation on retry.
- Last place/seat/resource/credit conflicts and safe rescheduling.
- Unknown charge, cancellation race, late success and partial-payment failure.
- Unissued paid rights and capacity unavailable after payment.
- Shared table visit access reset, simultaneous bill payment and replaced ticket credentials.
- Used/unused benefits after transfer, exchange and partial refund.
- Role-specific fields, cross-business isolation and revoked professional access.
- Save/reload/reopen, dirty forms, concurrent edits and create-and-return failure.
- Field travel, on-site changes, missed access and offline reconciliation.
- Correct configuration changes reflected in POS while historical terms remain identifiable.
- Desktop, tablet/portrait, relevant mobile, EN/ES, keyboard and bottom-control reachability.

Use dedicated isolated environments for concurrency and provider test environments for payments. Mark missing device/provider/credential evidence **Awaiting external verification** and continue other work. A mocked success screen does not pass a provider scenario.

Fix blocking and high-risk defects in their workstream. Record and triage non-blocking failures without stopping unrelated execution. Run focused checks first; broaden regression when shared money, identity, capacity or permission behavior changes. Do not rerun everything after a minor text edit.

Retain the agreed implementation statuses: **Not started; Implementing; In active audit; Implemented, awaiting focused verification; QA failed; Blocked by defect; Awaiting external verification; Verified in test environment; Release verified.** Design completion is tracked separately from implementation completion.

A development task is complete when the required behavior is connected, permissions enforced, relevant checks satisfied or non-blocking failures triaged, the affected journey exercised or tracked in the active browser audit, and evidence/limitations recorded. Acceptance-blocking failures keep it incomplete. A case is complete when every required customer/operator/professional step and its meaningful recovery works, records persist and the business can operate. A release additionally requires its applicable configuration, migration, provider/device, regression and post-deployment checks.

Report progress as **Case → required scenarios → passed → failed → blocked/awaiting external → overall status**, including untested cases. Do not count a case as complete simply because its feature has a mockup.

## 12. Required designer handoff

Return these deliverables together:

1. **Corrected mockup pack** preserving stable screen IDs, with a current revision and change log. Exclude new Website and Messages designs.
2. **Findings disposition** for F01–F34 with before/after page references and unresolved questions.
3. **Navigation and role variants** with current-to-proposed destination mapping and no duplicate sources of truth.
4. **Complete screen/state inventory** for D01–D25 and the reusable dialogs, identifying Existing / Revised / New / Reference only / Missing.
5. **Connected prototypes** covering the representative operational journeys and their key failure paths.
6. **Traceability matrix:** owner setup → product/record → operator screen/action → customer/professional result → management/recovery page → implementation task → QA scenario.
7. **Repository-aligned execution plan** with projects, milestones, small tasks, dependencies and Start Here / Resume Execution. Exact code/file references only after inspection.
8. **Short decision list** containing genuine product-policy or integration decisions, your recommended answer, consequence and which work can continue independently.

For every new page, modal or drawer specify its purpose, role, entry point, fields/options, primary/secondary actions, validation, save/publish behavior, impact, result, error recovery and responsive layout. Make the ordinary path short and clear; keep the complexity in well-chosen defaults, advanced settings and precise consequence reviews.

The goal is an owner who can set up the business, an operator who can complete the work, and a customer or professional who understands the outcome. Complete those loops before adding more decorative dashboards.

---

## Source coverage record

| Source section | Pages | Review focus / main handoff links |
|---|---|---|
| A Workspace admin | 4–8 | Navigation, Calendar, appointment and Sales; F14–F15, F33–F34, D01/D07/D20 |
| B Back office | 9–35 | Setup forms, rules, devices, reconciliation; F03–F09, F18–F21, D02–D08/D12–D14/D21–D25 |
| C People | 36–46 | Identity, profile/bookability/access, privacy and migration; F15–F18, D09–D11 |
| D Sell | 47–54 | Services, packages, events, resources; F03/F07–F08/F14, D02/D06/D12–D16 |
| E Relationships / Web / Settings | 55–59 | Customer and offer state, presets; F26/F33, D18/D24–D25. Website editor p58 reference-only |
| F Mobile talent / guest | 60–62 | Assignment conflict, identity and pass labels; F12/F15, D10 |
| G Counter | 63–92 | Basket, holds, options, pickup, localization; F01–F02/F12/F19/F29–F31, D03–D05/D17 |
| H Tables | 93–121 | Seating, movement, checks, kitchen, minimum spend; F05/F10/F24/F34, D12–D13/D17 |
| I Bookings / gate / office / display | 122–144 | Linked balance, assignments, attendance, gate roles; F01–F02/F09/F14–F15/F25–F26 |
| J Money | 145–176 | Tender, uncertainty, refund, drawers, issues; F10–F11/F18–F22, D20–D23 |
| K Event journeys | 177–189 | Inventory, eligibility, issuance, exchange; F07–F09/F21, D14–D15 |
| L Appointment / class journeys | 190–204 | Phases, hours, deposits, credits and series; F12–F15/F25, D06–D08 |
| M Reservations / QR | 205–216 | Pacing, intervals, changes, guest ordering; F05–F06/F24, D12–D13/D17 |
| N Packages / memberships / agency | 217–226 | Propagation, benefits, milestones and visibility; F03/F26/F28, D16/D18 |
| O Spaces / resources | 227–233 | Full intervals, extension, reset, custody; F04–F05/F21, D12–D13 |
| P Field Services | 234–243 | Job pricing, travel, completion and offline; F27, D19 |
| Q Remaining states | 244–262 | Safe switch, setup, sharing, delivery, benefits; F20–F23/F28/F33, D15–D16/D20–D22 |

