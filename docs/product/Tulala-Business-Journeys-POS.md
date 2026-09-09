# Tulala: 48 connected business and talent journeys

Version 2.0 | 8 September 2026\
Scope: shared commerce, bookings, POS and Mercado Pago Point. No inventory.\
Status: product direction; journeys below describe the intended integrated experience, not certified live functionality.


## Read this document first

This edition preserves all 48 business and talent journeys, the navigation/label dictionaries and required discounts, and adds a repository-grounded audit and developer delivery plan.

**Audit outcome:** two GitHub issues remain open and no pull requests are open. Source already contains remediation for both issue areas, so deployment/configuration and acceptance proof must be reconciled before calling them fixed. Event checkout needs completion and verification; native POS and Point remain planned integrations over existing commerce foundations.

- Product experience and 48 journeys: continue below.
- Shared labels, POS vocabulary and discounts: see their existing sections.
- [Audit, unfinished-work register and development wrap-up](#audit-and-development-wrap-up--8-september-2026): use this for implementation planning and current evidence.
- Full business taxonomy: refer to **Business-specific-labels-Workspace-Theme.md**.

The audit is a targeted source and GitHub review, not live production certification. Its evidence classifications and delivery sequence take precedence over older implementation-status summaries in this document.

## One platform, three connected parts

- Workspace/back office: catalog, roster, team, bookings, orders, customers, payments, reporting and configuration.
- Tulala POS: the proposed staff-facing selling screen. Start a walk-in sale or open an existing appointment, booking, reservation or order; confirm extras, calculate the outstanding amount and collect payment.
- Mercado Pago Point: the payment terminal integration. Mercado Pago processes the terminal payment; Tulala maintains the commercial record and verifies the result.

POS is a separate screen within the same product, not a second catalog or customer database. Kitchen/Bar is an optional preparation screen for hospitality.

## Workspace entry and POS experience

Agreed product direction: enable POS as an optional workspace feature. Authorized staff enter through **Open POS** at the top right or in the sidebar. Both entry points open the same dedicated, full-screen selling interface.

Use **Back to Workspace** to return. Leaving POS preserves saved open orders and does not cancel a terminal payment, close a cash shift or mark a sale completed. Closing a register shift is a separate explicit action. Show unsaved changes and pending payments before staff leave.

The workspace manages the business; POS serves the customer in front of the operator. Both use the same catalog, customer records, orders and payments. POS brings together the operational features needed for the sale; website editing and detailed management remain in the workspace.

| Business                 | POS operating view                                              |
| ------------------------ | --------------------------------------------------------------- |
| Restaurant / bar         | Tables, menu, open checks, preparation and payment              |
| Salon / spa              | Today's appointments, specialists, services, extras and payment |
| Independent professional | Appointments, services, walk-ins and payment                    |
| Studio / classes         | Sessions, remaining places, attendees and walk-in purchases     |
| Events / venue           | Admission sales, check-in shortcuts and payment                 |
| Agency                   | Optional office collection against existing booking orders      |

Business type supplies a starting layout; enabled features and operator permissions determine available controls. A cashier does not gain full administration access by opening POS. Kitchen/Bar can have its own restricted operating screen.

## Workspace payment-provider selection

**Settings → Integrations → Payments** is the canonical configuration page, also linked from Payments and POS setup.

The owner or authorized workspace administrator can connect **Stripe**, **Mercado Pago**, or both where eligible. Prefer defaults per sales channel over a single switch that implies all provider capabilities are identical.

| Setting                    | Intended control                                                                  |
| -------------------------- | --------------------------------------------------------------------------------- |
| Connected accounts         | Provider, verified business/account, country and connection status                |
| Online checkout            | Default eligible provider for website purchases and deposits                      |
| In-person card collection  | Mercado Pago Point, or Stripe Terminal where separately integrated and supported  |
| Register / terminal        | Bind a location and register to the correct merchant account and supported device |
| Cash                       | Enable recording cash receipts and register movements                             |
| Refunds and reconciliation | Preserve original provider/account and show pending or unmatched results          |

Example: a Mexican salon can select Mercado Pago for both online deposits and Point collection. Another eligible business could use Stripe online and Point in person. These are target configurations, not already delivered integrations.

Use secure provider authorization and server-side credentials. Validate merchant ownership, country, currency and channel support before enabling collection. Never silently charge through another business's account or fail over to another provider while a payment result is uncertain.

Changing a default affects new payment attempts only. Existing transactions retain their provider/account references for status checks, settlement, refunds and disputes. Saved cards, mandates and recurring agreements are not assumed portable between providers.

This setting controls money collected from a business's customers. How the workspace pays its own Tulala subscription remains a separate billing decision. Likewise, provider choice does not itself define talent commission rates or grant a payout capability.

## Mexico and Latin America strategy

The payment integration is **Mercado Pago**, including **Point** terminals. Selling listings through the **Mercado Libre marketplace** would be a separate integration and is outside this update.

The intended regional experience is one Tulala workspace covering the Website, online purchases/deposits, POS collection and payment reporting through the business's eligible Mercado Pago account. Provider-specific checkout, QR, terminal and reconciliation capabilities are connected behind Tulala's shared Orders and Payments model.

Mercado Pago's official documentation identifies seven operating markets: Argentina, Brazil, Mexico, Chile, Colombia, Peru and Uruguay. This is regional presence, not a guarantee that every product is available in every country. [Official regional use cases](https://www.mercadopago.com.ar/developers/en/docs/mp-plugin/use-cases)

| Market                   | Proposed rollout treatment                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mexico                   | First pilot: verify online checkout, compatible Point device, refunds and reconciliation                                                                          |
| Argentina, Brazil, Chile | Next candidates; the inspected Point terminal-mode API lists these sites alongside Mexico, but local hardware and merchant eligibility still require verification |
| Colombia, Peru, Uruguay  | Evaluate online payment integration first; do not advertise the same Point integration without country-specific confirmation                                      |

The inspected Point terminal-mode endpoint restricts its supported sites to Argentina, Brazil, Chile and Mexico and names specific supported hardware. This endpoint's scope is evidence for that integration path, not a blanket statement about every terminal product Mercado Pago sells. [Point terminal-mode reference](https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/terminals/update-operation-mode/patch)

Stripe online eligibility also must not be confused with Stripe Terminal availability. Device, country and currency constraints need separate validation before showing Stripe as an in-person option. [Stripe Terminal regional requirements](https://docs.stripe.com/terminal/payments/regional)

Maintain a verified capability matrix by provider, country, merchant account and channel: online collection, terminal collection, QR payment, refunds, tips, installments, reporting and commissions/payouts. Only expose enabled, tested combinations. A Mexican connection does not establish cross-border processing rights in another country.

Regional rollout sequence:

1. Connect one Mexican merchant and identify its exact Point model.
2. Verify website deposit → POS balance → provider result → receipt → reconciliation.
3. Verify cash, failed/pending payments, duplicate notifications and refunds.
4. Add supported external-transaction imports with an unmatched-payment queue.
5. Pilot a second business type using the same integration.
6. Expand country by country with local validation and Spanish/Portuguese presentation as appropriate.

Across all 12 journeys below, references to Point describe the Mexico-first example. The order and business workflow stay the same when another eligible provider is chosen. No inventory is introduced.

## Mercado Pago connection

The terminal product is Mercado Pago Point, rather than Mercado Libre. Mexico is the initial planning assumption; exact country, terminal model and merchant eligibility must be confirmed before implementation.

Official Mexico documentation lists Point Smart 1 and Point Smart 2 for this integration. The documented flow is: the POS creates a payment order, the terminal loads it, the buyer pays, and the integrated system receives status notification.\
Source: [https://www.mercadopago.com.mx/developers/en/docs/mp-point/overview](https://www.mercadopago.com.mx/developers/en/docs/mp-point/overview)

Two distinct workstreams:

1. Integrated payments: Tulala initiates collection against a known order and links verified provider results to it.
2. External payment reconciliation: recover supported transactions initiated outside Tulala through authorized APIs/reports. Coverage, history and terminal mode must be tested. Unmatched transactions remain visible for review; never invent items or customer identity from an amount.

The owner should see provider/account, terminal/location where available, gross amount, fees/net where available, status, refunds, linked order, unmatched items and last successful sync. Payment approval and funds becoming available are different states. Provider reports can assist settlement reconciliation.\
Source: [https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/additional-content/reports/released-money/introduction](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/additional-content/reports/released-money/introduction)

Use the current Point Orders API, not the older Payment Intent API. Maintain separate Tulala order IDs and Mercado Pago order/payment IDs.\
Source: [https://www.mercadopago.com.mx/developers/en/docs/mp-point/migrate-payment-intent-to-orders](https://www.mercadopago.com.mx/developers/en/docs/mp-point/migrate-payment-intent-to-orders)

Example: a MXN 1,200 service with MXN 300 already paid and MXN 100 in approved extras has MXN 1,000 left to collect. POS sends that balance to Point. A verified successful result adds the payment once, updates the balance, and feeds reporting. A timeout stays unresolved until checked; it must not automatically trigger a second charge.

An online deposit and a terminal balance can use different providers but belong to one Tulala order. Refund each payment through its original provider. Do not assume existing Stripe transfers can distribute money collected by Mercado Pago. Commission accounting and actual provider-supported payout execution need separate treatment. Mercado Pago's documented Split Payments 1:1 is restricted to listed online checkout products, so it is not evidence of Point support.\
Source: [https://www.mercadopago.com.mx/developers/en/docs/split-payments/split-1-1/integration-configuration/create-configuration](https://www.mercadopago.com.mx/developers/en/docs/split-payments/split-1-1/integration-configuration/create-configuration)

## Workspace and POS design direction

Workspace is the management interface. POS is an optional operational mode inside the same workspace, with the same catalog, customers, orders and payments. These are proposed experiences, not a statement that terminal charging or all scheduling rules are live.

Workspace retains Tulala's warm neutral background, white surfaces, restrained orange accent and plum primary actions. The business/location identity stays visible. Open POS appears in the header and navigation for enabled businesses and authorised staff.

The final navigation contains Overview and Open POS; Operate (Inbox, Calendar, Sales, Customers); Sell (Catalog, Discounts, Appointments, Reservations, Classes, Events & Tickets); People & Spaces (Roster, Spaces & Seating); Grow (Website, Links & QR, Media, Reviews); Manage (Analytics, Team, Payments, Settings). Show modules relevant to the workspace. Sales is the shared destination for orders and bookings, with type filters. Restaurants can label Catalog as Menu; agencies can label Customers as Clients. Roster describes assignable professionals; Team controls workspace access. Bookings and Orders remain distinct linked records underneath Sales.

The original twelve journeys below retain their customer and staff steps. References to opening Orders or Bookings in the workspace now mean Sales with that view selected; POS Open Orders remains an operational order list. The earlier interactive mockup reflects an earlier navigation revision. The label dictionaries and development record in this version govern the updated build.

POS replaces the management sidebar with service controls. Restaurant layout: tables/open orders on the left, menu in the centre, selected order and Charge on the right. Salon layout: today's appointments and walk-ins, services/extras, then the linked bill. Venue layout: sessions/admissions, ticket selection and check-in, then payment. On smaller screens these sections stack with the current order and balance retained.

Open POS → select an existing visit or start a walk-in → add agreed items → send preparation items where relevant → Charge → verify payment → receipt → continue service or Back to Workspace. Back to Workspace never cancels an order, reverses payment or closes a shift. A refund or shift close is a separate explicit action.

Payment UI must distinguish awaiting payment, verified approval, decline, cancellation and unknown result. An unknown result prompts status checking before another attempt. Apply eligible deposits once, collect only the outstanding balance and preserve the provider used for each payment. Settings → Integrations → Payments configures eligible providers and terminal assignments; POS displays the configured choices.

The companion interactive concept demonstrates restaurant Overview, Orders, Payments and POS using one sample order. Payment and Kitchen actions are simulations. Other navigation labels illustrate placement and are not implemented product screens. No inventory is included.

## Industry presets: build approach

Build a small set of reusable POS layouts: **Counter, Appointments, Table service, Classes & Admissions, and Booking collection**. Each uses the same catalog, customers, orders, scheduling and payment services. Industry presets select vocabulary, relevant modules, operational shortcuts and a default layout. They do not create a separate POS application for every business type.

Keep the workspace visually consistent with Tulala, with restrained business branding. Public website themes are a separate Page Builder choice. A business may combine layouts, such as a spa offering yoga classes; the owner chooses the default and authorised staff can switch tasks. Preset selection never changes prices, policies, permissions or payment accounts automatically.

The additions beneath all twelve case studies show the suggested workspace labels, POS opening screen, selling screen and website sections. They are proposed configurations, not certification that all required capabilities are live. Start by validating Restaurant and Nail salon end to end, then expand the reusable layouts. An industry is ready only when its full workflow and exception handling have passed acceptance checks.

For the complete business-type directory, label alternatives, search/onboarding behaviour, Settings preview rules and Page Builder integration, refer to **[Business-specific-labels-Workspace-Theme.md](../Business-specific-labels-Workspace-Theme.md)**. Its 120 classifications map to shared presets; classification availability alone does not imply specialised workflow support.

## 1. Nail salon

*A customer books a manicure with nail art.*

1. She finds the Website, views designs and selects a service from Catalog.
2. She chooses a technician from the Roster, displayed as Our Specialists, or any available technician.
3. Appointments checks the technician and, where required, a workstation.
4. The linked Order records the service, nail-art extras and any deposit.
5. Staff open that order in POS, confirm additional services and send only the outstanding balance to the connected Point terminal, or record cash.
6. Verified payment updates the order; Customers, Reviews and Analytics retain the visit and support rebooking.

Custom requests: bridal nail parties use Inquiry → Offer → Booking with several technicians; POS collects against the resulting commercial record.

### What the nail salon staff would experience

1. **Log into the salon workspace.** Reception sees today's appointments; managers maintain services and specialists here.
2. **Click Open POS.** The service screen shows appointments, walk-ins, services and the current bill.
3. **Select the manicure appointment.** The assigned technician, workstation and linked order appear, including any deposit already paid.
4. **Add agreed nail-art extras.** Update that order without navigating to Catalog or creating a second booking.
5. **Tap Charge.** Collect the outstanding balance using the configured eligible terminal or cash; confirm the payment result before issuing the receipt.
6. **Continue serving or return to Workspace.** The same appointment, customer history, order and collection are available for review.

### Suggested workspace, POS and website preset

Selecting **Nail salon** suggests:

- **Workspace labels:** Services · Clients · Nail Technicians · Stations.
- **POS layout:** Appointments.
- **POS opening screen:** Today’s appointments.
- **Selling screen:** Selected client + assigned technician/station + services/extras + deposit and outstanding balance.
- **Website suggestion:** Service list + technician profiles + gallery + Book appointment.
- **Operational requirements:** Offer group scheduling for bridal parties; validate technician and station together.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 2. Spa

*A couple books two treatments at the same time.*

1. They select a couples package on the Website.
2. The spa assigns two therapists from its Roster.
3. Appointments and Spaces coordinate both therapists and the treatment room in one availability decision.
4. The Order records the package, agreed extras, deposit and balance.
5. Reception opens the existing order in POS and collects the remaining amount through Point or cash, without charging the deposit again.
6. Customers retains the visit and appropriately restricted preferences; Payments and Analytics reflect collection.

Important: all required resources must be available together; three unrelated confirmations are insufficient.

### What the spa reception staff would experience

1. **Log into the spa workspace.** Review today's visits, therapists and treatment rooms.
2. **Click Open POS.** Reception opens the couple's existing visit rather than booking their package again.
3. **Confirm both guests have arrived.** The linked visit shows the two therapists, room, treatments and recorded deposit.
4. **Add approved extras.** If an extra changes duration or resources, recheck availability before confirming the change.
5. **Tap Charge.** Collect the remaining package balance through an eligible terminal or cash, applying the deposit once.
6. **Return to Workspace when needed.** Managers review the visit and payments; sensitive customer notes remain limited to authorised roles.

### Suggested workspace, POS and website preset

Selecting **Spa** suggests:

- **Workspace labels:** Treatments & Packages · Clients · Therapists · Treatment Rooms.
- **POS layout:** Appointments.
- **POS opening screen:** Today’s appointments.
- **Selling screen:** Selected visit + guests + assigned therapists/room + package/extras + deposit and outstanding balance.
- **Website suggestion:** Treatment packages + therapist profiles + room gallery + Book treatment.
- **Operational requirements:** Coordinate all therapists and the room together; add Classes as a secondary workflow when offered.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 3. Independent massage therapist

*A therapist works at a spa and also accepts private appointments.*

1. Their Talent Profile/Website presents services, service areas and availability.
2. Standard treatments use Appointments; a hotel visit with special requirements starts as an Inquiry.
3. The therapist sends an Offer where needed; acceptance creates the Booking.
4. Shared availability should prevent conflicts between private work and spa Roster assignments while protecting private client information.
5. For private work, the therapist opens the order in mobile POS and collects through a supported connected terminal or records cash. For spa-owned work, collection follows the spa's seller/account configuration.
6. Customers and Payments record the visit, with commissions and payouts only through an explicitly supported arrangement.

One professional can have several business relationships. Seller identity and account routing must be explicit.

### What the independent therapist would experience

1. **Open the correct workspace.** Use the private practice workspace for a private client, or the spa workspace when acting for the spa.
2. **Open the appointment or accepted Booking.** Review the service, time and location without duplicating the inquiry workflow.
3. **Click Open POS if collecting in person.** The linked order identifies the seller and the payment account receiving the money.
4. **Confirm the completed service and agreed extras.** Any time extension must respect the therapist's other commitments.
5. **Tap Charge.** Use a supported configured payment method; if no compatible terminal is available, use the available online collection flow or record cash appropriately.
6. **Return to Workspace.** Review payment and booking history. Any commission or professional payout remains a separate obligation and supported workflow.

### Suggested workspace, POS and website preset

Selecting **Independent massage therapist** suggests:

- **Workspace labels:** Services · Clients · Professionals (hidden when solo) · Service Locations.
- **POS layout:** Appointments; Booking collection for custom work.
- **POS opening screen:** Today’s appointments.
- **Selling screen:** Selected client + service location + treatment/extras + seller identity + outstanding balance.
- **Website suggestion:** Services + therapist profile + service areas + Book appointment / Send inquiry.
- **Operational requirements:** Use travel buffers and shared availability; distinguish private-practice collection from spa-owned work.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 4. Tattoo studio

*A customer requests a custom tattoo.*

1. They browse Website portfolios and choose an artist from the Roster.
2. An Inquiry captures references, approximate size and placement.
3. The artist discusses the request in Inbox and sends an Offer with price and deposit terms.
4. Acceptance creates the Booking with the artist, time and workstation.
5. Staff open the linked Order in POS, confirm changes and collect the remaining balance through Point or cash.
6. Payment, messages and follow-up remain connected to the customer and booking.

Alternative: fixed-price flash tattoos use direct Appointments; walk-ins can start at POS while still checking artist availability.

### What the tattoo studio staff would experience

1. **Open the studio workspace.** Follow the custom request through Inquiry → Offer → Booking, assigning the artist and station.
2. **On appointment day, click Open POS.** Select the accepted booking and its existing order.
3. **Review the agreed work and deposit.** Relevant booking details appear; private consultation information remains access controlled.
4. **Confirm any price changes with the customer.** Add agreed extras to the existing order; recheck scheduling if the session grows.
5. **Tap Charge.** Collect only the balance through the configured eligible terminal or cash and record the verified result.
6. **Return to Workspace.** Follow-up messages, booking history and payment remain connected. A walk-in flash tattoo can start with availability checking and a new appointment.

### Suggested workspace, POS and website preset

Selecting **Tattoo studio** suggests:

- **Workspace labels:** Services · Clients · Artists · Stations.
- **POS layout:** Appointments; Booking collection for quoted work.
- **POS opening screen:** Today’s appointments, with linked accepted bookings.
- **Selling screen:** Selected client + artist/station + agreed tattoo service + deposit + approved adjustments + balance.
- **Website suggestion:** Artist portfolios + flash designs + custom request form + Request a quote.
- **Operational requirements:** Custom tattoos retain Inquiry → Offer → Booking; direct flash appointments and walk-ins use availability checks.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 5. Hair salon

*A customer books colour and a haircut.*

1. She chooses services and a stylist on the Website.
2. Appointments checks the stylist's availability.
3. Resource scheduling accounts for a chair or wash station when needed.
4. The Order records agreed services and any deposit; staff obtain agreement before adding extras.
5. POS collects the balance through Point or cash. Tips are recorded separately where the selected device and integration support them.
6. Customers retains service history and preferences; reporting attributes the sale to the relevant professional.

Custom requests: wedding hair for six people uses Inquiry → Offer → Booking with multiple stylists, followed by payment against the linked order.

### What the hair salon staff would experience

1. **Log into the salon workspace.** Review the day's stylists, appointments and resource assignments.
2. **Click Open POS.** Open the arriving customer's colour-and-cut appointment.
3. **Review the linked services and deposit.** The stylist and appointment remain attached to the bill.
4. **Add customer-approved treatments or adjustments.** Changes requiring more time trigger an availability check before confirmation
5. **Tap Charge.** Collect the outstanding balance and, where supported, an optional tip with clear allocation.
6. **Continue with the next customer or return to Workspace.** Review the completed visit, sale and customer history in the same records.

### Suggested workspace, POS and website preset

Selecting **Hair salon** suggests:

- **Workspace labels:** Services · Clients · Stylists · Chairs & Stations.
- **POS layout:** Appointments.
- **POS opening screen:** Today’s appointments.
- **Selling screen:** Selected client + stylist + services/extras + applicable deposit + balance + optional supported tip.
- **Website suggestion:** Services + stylist profiles + gallery + Book appointment.
- **Operational requirements:** Account for processing phases and wash stations; time extensions require availability validation.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 6. Restaurant

*A guest reserves a table and orders dinner.*

1. The guest books through Reservations on the Website.
2. Staff assign a table from Spaces & Seating.
3. Staff open a linked Order in POS, or the guest orders through the table's contextual QR link.
4. Both channels use the same Menu; Kitchen receives preparation items.
5. POS shows the final bill and any applicable deposit credit, then collects through Point or cash.
6. Orders, Customers, Payments and Analytics reflect the visit, with a receipt.

Custom requests: private dinners begin with Inquiry → Offer → Booking. Kitchen is optional; inventory is excluded.

### What the restaurant staff would experience

1. **Log into Tulala → El Paisa workspace.** Managers use this area for reservations, menu configuration, people and reporting.
2. **Click Open POS.** A full-screen selling interface replaces the management sidebar with Tables, Open Orders, Menu and Charge.
3. **Select Table 5.** Open its existing order or start one. Relevant details from a linked reservation appear here.
4. **Tap two burgers and two beers → Send to Kitchen.** Preparation items route to the relevant station; the waiter stays in POS.
5. **Tap Charge → Mercado Pago Point.** With a supported configured integration, send the outstanding amount to the terminal after applying eligible deposit credit. Update the balance only after payment verification; cash is a separate option.
6. **Continue serving or click Back to Workspace.** The owner reviews that same sale in Orders and Payments. Returning to management does not close the shift.

### Suggested workspace, POS and website preset

Selecting **Restaurant** suggests:

- **Workspace labels:** Menu · Guests · Professionals (optional) · Tables & Spaces.
- **POS layout:** Table service; Counter for takeaway.
- **POS opening screen:** Tables & Open Orders.
- **Selling screen:** Selected table/guest + menu/modifiers + preparation actions + current check + eligible credit + balance.
- **Website suggestion:** Menu + location/hours + reservation form + Reserve a table / View menu.
- **Operational requirements:** Kitchen and contextual table QR use the same order foundation; counter sales do not require a reservation.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 7. Bar

*A group reserves a booth for a live-music night.*

1. They discover the night through Events & Tickets.
2. They buy admission and optionally reserve a booth through Reservations.
3. Capacity controls admission availability; Spaces controls booth availability.
4. Staff check admission and open an Order/tab in POS; drinks appear on an optional Bar preparation screen.
5. Staff settle the tab through Point or cash, applying only agreed reservation credit and supported split-payment behavior.
6. Payments reconciles the result and Analytics separates ticket revenue from drinks.

Roster connection: performer hiring uses Inquiry → Offer → Booking, separate from customer purchases. An open bar ticket is a check, not an event admission.

### What the bar staff would experience

1. **Open the bar workspace.** Review tonight's event and booth reservations; performer bookings stay in the booking workflow.
2. **Click Open POS.** Staff see booths, open tabs and the drinks menu, with admission check-in where enabled.
3. **Select the group's booth.** Check admission separately and open the linked drinks order; a booth does not automatically grant admission.
4. **Add drinks → Send to Bar.** Keep the tab open as the group orders; preparation staff receive the appropriate items.
5. **Tap Charge.** Apply any eligible reservation credit and collect the balance. Split payments, when implemented, must track each payment and remaining balance separately.
6. **Continue service or return to Workspace.** Review admission and drinks revenue without confusing guest purchases with performer fees.

### Suggested workspace, POS and website preset

Selecting **Bar** suggests:

- **Workspace labels:** Menu · Guests · Performers (optional) · Tables & Booths.
- **POS layout:** Table service; Classes & Admissions for ticketed nights.
- **POS opening screen:** Open Tabs, with table/booth selection.
- **Selling screen:** Selected tab/booth + drinks/extras + Send to Bar + eligible credit + outstanding balance.
- **Website suggestion:** Drinks menu + event calendar + booth reservations + Reserve a booth / Get tickets.
- **Operational requirements:** Guest admission and drinks tabs are separate entitlements; performer hiring remains a separate booking workflow.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 8. Modelling or talent agency

*A brand hires three models for a campaign.*

1. The client browses the Roster, portfolios and profiles.
2. An Inquiry captures dates, location and requirements.
3. The agency develops the brief, assembles the lineup and sends an Offer.
4. Acceptance creates the Booking; assignments and schedules remain central.
5. The linked Order and Payments track deposits and balances. Online collection remains available; optional POS lets office staff collect an in-person payment through Point against the same record.
6. Clients retains project history, messages and documents; commission obligations and actual payouts remain distinguishable.

POS is optional. It does not replace the inquiry or booking workflow, and Point collection does not automatically enable talent payouts.

### What the agency staff would experience

1. **Log into the agency workspace.** Start in Inbox, Roster or Bookings; POS can remain hidden when unused.
2. **Open the client inquiry.** Review the brief, shortlist talent and check availability.
3. **Send the Offer and confirm the Booking after acceptance.** Maintain assignments, schedules and project details in the booking workflow.
4. **Open the linked commercial record.** Review fees, expenses, deposits and the amount due; send the supported online payment request when appropriate.
5. **Use Open POS only for an in-person collection.** Select the existing order and collect its outstanding amount using an eligible configured terminal or cash.
6. **Continue in Workspace.** Review client history, collections, commissions and payout obligations. A client payment does not itself execute talent payouts.

### Suggested workspace, POS and website preset

Selecting **Modelling or talent agency** suggests:

- **Workspace labels:** Services & Packages · Clients · Roster · Spaces & Seating (optional).
- **POS layout:** Booking collection, optional.
- **POS opening screen:** Accepted bookings awaiting collection; Workspace Sales defaults to Bookings.
- **Selling screen:** Selected client/booking + assigned talent summary + agreed fees/expenses + deposit + outstanding balance.
- **Website suggestion:** Roster + portfolios + agency services + brief form + Send inquiry.
- **Operational requirements:** POS can remain hidden. Keep briefs, assignments and commissions in Workspace; collection does not execute talent payouts.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 9. Yoga or fitness studio

*A customer joins a weekly class.*

1. They view Classes on the Website and choose a dated session.
2. The session identifies an instructor from the Roster and a room from Spaces.
3. Capacity checks places before confirming attendance.
4. Online registration creates an Order and the relevant attendee/admission record.
5. Reception uses POS for walk-in registrations, with the same capacity checks, collecting through Point or cash before issuing the appropriate confirmation.
6. Attendance, Customers and Analytics reflect participation and sales.

Alternative: private training uses Appointments; corporate workshops use Inquiry → Offer → Booking.

### What the fitness studio staff would experience

1. **Open the studio workspace.** Review today's classes, instructors, rooms and available places.
2. **Click Open POS at reception.** Select a dated class session and find the arriving customer.
3. **Open an existing registration or add a walk-in.** Paid attendees are checked in without being charged again; new registrations must pass capacity checks.
4. **Review the class order.** Show the selected session, participant and amount due before collection.
5. **Tap Charge for an unpaid registration.** Verify payment and confirm the place according to the booking policy; failed payment must not leave an indefinite capacity hold.
6. **Continue checking in or return to Workspace.** Attendance, customers, orders and payments remain linked to that session.

### Suggested workspace, POS and website preset

Selecting **Yoga or fitness studio** suggests:

- **Workspace labels:** Classes & Services · Customers · Instructors · Studios & Rooms.
- **POS layout:** Classes & Admissions; Appointments for private training.
- **POS opening screen:** Today’s sessions.
- **Selling screen:** Selected session + available places + attendee/payer + registration or existing admission + amount due.
- **Website suggestion:** Class schedule + instructor profiles + private training + Join a class.
- **Operational requirements:** Check in paid/free attendees without charging again; validate room/instructor availability and remaining places for walk-ins.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 10. Photography studio

*A company books a photographer, makeup artist and studio.*

1. They view Website portfolios and packages.
2. They submit an Inquiry describing the shoot.
3. The studio assigns professionals from the Roster and proposes a space.
4. An accepted Offer creates the Booking with people, place and time coordinated.
5. Staff open the linked Order in POS for in-person balance collection through Point or cash, including only approved extras; remote collection can remain online.
6. Payments, project messages and customer history remain linked.

Alternative: fixed-duration headshots use Appointments; a walk-in can book and pay at reception.

### What the photography studio staff would experience

1. **Open the studio workspace.** Manage the inquiry, proposal and accepted booking with photographer, makeup artist and space assignments.
2. **At the shoot, click Open POS if collecting in person.** Select the existing booking and linked order.
3. **Review the package and deposit.** Confirm what is included and the current outstanding balance.
4. **Add approved extras.** An additional shooting hour requires availability validation before extending the booking.
5. **Tap Charge.** Collect the balance through an eligible configured terminal or cash, or use the supported online collection workflow when paying remotely.
6. **Return to Workspace.** Review the project, messages and payment, with any professional payout tracked separately.

### Suggested workspace, POS and website preset

Selecting **Photography studio** suggests:

- **Workspace labels:** Packages & Services · Clients · Creative Team · Studios & Sets.
- **POS layout:** Booking collection; Appointments for headshots.
- **POS opening screen:** Today’s shoots and accepted bookings.
- **Selling screen:** Selected client/shoot + package + assigned people/studio + approved extras + deposit + balance.
- **Website suggestion:** Portfolio + packages + creative profiles + Request a shoot / Book headshots.
- **Operational requirements:** Custom projects retain the proposal workflow; additional shooting time requires people and space availability checks.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 11. Beach club

*A group books a cabana and an evening event.*

1. They explore cabanas and events on the Website.
2. Reservations secures a cabana from Spaces & Seating.
3. Events & Tickets handles evening admission under its own capacity rules.
4. Staff or the cabana QR channel adds food and drinks to the appropriate Order, with preparation routed to Kitchen/Bar.
5. POS settles the order through Point or cash and applies only explicitly agreed credits.
6. Customers connects the visit while Analytics distinguishes reservations, admission and food-and-drink sales.

Important: a cabana reservation does not automatically grant event admission. Linked entitlements need explicit rules.

### What the beach club staff would experience

1. **Open the club workspace.** Review cabana reservations and evening admissions as separate entitlements.
2. **Click Open POS.** Service staff see cabanas, open orders and the food-and-drinks menu.
3. **Select the arriving group's cabana.** Open its linked order and review the explicit deposit or spending-credit terms.
4. **Add items or receive contextual QR orders.** Route food to Kitchen and drinks to Bar while keeping the order linked to the cabana.
5. **Tap Charge.** Apply eligible credit once and collect the outstanding balance. Evening tickets require their own admission and capacity validation.
6. **Continue serving or return to Workspace.** Review cabana, admission and food-and-drink charges without counting the same payment twice.

### Suggested workspace, POS and website preset

Selecting **Beach club** suggests:

- **Workspace labels:** Menu & Packages · Guests · Professionals (optional) · Cabanas & Seating.
- **POS layout:** Table service; Classes & Admissions for events.
- **POS opening screen:** Cabanas & Open Orders.
- **Selling screen:** Selected cabana/guests + menu + preparation actions + eligible spending credit + outstanding balance.
- **Website suggestion:** Cabana gallery + menu + event calendar + Reserve a cabana / Get tickets.
- **Operational requirements:** Cabana reservation, food/drink credit and event admission have explicit separate rules; do not infer bundled entitlements.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## 12. Event venue

*A company books a private celebration with entertainment.*

1. They explore spaces and galleries on the Website.
2. An Inquiry captures date, guest count and requirements.
3. The venue sends an Offer for the space, services and performers from its Roster.
4. Acceptance creates a Booking with resource and professional assignments.
5. Events & Tickets manages admission where needed. POS collects an outstanding client balance or creates separate on-site guest purchases through Point/cash.
6. Orders and Payments preserve each payer's records, deposits and balances, while reporting and supported payout arrangements reflect the event.

Alternative: a public concert starts in Events & Tickets; ticket sales at the door use POS with the same capacity and admission checks. Guest bar purchases do not silently join the organiser's bill.

### What the event venue staff would experience

1. **Open the venue workspace.** Manage the organiser's inquiry, accepted offer, spaces, performers and booking.
2. **On event day, click Open POS where in-person selling is needed.** Select organiser collection, door admission or concessions as the relevant task.
3. **Open the correct order and payer.** The organiser's balance is separate from individual guests' ticket or drinks purchases.
4. **Add the agreed charge or dated ticket.** Ticket sales validate capacity; check-in validates admission. Concessions route preparation items where needed.
5. **Tap Charge.** Collect through the configured eligible terminal or cash; apply a deposit only to the order it legitimately covers.
6. **Return to Workspace.** Review event sales, organiser collections and supplier obligations with their distinct records intact.

### Suggested workspace, POS and website preset

Selecting **Event venue** suggests:

- **Workspace labels:** Packages & Services · Clients & Guests · Professionals · Venues & Spaces.
- **POS layout:** Booking collection; Classes & Admissions; Counter for concessions.
- **POS opening screen:** Today’s events, with organiser collection / admission / concessions task selection.
- **Selling screen:** Selected event and payer + booking balance or guest ticket/items + capacity context + eligible deposit + amount due.
- **Website suggestion:** Spaces/gallery + arrangements + packages + event calendar + Request a booking / Get tickets.
- **Operational requirements:** Organiser bills and individual guest purchases stay separate; enable preparation only where concessions require it.

Refer to **Business-specific-labels-Workspace-Theme.md**, sections 6–7, for the full 120-business directory and preset mappings, and its label dictionaries for all approved naming alternatives.

## Hybrid case studies: cases 13–24

These twelve additional cases stress-test combinations of the shared features. Each solution is a proposed build requirement, not evidence of a shipped workflow. Use the existing five POS layouts and shared services; do not build twelve new POS applications. The full business-type and vocabulary directory remains **Business-specific-labels-Workspace-Theme.md**. Primary type supplies labels; secondary activities recommend modules. Some specialised capabilities below require extensions before launch.

For every case, a capacity hold has an expiry and a defined release policy. Payment, attendance, resource occupancy and service completion remain separate states. Changing one component of a package must not silently cancel, refund or grant another. Inventory remains excluded.

## 13. Coworking space with a cafe, meeting rooms and evening workshops
*A freelancer books a desk, adds a meeting room and attends a paid workshop in the same building.*

### Customer journey

1. The Website presents workspaces, the cafe menu and dated workshops under one brand.
2. The guest reserves a desk for the afternoon and requests a meeting room for an hour through Reservations.
3. Classes handles the workshop registration, with its own participant limit and room assignment.
4. Sales links the guest's reservations, workshop registration and any charges without treating them as one entitlement.
5. The guest orders coffee through a contextual QR link or counter POS; the cafe order stays separately identifiable.
6. The guest receives clear confirmations for the desk, meeting room and workshop, plus receipts for the amounts paid.

### What the staff would experience

1. **Open the coworking workspace.** Reception sees resource reservations and workshop sessions in Calendar.
2. **Open POS → Today.** Find the guest and mark the desk arrival without selling access again.
3. **Open the meeting-room reservation.** Confirm its exact start/end time and permitted participants.
4. **Switch to Counter.** Add coffee to a new order or an explicitly agreed guest bill; anonymous walk-ins need no desk reservation.
5. **Switch to Classes & Admissions.** Validate the workshop registration separately and check in the attendee.
6. **Return to Sales and Payments.** Review linked activity and collection by service without counting the same charge twice.

### Difficult combination and resolution

- **The workshop uses a room normally offered for meetings.** One resource calendar blocks the workshop interval plus setup/cleanup. Desk access does not reserve every room in the building.
- **A company pays for the desk; the guest pays for coffee.** Preserve separate payers/orders. Linking a visit does not authorise charging incidental purchases to an employer.
- **A room becomes unavailable after package selection.** Use coordinated expiring holds if selling a guaranteed bundle. Otherwise confirm each independent item clearly and offer alternatives before charging for an unavailable component.

### Suggested workspace, POS and website preset

- **Workspace labels:** Spaces & Services · Clients · Professionals · Desks & Meeting Rooms. The final resource label is a proposed scoped override to review alongside the companion dictionary.
- **POS layout/opening:** Counter + Classes & Admissions; resource reservations accessible through Today.
- **Selling screen:** Selected guest/payer + reservation/session context + cafe items + eligible charges + balance.
- **Website suggestion:** Workspace gallery + room availability + cafe menu + workshops + Reserve a space / Join a workshop.
- **Build boundary:** Membership access, door hardware and recurring desk entitlements require separate implementation; a reservation does not create them.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Coworking space, Cafe and Art workshop studio; apply shared resource and payer rules above.

## 14. Beauty academy with supervised salon services and public demonstrations
*A learner enrols in a workshop while a paying client books a supervised treatment performed during training.*

### Customer journey

1. The Website separates Learn with us from Book a salon service.
2. A learner registers for a dated class; a client independently books a supervised treatment with clear service expectations.
3. The class reserves teaching capacity while the appointment requests a station, learner assignment and qualified supervisor availability.
4. Each person receives their own confirmation and charges; tuition and treatment payments remain separate.
5. A public demonstration offered later uses Events & Tickets with explicit guest capacity.
6. Attendance, client service history and financial records retain their different purposes.

### What the staff would experience

1. **Open the academy workspace.** Review classes, supervised appointments and instructor assignments.
2. **Open POS → Today's Sessions.** Check in learners with valid registrations.
3. **Switch to Appointments.** Open the client's treatment and confirm station and supervision.
4. **Add approved service extras.** A change requiring longer supervision triggers a fresh availability check.
5. **Charge the client’s balance.** Do not attach tuition charges or another learner's fees to the client bill.
6. **Review Sales by activity type.** Managers see training and salon revenue without merging the learner and client roles.

### Difficult combination and resolution

- **An instructor supervises several stations.** Define explicit supervision coverage and permitted concurrency. Ordinary one-person exclusivity is insufficient; overlapping assignments require a validated coverage model.
- **A learner is also a client another day.** Reuse the person's identity with separate role relationships, registrations and payer references. Being on a learner list does not grant Team access.
- **A demonstration uses the teaching floor.** Block incompatible classes and appointments for that interval; guest admission is not class enrolment.

### Suggested workspace, POS and website preset

- **Workspace labels:** Classes & Services · Clients & Learners (proposed scoped override) · Instructors · Stations.
- **POS layout/opening:** Classes & Admissions plus Appointments; Today defaults to sessions.
- **Selling screen:** Explicit learner/client context + session or treatment + assigned supervisor/station + balance.
- **Website suggestion:** Course/workshop list + supervised services + instructors + Enrol / Book a service.
- **Build boundary:** Qualification tracking, supervision ratios and multi-session course enrolment are extensions; do not claim them through labels alone.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Beauty academy with Hair salon or Nail salon as secondary activities.

## 15. Cooking school with private catering and a pop-up dinner
*A company commissions a team cooking workshop and dinner while the same kitchen prepares a separate catering order.*

### Customer journey

1. The company sends an Inquiry with guest count, date, dietary requests and dinner requirements.
2. The school proposes a package covering instruction, kitchen use and the agreed meal.
3. Offer acceptance creates a Booking with chef and teaching-kitchen allocation; participant registration remains identifiable.
4. The organiser pays the agreed deposit against the package order.
5. At the event, guests can purchase optional drinks separately if the organiser has not agreed to cover them.
6. The organiser receives the package balance and approved changes; guest purchases retain their own receipts.

### What the staff would experience

1. **Open the school workspace.** Review the private booking alongside public classes and catering commitments.
2. **Open POS → Today.** Select the company event and confirm the organiser's bill and deposit.
3. **Open participant check-in.** Attendance does not create another class charge for each prepaid guest.
4. **Use preparation controls.** Route applicable meal items with event/order identity; keep the catering job separate.
5. **Charge approved balances or guest orders.** Select the correct payer before adding extras.
6. **Return to Workspace.** Review attendance, catering fulfilment and event charges independently.

### Difficult combination and resolution

- **The same chef and kitchen serve two jobs.** Reserve people and usable kitchen zones together, including setup. If independent zones and staffing are not modelled, block concurrent use rather than assume capacity.
- **Guest count increases.** Revalidate participant capacity, staffing, space and agreed pricing before amending the confirmed booking.
- **Dietary details travel to preparation staff.** Share relevant service instructions with authorised staff, without exposing unrelated private customer notes.

### Suggested workspace, POS and website preset

- **Workspace labels:** Menus & Packages · Clients & Guests · Instructors · Teaching Kitchens.
- **POS layout/opening:** Classes & Admissions plus Counter and optional preparation; Today opens the event.
- **Selling screen:** Organiser/guest payer + event package or individual items + preparation status + deposit + balance.
- **Website suggestion:** Public classes + private workshops + catering packages + Request an event / Join a class.
- **Build boundary:** Catering delivery logistics and kitchen-zone concurrency require validation; ingredient inventory stays excluded.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Cooking school + Catering company + Restaurant activity.

## 16. Diving school with lessons, boat departures and private coaching
*A visitor buys a package combining a pool lesson, a boat excursion and a private coaching session.*

### Customer journey

1. The Website explains the package components and prerequisites before purchase.
2. The guest selects a pool session, a dated departure and a coaching time.
3. The system checks instructor availability, the pool allocation and the boat's guest capacity for the chosen components.
4. A package order links separate attendance/reservation records and the payment obligation.
5. A weather disruption affects the departure; the guest receives explicit rebooking or component-refund options under the agreed policy.
6. Completed lessons remain recorded when the excursion moves; the guest is not charged for the entire package again.

### What the staff would experience

1. **Open the diving workspace.** Review sessions, crew/instructors and departure resources.
2. **Open POS → Today's Sessions.** Select the guest and inspect each package component's status.
3. **Check in the pool lesson.** Do not mark the boat trip completed or grant a missing prerequisite automatically.
4. **Handle the disrupted departure.** Move its allocation only after the replacement date and capacity are confirmed.
5. **Collect an authorised balance or process the applicable refund.** Preserve the original payment route and component allocation.
6. **Return to Workspace.** Review attendance, rescheduled work and payment history by component.

### Difficult combination and resolution

- **One bundle spans different days and resources.** Reserve required components as a coordinated package, or label them explicitly as pending selection. Never sell a guaranteed departure based solely on an available pool slot.
- **Weather cancellation affects only one component.** Maintain component-level fulfilment and a disclosed charge allocation/refund rule. Do not infer a proportional refund by dividing the total blindly.
- **Qualification requirements affect participation.** Treat eligibility verification as a separate required workflow; a successful payment is not proof of readiness.

### Suggested workspace, POS and website preset

- **Workspace labels:** Experiences · Guests · Instructors · Spaces & Seating, with Pools and Boats as resource categories.
- **POS layout/opening:** Classes & Admissions; Today shows dated sessions/departures.
- **Selling screen:** Guest + package components + eligibility/attendance state + selected departure + amount due.
- **Website suggestion:** Lessons + excursion dates + prerequisites + Choose a package / Book coaching.
- **Build boundary:** Qualification checks, boat operations and equipment/safety processes require dedicated validation; this is not a complete dive-management system.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Diving school + Boat excursion operator.

## 17. Padel club with coaching, tournaments and a cafe
*Two players reserve a court, add a coach and later enter a tournament while buying refreshments on site.*

### Customer journey

1. Guests reserve a court through the Website and optionally request a coach for the same interval.
2. The system checks the court and coach together before confirming the coached session.
3. A separate tournament registration records players/team and entry charges.
4. Tournament admission does not automatically grant unrelated practice-court time.
5. Cafe purchases use QR or Counter POS and the selected payer's order.
6. Guests receive distinct court, coaching and tournament confirmations with linked payment history.

### What the staff would experience

1. **Open the club workspace.** Review court allocations, lessons and tournament blocks.
2. **Open POS → Courts.** Select the existing reservation and verify optional coaching.
3. **Collect the remaining court/coaching charge.** Keep who paid identifiable if several players contribute.
4. **Switch to Admissions.** Validate tournament registration; spectator admission, if sold, has a separate entitlement.
5. **Switch to Counter.** Create refreshments orders without requiring a new court reservation.
6. **Review Sales.** Separate court hire, coaching, event entry and cafe charges for reporting.

### Difficult combination and resolution

- **Tournament timing is uncertain.** Block conservative event windows before publishing practice availability. Schedule changes require conflict checks and affected-booking handling.
- **Two players split payment.** Split tender records contributions to one order; it must not create duplicate court bookings. Separate bills require explicit item allocation.
- **A coach also plays in the tournament.** Use the same person's availability across assignments and participation when blocking is required; no independent duplicate calendar.

### Suggested workspace, POS and website preset

- **Workspace labels:** Courts & Services · Customers · Instructors · Courts.
- **POS layout/opening:** Resource selection plus Classes & Admissions and Counter; Courts first.
- **Selling screen:** Court/time + players/payer + optional coach + charge breakdown + outstanding balance.
- **Website suggestion:** Court availability + coaching + tournaments + Reserve a court / Enter tournament.
- **Build boundary:** Tournament brackets, match progression and automated overrun handling are extensions; Events alone does not provide them.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Padel club + Cafe, with Events enabled.

## 18. Podcast studio with room hire, engineering lessons and live audiences
*A creator books a recording room with an engineer, then converts the session into a ticketed live recording.*

### Customer journey

1. The creator selects a room and engineering package or submits a custom Inquiry.
2. The accepted booking coordinates the room, engineer and recording interval.
3. The creator requests an audience; staff review the permitted layout and capacity before offering tickets.
4. The event links to the existing studio booking instead of allocating the same room a second time.
5. Attendees purchase admission; the creator remains responsible for the studio agreement.
6. Studio charges and audience ticket receipts retain their distinct sellers/payers and refund responsibilities.

### What the staff would experience

1. **Open the studio workspace.** Review the creator's booking and the linked public event.
2. **Open POS → Booking collection.** Inspect studio hire, engineering, deposit and balance.
3. **Switch to Admissions at the door.** Check tickets without charging the creator's studio fee to attendees.
4. **Approve requested overtime.** Recheck the engineer, room and next booking before changing the end time.
5. **Collect the appropriate balance.** Guest ticket sales and creator collection stay separate.
6. **Return to Workspace.** Review resource use, attendance and financial responsibilities.

### Difficult combination and resolution

- **The event occupies an already booked room.** Link it as a dependent use within the authorised booking allocation; do not bypass conflict checks for unrelated events.
- **Studio and creator are different sellers.** Require explicit ownership for ticket sales. Cross-workspace selling or revenue sharing requires a supported agreement/integration, not a label preset.
- **Audience cancellation does not necessarily cancel recording.** Apply separate event and studio cancellation rules with dependency warnings.

### Suggested workspace, POS and website preset

- **Workspace labels:** Rooms & Services · Clients & Guests · Creative Team · Studios & Rooms.
- **POS layout/opening:** Booking collection plus Classes & Admissions; Today's Bookings.
- **Selling screen:** Creator or attendee payer + room/session or ticket + linked event context + balance.
- **Website suggestion:** Studios + engineering services + lessons + live recordings + Reserve a studio / Get tickets.
- **Build boundary:** Recording delivery/storage and cross-seller settlement are separate capabilities.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Podcast studio + workshop and Events activities.

## 19. Pet grooming salon with training classes and adoption events
*An owner books grooming for one dog, registers another for a training class and attends an adoption event.*

### Customer journey

1. The owner selects grooming services and identifies the pet receiving them.
2. The appointment reserves the groomer and station for the appropriate duration.
3. A separate class registration links the second pet and its responsible adult.
4. The adoption event has its own attendee registration or admission policy.
5. Reception collects the relevant service/class balance; event participation does not create an adoption or donation charge automatically.
6. The owner sees their payment history while each pet's service and attendance records remain distinguishable.

### What the staff would experience

1. **Open the pet-service workspace.** Review today's appointments and classes.
2. **Open POS → Today.** Select the human customer, then the correct pet and appointment.
3. **Confirm the groomer/station and approved extras.** Do not attach another pet's notes to this visit.
4. **Switch to Classes & Admissions.** Check in the correct pet/handler pair under the class policy.
5. **Charge the appropriate order.** Keep event admission or charitable collection separate when applicable.
6. **Return to Workspace.** Review owner, pet and attendance relationships without granting all staff access to every note.

### Difficult combination and resolution

- **The customer is not the service recipient.** Add an explicit pet profile linked to an owner/authorised handler; do not duplicate a customer record for every pet.
- **Class capacity counts pets and people differently.** Model the controlling limit and any room/person limits separately.
- **A third-party rescue collects money.** Do not route it to the salon account by default. Use a separately supported seller/payment arrangement or an external collection flow clearly identified as such.

### Suggested workspace, POS and website preset

- **Workspace labels:** Services · Customers · Groomers, or Professionals for mixed staff · Stations.
- **POS layout/opening:** Appointments + Classes & Admissions; Today.
- **Selling screen:** Human payer + pet/service recipient + appointment/class + extras + balance.
- **Website suggestion:** Grooming services + training schedule + public events + Book grooming / Join training.
- **Build boundary:** Pet profiles, handler permissions and pet-specific capacity are extensions; veterinary/clinical functionality is outside this preset.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Pet grooming salon + Dog trainer.

## 20. Art gallery with workshops, exhibition admission and private hire
*A company hires the gallery for an evening reception while daytime visitors attend an exhibition and painting workshop.*

### Customer journey

1. Visitors select exhibition admission or a dated workshop; the company submits a private-hire Inquiry.
2. The private offer specifies rooms, guest count, access windows and setup/teardown.
3. Acceptance allocates the agreed space while public activity uses only compatible areas and times.
4. Workshop attendees receive the explicit included admission rights, if any; the system does not assume inclusion.
5. Guests attend or check in using their own registration; the organiser pays the private-hire balance.
6. Receipts identify workshop, admission or private hire without treating artwork stock as part of this workflow.

### What the staff would experience

1. **Open the gallery workspace.** Review public sessions and private allocations on the shared calendar.
2. **Open POS → Admissions.** Validate exhibition or workshop access.
3. **Inspect bundled rights.** A workshop may include exhibition access only when explicitly configured.
4. **Switch to Booking collection.** Open the company's private-hire order and agreed extras.
5. **Collect the organiser's balance.** Keep individual visitor purchases separate.
6. **Review Workspace records.** Track room utilisation, attendance and distinct income categories.

### Difficult combination and resolution

- **Whole-gallery hire overlaps a room workshop.** Parent-space exclusivity must conflict with child-room allocations where they overlap physically; hiding one layout does not free the building.
- **Public capacity differs from workshop capacity.** Enforce building occupancy and session seats independently, accounting for shared attendance rather than blindly summing overlapping headcounts.
- **Private setup reduces public opening time.** Reserve setup/teardown before publishing public slots and handle affected bookings explicitly.

### Suggested workspace, POS and website preset

- **Workspace labels:** Experiences, or Spaces & Packages for hire-first operation · Clients & Guests · Instructors · Venues & Spaces.
- **POS layout/opening:** Classes & Admissions plus Booking collection; Today's Events.
- **Selling screen:** Visitor or organiser + admission/workshop/hire + valid access rights + amount due.
- **Website suggestion:** Exhibitions + workshops + venue gallery + Visit / Join a workshop / Request private hire.
- **Build boundary:** Artwork consignment, valuation and stock management are excluded; public occupancy rules need explicit modelling.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Art gallery + Art workshop studio + Event venue activity.

## 21. Wellness retreat organiser with multi-day classes and optional treatments
*A guest books a weekend retreat that includes group sessions and adds a private treatment without purchasing accommodation through Tulala.*

### Customer journey

1. The Website states exactly which sessions, meals or services the retreat package includes and what is arranged separately.
2. The guest registers for the dated retreat and chooses an available private treatment.
3. The treatment reserves the therapist and room without conflicting with that guest's required group session where attendance is mandatory.
4. The order records package and optional service charges with explicit deposits and cancellation terms.
5. The guest checks in for the retreat and individual activities using the appropriate entitlements.
6. A cancelled treatment is handled separately from the remaining retreat unless the package policy explicitly makes them dependent.

### What the staff would experience

1. **Open the retreat workspace.** Review the itinerary, participant registrations and therapist/resource schedules.
2. **Open POS → Today's Sessions.** Verify existing package access without selling each included class again.
3. **Switch to Appointments.** Open the optional treatment and its linked charge.
4. **Handle a requested change.** Check therapist/room availability and itinerary conflicts before confirming.
5. **Collect the outstanding amount.** Apply eligible payments once, with refund allocation for affected components.
6. **Return to Workspace.** Review component attendance and package obligations separately.

### Difficult combination and resolution

- **One purchase grants several dated rights.** Model package entitlements with explicit session bindings or allocation rules, including limits and expiry.
- **Guest availability matters as well as staff availability.** Warn or block overlapping mandatory activities according to the retreat policy; do not invent personal-calendar access.
- **Lodging is provided elsewhere.** Clearly distinguish externally arranged accommodation from Tulala-sold components; do not imply room guarantees or hotel-management support.

### Suggested workspace, POS and website preset

- **Workspace labels:** Retreats & Packages · Guests · Practitioners · Spaces & Seating.
- **POS layout/opening:** Classes & Admissions plus Appointments; Today's Sessions.
- **Selling screen:** Guest + retreat rights + selected optional treatment + component status + balance.
- **Website suggestion:** Itinerary + facilitators + inclusions/exclusions + treatment options + Reserve retreat.
- **Build boundary:** Multi-day bundles and entitlement allocation require implementation; hotel accommodation and clinical care systems are outside scope.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Wellness retreat organiser + group sessions and treatment activities.

## 22. Corporate training provider with consultations, conferences and private breakouts
*An employer buys a team workshop, employees book private coaching slots and outside guests purchase conference tickets.*

### Customer journey

1. The employer submits a brief and accepts an Offer for an agreed team workshop and coaching allowance.
2. Staff invite named employees or allocate places through the agreed registration process.
3. Each employee books a private slot with an available coach; the allowance controls eligibility and usage.
4. Public conference admission is sold separately unless the employer package explicitly includes it.
5. The employer pays the contracted amount; employees pay only for extras they explicitly agree to buy.
6. The employer receives the appropriate commercial/attendance summary while private coaching content remains restricted.

### What the staff would experience

1. **Open the training workspace.** Review the organisation's booking, sessions and coaches.
2. **Open POS → Sessions.** Check in participants with the correct company registration.
3. **Open private appointments.** Validate the remaining allowance and coach availability.
4. **Switch to Admissions.** Check public conference rights independently from workshop attendance.
5. **Use Booking collection for the employer.** Keep employee-paid extras in separate orders unless employer approval exists.
6. **Return to Workspace.** Review collection, allowance use and permitted attendance reporting.

### Difficult combination and resolution

- **Organisation, payer and participant are different entities.** Use explicit relationships; do not make every employee the debtor for the corporate order.
- **A package grants a limited coaching allowance.** Allocate credits atomically, define cancellation/release rules, and prevent concurrent bookings from consuming the same last allowance.
- **Employer reporting could expose private conversations.** Separate attendance/financial permissions from coaching notes and messages.

### Suggested workspace, POS and website preset

- **Workspace labels:** Workshops & Packages · Clients · Instructors · Meeting Rooms.
- **POS layout/opening:** Classes & Admissions plus Booking collection; Today's Sessions.
- **Selling screen:** Company or individual payer + participant + package eligibility + session/extra + balance.
- **Website suggestion:** Corporate packages + coaches + conference events + Request training / Get tickets.
- **Build boundary:** Organisation accounts, allowance ledgers and confidential coaching access need explicit support; labels alone cannot supply them.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Corporate training provider + Business consultant with Events enabled.

## 23. Floral design studio with wedding commissions and public workshops
*A couple commissions wedding flowers and books a private group workshop for friends before the wedding.*

### Customer journey

1. The couple explores portfolios and sends an Inquiry describing the wedding and optional workshop.
2. The studio sends a proposal with distinct design-service and workshop components, dates and payment terms.
3. Acceptance creates the wedding Booking and a separately scheduled workshop with facilitator and space allocation.
4. Friends register as participants under the organiser's paid group allocation, or buy their own places if that is the selected arrangement.
5. An additional design consultation uses Appointments and the existing project context.
6. Payments and confirmations preserve each component and payer without treating workshop attendance as wedding delivery completion.

### What the staff would experience

1. **Open the floral workspace.** Review the wedding brief, approved proposal and workshop session.
2. **Open POS → Booking collection.** Select the couple's existing order and deposit.
3. **Switch to Classes & Admissions on workshop day.** Check in guests under the correct group allocation.
4. **Record agreed extras.** Obtain approval and recheck staff/time requirements where the scope changes.
5. **Collect the appropriate balance.** Guest-paid extras stay separate from the couple's agreed bill.
6. **Return to Workspace.** Track consultation, workshop attendance and wedding-service completion independently.

### Difficult combination and resolution

- **The same designer teaches and delivers the wedding service.** Reserve setup/travel/service time to prevent overlapping assignments.
- **A private workshop replaces public availability.** Allocate the whole session or space according to the actual exclusivity rule; do not continue selling public places into it.
- **Wedding cancellation affects a workshop already delivered.** Apply component-specific cancellation/refund terms and retain completed service history.

### Suggested workspace, POS and website preset

- **Workspace labels:** Packages & Services · Clients · Creative Team · Studios & Rooms.
- **POS layout/opening:** Booking collection plus Classes & Admissions; Today's Bookings.
- **Selling screen:** Couple or guest payer + selected project/session + agreed extras + deposit + balance.
- **Website suggestion:** Wedding portfolio + consultations + workshops + Request wedding design / Join a workshop.
- **Build boundary:** Material procurement and floral stock are excluded; delivery/project milestones require separate support where needed.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Floral design studio + workshop activity.

## 24. Escape room with birthday packages, party rooms and catering
*A parent books an escape game and party room for a birthday, with food served after the game.*

### Customer journey

1. The Website presents the package with game duration, party-room time, participant limit and included food.
2. The parent selects a start time; the system checks the game room, host and following party-room interval together.
3. The booking records the responsible payer and participant count without requiring every child to become a purchasing customer.
4. A deposit or full payment follows the agreed package policy.
5. Staff check in the group; food extras requested on site attach only to the approved payer's order.
6. The parent receives a clear bill; game completion, room use and food preparation retain their own statuses.

### What the staff would experience

1. **Open the escape-room workspace.** Review game slots, party-room allocations and host assignments.
2. **Open POS → Today.** Select the birthday booking and verify the responsible adult and headcount.
3. **Mark the group arrived.** Confirm the game's access without reselling the prepaid package.
4. **Send the relevant food items to preparation.** Timing follows the scheduled party interval, not simply the payment timestamp.
5. **Charge approved extras and any remaining balance.** Keep a guest's separate purchase distinct unless the organiser agrees to cover it.
6. **Return to Workspace.** Complete the appropriate activity and preserve reset/cleanup blocks before the next booking.

### Difficult combination and resolution

- **The resources are required sequentially rather than simultaneously.** Hold a linked itinerary: game interval, reset buffer and party-room interval with its cleanup. Validate the whole sequence before guaranteeing the package.
- **Late arrival could delay the next group.** Apply an explicit late-arrival policy; do not extend every downstream interval automatically.
- **Headcount changes affect several limits.** Validate game capacity, party-room occupancy and price rules together before accepting the change.

### Suggested workspace, POS and website preset

- **Workspace labels:** Experiences, or Packages & Services for package-first operation · Guests · Professionals · Rooms.
- **POS layout/opening:** Classes & Admissions plus Booking collection and optional Counter; Today.
- **Selling screen:** Responsible payer + package itinerary + group count + food/extras + deposit + balance.
- **Website suggestion:** Games + birthday packages + party-room gallery + Choose a time / Request a party.
- **Build boundary:** Sequential bundle scheduling and host/reset dependencies require implementation. Catering integration does not add inventory.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Escape room + Event venue and food-service activities.

## Hybrid implementation rules and acceptance checks

| Shared problem | Build rule | Acceptance example |
|---|---|---|
| Multiple resources | Coordinate required allocations with expiring holds and conflict-safe confirmation | Last coach/room cannot be confirmed for two customers concurrently |
| Sequential services | Represent start/end offsets and buffers for every component | A free game slot cannot sell a birthday package if the later party room is occupied |
| Shared or nested spaces | Model exclusive/incompatible use across parent spaces and layouts | Whole-gallery hire blocks conflicting room workshops |
| Package rights | Store explicit included quantities, dates, recipients and consumption/release rules | A retreat guest checks into an included class without a second charge |
| Payer versus participant | Link organisations, customers and recipients explicitly | Employer pays while employee attendance does not expose coaching notes |
| Multiple sellers | Preserve seller/account ownership and supported settlement boundaries | A creator's ticket proceeds never silently become studio revenue |
| Partial changes | Revalidate affected dependencies and apply component-specific terms | Weather moves the boat trip without erasing the completed lesson |
| Capacity types | Keep session seats, physical occupancy and resource time distinct | Two pets with one handler follow pet capacity and person occupancy rules |
| Financial reporting | Preserve charge allocation and deduplicate linked financial records | One package payment appears once even when it covers three activities |
| POS switching | Keep the active order, payer and payment attempt intact across task changes | Switching to Admissions cannot attach a guest ticket to the organiser's pending bill |

Release gate for every hybrid: demonstrate the normal journey, last-place concurrency, partial cancellation/rescheduling, correct payer and seller, deposit/balance handling, role boundaries and record recovery after an interrupted action. If an extension is missing, offer a clearly limited workflow or keep that combination unavailable; never describe it as solved solely because its labels exist.


## Additional business cases: cases 25–28

These four cases extend the shared workspace and POS design. The personal names are user-provided examples; operational details below are proposed scenarios, not verified facts about those businesses. Continue to use **Business-specific-labels-Workspace-Theme.md** for the complete vocabulary and business-type directory. A new scenario does not automatically create a new taxonomy ID or imply a capability is already built.

## 25. Sushi restaurant with dine-in and takeaway
*A restaurant serves tables while accepting scheduled pickup orders from its website and walk-in counter.*

### Customer journey

1. A guest chooses **Dine in** or **Order for pickup** on the Website. Table reservation and takeaway ordering are separate entry points.
2. Dine-in guests reserve a table; takeaway customers select available menu items, allowed modifiers and a pickup slot.
3. Checkout identifies the fulfilment method, location, promised pickup time and applicable charges before confirmation.
4. The shared preparation queue receives clearly labelled table and pickup items, with item-specific station routing where configured.
5. A takeaway customer receives a ready notification and verifies the pickup reference; a seated guest settles the table check.
6. Sales and Payments retain channel, fulfilment method and payment history without treating pickup as a table reservation.

### What the staff would experience

1. **Open the restaurant workspace.** Configure one Menu with explicit channel visibility and pickup ordering windows.
2. **Open POS → Tables & Open Orders.** Table checks and pickup orders are identifiable by fulfilment type.
3. **Open a pickup order.** Confirm the promised time and payment state; do not create another sale from the website order.
4. **Send preparation items to the appropriate station.** Coordinate sushi and other preparation components before marking the whole order ready.
5. **Mark handoff or collect the outstanding balance.** Already-paid pickup customers receive their order without a second charge.
6. **Return to Workspace.** Review table service, pickup demand and preparation delays separately.

### Difficult combination and resolution

- **Pickup demand competes with tables for kitchen time.** Use explicit preparation-slot limits or a manually controlled order pause. This is workload capacity, not ingredient inventory. Never infer unlimited pickup capacity from free tables.
- **One menu serves several channels.** Retain shared offering IDs with channel-specific visibility, allowed modifiers and explicitly configured prices where needed. Do not silently change a dine-in item's price at pickup checkout.
- **An order contains items completed at different stations.** Track item preparation and order readiness separately. Payment approval is not proof the food is ready.
- **Pickup cancellation occurs after preparation starts.** Apply the published cancellation/refund policy and staff permissions; do not erase preparation history or auto-refund solely from a status toggle.

### Suggested workspace, POS and website preset

- **Workspace labels:** Menu · Guests · Professionals (optional) · Tables & Spaces.
- **POS layout/opening:** Table service + Counter; Open Orders supports Dine-in / Pickup filters.
- **Selling screen:** Table or pickup context + menu/modifiers + preparation state + pickup time where relevant + balance.
- **Website suggestion:** Menu + pickup checkout + location/hours + table reservations + Order for pickup / Reserve a table.
- **Build boundary:** Pickup promises, workload limits and handoff notifications require implementation verification. No delivery fleet, ingredient inventory or automatic food-safety certification is implied.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Restaurant + Takeaway kitchen. Sushi restaurant can be a reviewed type/alias extension.

## 26. Jesus: frozen pizza sold from home for takeaway
*Jesus lists frozen pizzas online and hands over prepaid or pay-at-pickup orders during agreed collection windows.*

### Customer journey

1. The customer visits Jesus's branded page, browses pizzas and reads the pickup instructions supplied by the business.
2. They choose variants and quantities, then an available collection window.
3. Checkout clearly states that the order is for frozen pizza pickup, identifies the seller and presents configured payment options.
4. The customer receives a confirmation and pickup reference; home-address details follow the business's deliberate public/private disclosure setting.
5. At pickup, Jesus verifies the reference and either hands over a paid order or collects the remaining balance.
6. The customer receives a receipt and can reorder from the same catalog.

### What Jesus would experience

1. **Open the business workspace.** Maintain the Menu, collection windows and item availability; Roster and table management can remain hidden.
2. **Open POS → Open Orders.** View website pickups without re-entering them.
3. **Prepare the handoff.** Mark the order ready only when it is actually available for collection.
4. **Start New Sale for a walk-in buyer.** Select the same pizza offerings and agreed quantities.
5. **Charge only an unpaid balance.** Use the configured supported terminal or record cash; no terminal is required for prepaid orders.
6. **Mark collected and return to Workspace.** Payment and collection remain separate statuses.

### Difficult combination and resolution

- **No inventory is requested, but supply is finite.** Offer manual Available / Unavailable controls and explicit per-window order limits if supported. These are selling controls; they do not calculate remaining freezer stock. Jesus must manage sellability manually unless a separate future stock system is commissioned.
- **A home address is sensitive.** Separate service-area discovery from pickup-address display. Preview what appears publicly and in confirmed-order messages; do not expose the address merely because a website template has a map section.
- **Customers miss pickup.** Keep an uncollected paid order visible and apply an explicit pickup/rescheduling policy. Do not mark it fulfilled because payment succeeded.

### Suggested workspace, POS and website preset

- **Workspace labels:** Menu · Customers · Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Counter; scheduled pickup orders in Open Orders.
- **Selling screen:** Customer or walk-in + pizza variants/quantities + pickup context + paid amount + balance.
- **Website suggestion:** Pizza menu + collection windows + pickup instructions + Order for pickup.
- **Build boundary:** This is a business storefront, optionally linked to Jesus's Talent Profile. Home-based status does not decide business eligibility, local requirements or payment eligibility automatically. No table reservation or Kitchen screen is required for a simple frozen-product handoff.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Pizzeria + Takeaway kitchen; a home-based fulfilment setting supplies the operating context.

## 27. Laura: social media agency for local businesses
*A local business hires Laura's agency for content design, social account management and paid-media services.*

### Customer journey

1. The client explores case studies and service packages on Laura's Website, then submits a brief with goals, channels and requested scope.
2. Laura discusses requirements in Inbox and sends an Offer defining deliverables, review rounds, service period and agency fees.
3. Acceptance creates a Booking/engagement with designers, content professionals and campaign responsibilities assigned where needed.
4. The client pays the agreed agency deposit or service fee through supported online collection.
5. Content approvals and scope changes stay connected to the engagement through the supported files/messages workflow; a dedicated approval portal is a separate extension.
6. The client reviews charges and agreed outcomes without confusing agency income with money spent on advertising platforms.

### What Laura's team would experience

1. **Open the agency workspace → Inbox.** Qualify the brief and identify the client organisation and payer.
2. **Prepare the Offer.** Separate content/design, management and paid-media service fees from any advertising budget arrangement.
3. **Open Sales → Bookings after acceptance.** Assign professionals and schedule shoots, consultations or reporting meetings.
4. **Track agreed work and changes.** Use connected messages/files; do not describe Calendar as a complete social publishing or project-management system.
5. **Collect service fees online.** Optional Booking collection POS handles an office payment against the same order.
6. **Review client history and Payments.** Preserve commissions and contractor obligations separately from payment execution.

### Difficult combination and resolution

- **Agency fees and ad spend are different.** The default proposal has the client pay advertising platforms directly while Tulala records Laura's service charges. If the agency funds campaigns, reimbursements/client funds need a separately designed accounting and approval workflow; do not automatically recognise the whole budget as agency service revenue.
- **Monthly management is recurring work.** Explicitly scope dates, renewal and billing. A repeated Calendar event does not create a subscription contract or permission to charge a saved payment method.
- **A client wants multiple brands and approvers.** Store the organisation, brand and authorised decision-maker relationships; approval rights do not automatically grant agency Team access.
- **Social platform access is required.** Account authorisation, publishing, ads APIs and channel analytics are separate integrations. A social-media business label does not enable them.

### Suggested workspace, POS and website preset

- **Workspace labels:** Services & Packages · Clients · Creative Team · Spaces & Seating (hidden unless used).
- **POS layout/opening:** Optional Booking collection; the normal Workspace landing is Inbox or Sales → Bookings.
- **Selling screen:** Client/engagement + agreed service fees + approved extras + deposit + outstanding balance; no ad-platform controls.
- **Website suggestion:** Portfolio/case studies + packages + industries served + brief form + Request a proposal.
- **Build boundary:** Recurring billing, task/milestone delivery, approval portals, social publishing and ad-spend accounting require explicit capability validation.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Content production studio + Branding agency; Social media agency is a proposed searchable taxonomy extension, not an existing claim.

## 28. Eyelash business with five workers
*A client books a lash treatment with any available specialist while the business coordinates five workers and a limited number of treatment stations.*

### Customer journey

1. The Website presents services, durations and the five specialists' permitted public profiles.
2. The client chooses a specialist or Any available specialist and an offered appointment time.
3. Appointments checks the worker's relevant service capability, working time and required station together.
4. The confirmed appointment identifies the assignment or explains the assignment policy; the client pays any configured deposit.
5. Staff confirm agreed extras or changes, complete the service and collect the outstanding balance.
6. The client receives a receipt and can rebook with the same specialist or choose another available worker.

### What the staff would experience

1. **Open the lash workspace.** Configure five roster relationships, actual availability and actual stations; five workers does not imply five stations.
2. **Open POS → Today's Appointments.** Reception sees only the appointments and customer details permitted for its role.
3. **Select the client.** Confirm specialist, station, service and deposit before adding anything.
4. **Handle a requested reassignment.** Check the replacement's eligibility and time, preserve the booking history, and communicate relevant changes.
5. **Charge the balance.** Attribute service work to the assigned specialist independently from the cashier collecting payment.
6. **Review Sales and Analytics.** Managers see service attribution and supported commission obligations without treating those reports as payroll.

### Difficult combination and resolution

- **Five workers share fewer stations.** Resource and worker availability must be reserved together. A free worker alone does not make a time slot available.
- **Any available selection receives concurrent requests.** Assign or hold a valid worker/station pair atomically; do not confirm both clients against the same last pair.
- **A worker is absent.** Offer explicit reassignment or rescheduling. Do not silently move the client to an unqualified or unavailable worker.
- **Workers need different access.** Roster represents assignable professionals; Team represents login permissions. A specialist may see only assigned clients while the manager sees the full schedule.

### Suggested workspace, POS and website preset

- **Workspace labels:** Services · Clients · Lash Artists · Stations.
- **POS layout/opening:** Appointments; Today's Appointments, filterable by specialist.
- **Selling screen:** Selected client + specialist/station + treatment/extras + deposit + balance.
- **Website suggestion:** Services + five specialist profiles + gallery + Book appointment / Any available specialist.
- **Build boundary:** Skill-based assignment, concurrency and reassignment need validation. Commission attribution does not automatically provide payroll or provider-supported payouts.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Lash studio; five workers is an operating setting, not a separate business type.

## Talent Profile cases: cases 29–48

These twenty cases cover the eight requested examples, including Zvika, plus twelve additional professional types. A Talent Profile is the public identity and discovery surface. It can present services, portfolios and availability and link to a seller's supported booking/checkout flow. The professional uses their authorised management area for inquiries, offers, scheduling and Sales; the public profile is not itself a POS or a separate merchant account.

Some talents work independently, some operate a branded business, and some are assigned through another workspace. Record the responsible seller, business relationship and payment account for each engagement. Opening a Talent Profile never authorises collection for another business. Preserve shared availability while protecting private customer and commercial information. A solo professional can hide Roster navigation; Team remains access control. Do not force an agency plan, new business workspace or terminal purchase from a profession selection alone.

For each case below, the “operator” is the talent or an authorised assistant. POS is optional and only useful for supported in-person collection. Online consultations, proposals and prepaid work can be managed without entering POS. Availability holds, original-provider refunds, deposit accounting and tenant isolation follow the same rules as the business cases.

Each full-preset reference points to **Business-specific-labels-Workspace-Theme.md**. Where a profession is not in its original 120 entries, use a reviewed Other business/professional preset until the taxonomy is deliberately extended. Proposed labels below do not silently alter that companion directory.


## 29. Alejandra: immigration solutions
*A client requests an initial consultation and then accepts an explicitly scoped immigration-support engagement.*

### Customer journey

1. Discover Alejandra through her Talent Profile and read the stated scope of her services.
2. Book a consultation or send an Inquiry containing only information needed for initial triage.
3. Discuss requirements and receive an Offer with deliverables, exclusions, fees and service dates.
4. Accept the engagement and pay the agreed service deposit through the supported seller flow.
5. Provide requested documents through an appropriately restricted channel and follow agreed progress updates.
6. Pay the approved balance and receive the service record without a promise of an immigration outcome.

### What the talent or authorised operator would experience

1. Open Inbox and check the client request and appropriate service scope.
2. Schedule the consultation and identify the responsible seller and payer.
3. Send a scoped Offer; acceptance creates the linked Booking and charges.
4. Manage authorised document access and agreed updates; do not treat payment status as case progress.
5. Collect service fees online or through optional office POS against the existing order.
6. Review the engagement, outstanding work and payment history separately.

### Difficult combination and resolution

- Government fees and professional fees require separate identification; do not automatically collect or recognise government charges as service income.
- Document permissions and retention require explicit design; identity documents should not become public profile media.
- Case-management, filing and eligibility/legal-advice functions are not supplied by an appointment preset. This scenario describes administration and commerce, not legal guidance or verified professional credentials.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Professionals (optional) · Service Locations.
- **POS layout/opening:** Booking collection, optional; Today’s Consultations when appointments are offered.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Professional background + accurately described services + consultation booking + Send inquiry. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Professional services family; Immigration support is a proposed reviewed type extension.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 30. Tania: massage therapist
*Tania receives a private client request while also accepting assignments from a spa.*

### Customer journey

1. Find Tania’s Talent Profile and select a treatment or request a mobile visit.
2. Choose a time that respects existing private and spa assignments.
3. Confirm location, duration and the seller responsible for this visit.
4. Pay any agreed deposit against the confirmed service order.
5. Receive the treatment and approve any service or duration change before it is added.
6. Pay the outstanding balance and rebook through the same profile.

### What the talent or authorised operator would experience

1. Review the request in the appropriate private-practice or spa management context.
2. Check shared availability, travel time and any required treatment room.
3. Confirm the appointment or send an Offer for custom work.
4. Open the existing visit in optional POS and review the recorded deposit.
5. Collect only the balance through the correct seller’s supported payment method.
6. Record completion and retain private client information within its authorised context.

### Difficult combination and resolution

- Shared availability should reveal busy time without exposing private customer details to the spa.
- Travel buffers must block otherwise misleading adjacent slots.
- Commission obligations and actual payouts are separate; a private payment must not route to the spa automatically.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Clients · Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Appointments, optional; Today’s Appointments.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Treatments + availability + service areas + Book appointment / Request a visit. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Independent massage therapist + Mobile massage service.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 31. Chris: private chef
*A family hires Chris for a dinner and optionally adds a cooking lesson for guests.*

### Customer journey

1. Browse Chris’s profile, menus and event examples.
2. Send a brief with date, location, guest count and dietary requirements.
3. Review an Offer for the dinner and any separately described lesson.
4. Accept and pay the agreed deposit; receive the booking details.
5. Approve changes to headcount, menu or duration before the event.
6. Pay the remaining agreed amount and receive a receipt for delivered services.

### What the talent or authorised operator would experience

1. Review the brief and actual kitchen/location constraints.
2. Reserve preparation, travel and service time and any assistants.
3. Send the menu Offer with explicit inclusions and guest limits.
4. Open the accepted Booking and record approved amendments.
5. Use optional POS to collect the final balance at the dinner.
6. Complete the service and review charges without duplicating included guest meals.

### Difficult combination and resolution

- A dinner and optional lesson must fit the same real time/resource schedule.
- Ingredient procurement is not an inventory feature here; include agreed costs transparently in the service offer.
- A lesson included for dinner guests must not sell public places into a private event.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Menus & Services · Clients · Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Booking collection; optional Classes & Admissions for public lessons.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Sample menus + chef profile + private dining + Request a dinner. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Private chef + Cooking school activity.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 32. Independent house cleaner
*A homeowner requests a first deep clean and later asks for regular visits.*

### Customer journey

1. Discover the cleaner’s profile and check the service area.
2. Describe the property, requested work and preferred date in an Inquiry.
3. Accept a quote defining scope, estimated duration and access arrangements.
4. Confirm the visit and any deposit without publishing the home address.
5. Approve additional work or a time extension when needed.
6. Pay the agreed balance and explicitly request future visits if desired.

### What the talent or authorised operator would experience

1. Review scope, location and access needs.
2. Check service duration plus travel before confirming.
3. Send the Offer and link the accepted Booking to the customer.
4. Record arrival and approved additional work without sharing access details broadly.
5. Collect through supported online payment, optional POS or recorded cash.
6. Complete the visit; configure repeat work only under an explicit recurring arrangement.

### Difficult combination and resolution

- A repeating calendar reminder is not permission for recurring billing.
- Keys, entry codes and addresses need restricted handling and are never portfolio material.
- Routing, recurring contracts and crew dispatch are extensions beyond a simple appointment.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Customers · Service Professionals (optional) · Service Locations.
- **POS layout/opening:** Appointments or Booking collection, optional; Today’s Visits as a proposed scoped view label.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Cleaning services + service area + request form + Request a clean. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Home cleaning service.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 33. Fabian: handyman
*A customer books an inspection and then accepts a quote for repairs requiring more than one visit.*

### Customer journey

1. Find Fabian’s profile and submit the problem with relevant photos.
2. Book an inspection if the work cannot be priced from the brief.
3. Receive a quote separating inspection charges, labour and agreed materials.
4. Accept the work and confirm scheduled visits and deposit.
5. Approve any revised scope before additional work is performed.
6. Pay the final balance and review the recorded completion details.

### What the talent or authorised operator would experience

1. Triage the request and determine whether an inspection is needed.
2. Schedule the inspection with travel time and location context.
3. Send a repair Offer with visit requirements and price breakdown.
4. Record approved changes and link all visits to the engagement.
5. Use optional POS for an agreed milestone or final collection.
6. Close the relevant service steps while preserving unpaid obligations where present.

### Difficult combination and resolution

- If an inspection fee is credited to the repair, apply that eligible credit once under the agreed terms.
- Multiple visits need distinct time allocations; paying a deposit must not mark all visits completed.
- Material charges do not introduce stock tracking; procurement, warranties and complex project management need separate scope.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Customers · Service Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Booking collection, optional; Today’s Bookings.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Service categories + service areas + work examples + Request an estimate. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Handyman service.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 34. Evy Solutions: provisional service profile
*Evy receives a service request and prepares a custom proposal. The actual service category has not yet been supplied.*

### Customer journey

1. Visit Evy’s profile and read only verified service information.
2. Submit an Inquiry describing the desired outcome.
3. Discuss scope and receive a proposal defining the actual deliverables.
4. Accept the proposal and any agreed schedule or deposit.
5. Receive updates and approve changes through the supported conversation flow.
6. Pay the agreed balance and retain the engagement record.

### What the talent or authorised operator would experience

1. Review the request without automatically classifying its industry.
2. Clarify the service, responsible seller and whether scheduling/resources are needed.
3. Send an Offer and create a Booking after acceptance.
4. Enable only the modules required for that verified service.
5. Collect online or use optional Booking collection against the same charges.
6. Update the business-type preset once the actual service category is known.

### Difficult combination and resolution

- Do not infer that Evy provides immigration, cleaning, agency or any other specific work from the word Solutions.
- If Evy Solutions is a brand rather than an individual, use a business storefront linked to the relevant talent identity.
- This is a placeholder workflow, not a validated industry case; specialised policies remain deliberately unspecified.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Professionals (optional) · Service Locations (optional).
- **POS layout/opening:** Booking collection only if in-person payment is useful; otherwise no POS.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Approved service description + introduction + inquiry form; no invented specialisms or credentials. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Other business / generic professional preset until Evy’s services are defined.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 35. Idan: private tours
*A family commissions a private tour while Idan also offers dated small-group departures.*

### Customer journey

1. Explore Idan’s profile and choose a public departure or private request.
2. For a private tour, submit dates, group size and preferences.
3. Accept the itinerary, inclusions and price after availability is checked.
4. Pay the agreed amount and receive meeting instructions.
5. Check in for the correct group or private engagement.
6. Approve any extras, settle the balance and review the experience.

### What the talent or authorised operator would experience

1. Review private briefs and existing public departures together.
2. Block guiding and travel time before confirming a private tour.
3. Issue the Offer or open the dated session registration.
4. Use the attendee list to verify guests without charging paid participants again.
5. Collect an authorised balance through the supported seller flow.
6. Handle cancellations or weather changes against the applicable booking policy.

### Difficult combination and resolution

- Private exclusivity blocks conflicting public guiding commitments; guest capacity alone is insufficient.
- Meeting points are addresses, not automatic vehicle or venue reservations.
- Transport, third-party tickets and cross-seller settlement must be explicitly included or excluded; a tour preset does not supply those integrations.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Experiences · Guests · Guides (hidden when solo) · Meeting Points.
- **POS layout/opening:** Booking collection + Classes & Admissions when group departures are offered; Today’s Sessions.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Tour experiences + guide profile + meeting information + Request private tour / Choose departure. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Local tour guide + Tour operator.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 36. Zvika: custom jewelry
*A client commissions a custom piece, approves a design and pays in stages before collection or separately arranged delivery.*

### Customer journey

1. Browse Zvika’s portfolio and submit an Inquiry with design references and requirements.
2. Book a consultation or fitting where needed.
3. Approve the design and quote, including specifications, price, revision terms and expected timing.
4. Pay the agreed deposit; the accepted commission becomes a Booking with linked charges.
5. Review progress or revisions through the agreed approval process; approve price changes explicitly.
6. Pay the remaining balance and receive the piece with a recorded handover or separately supported delivery status.

### What the talent or authorised operator would experience

1. Review the brief and distinguish custom work from any ready-made item sale.
2. Schedule consultation/fitting and prepare the design Offer.
3. Record the approved design version and deposit against the commission.
4. Track proposed production milestones without presenting payment status as manufacturing progress.
5. Open optional POS at handover and collect only the balance due.
6. Record delivery/collection and any agreed follow-up without deleting revision history.

### Difficult combination and resolution

- An approved design change requires a versioned agreement and explicit price/timing adjustment; never overwrite the original approval silently.
- Production milestones, material sourcing and shipping integrations require separate support. No metals/gemstone inventory is included.
- Commission cancellation, deposits, returns and remake terms must be explicitly configured and appropriately reviewed; do not assume ordinary appointment rules fit custom goods.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Artists (hidden when solo) · Service Locations (optional).
- **POS layout/opening:** Booking collection, optional; Accepted Bookings.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Portfolio + commission process + consultation request + Commission a piece. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Generic creative/professional preset; Custom jewelry designer is a proposed taxonomy extension.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 37. Independent portrait photographer
*A client books a headshot and later requests an extended team shoot.*

### Customer journey

1. Browse the Talent Profile portfolio and choose a headshot package.
2. Select an available time and confirmed location.
3. Pay the configured deposit against the appointment order.
4. Request a team extension through a revised brief rather than adding unbounded guests.
5. Approve a new scope and schedule if the photographer can accommodate it.
6. Receive the service and pay the remaining agreed charge.

### What the talent or authorised operator would experience

1. Review the package appointment.
2. Check location, travel and any studio allocation.
3. Confirm the booking and recorded deposit.
4. Requote team work and recheck time before accepting it.
5. Collect the balance through online payment or optional POS.
6. Track delivery commitments separately from the completed shoot.

### Difficult combination and resolution

- Shoot completion does not prove edited images were delivered.
- Gallery delivery, image licensing and revision approval need explicit workflows; portfolio media is not automatically a private delivery portal.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Packages & Services · Clients · Creative Team (hidden when solo) · Studios & Sets (optional).
- **POS layout/opening:** Appointments or Booking collection, optional; Today’s Shoots as a scoped view.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Portfolio + headshot packages + custom brief + Book a shoot. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Independent photographer.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 38. Independent DJ
*A DJ accepts a private party booking while selling admission to a separate self-organised event.*

### Customer journey

1. Explore the DJ’s profile and submit a private-event brief.
2. Receive a proposal for date, duration, location and agreed services.
3. Accept the offer and pay the deposit.
4. Confirm schedule and approved extras before the event.
5. Purchase separate public-event tickets only if desired.
6. Settle the private booking balance independently from ticket purchases.

### What the talent or authorised operator would experience

1. Review private requests alongside public event commitments.
2. Reserve performance, travel and setup time.
3. Send the private Offer and confirm its seller.
4. Open the accepted booking for office/on-site collection if needed.
5. Use Admissions only for events the DJ is authorised to sell.
6. Review performer fees and event receipts separately.

### Difficult combination and resolution

- Public event revenue and a promoter-paid performance fee have different commercial records.
- Travel/setup must block overlapping bookings; ticket capacity cannot establish performer availability.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients & Guests · Artists (hidden when solo) · Service Locations.
- **POS layout/opening:** Booking collection; Classes & Admissions only for the DJ’s own ticketed events.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Sets/portfolio + packages + public events + Request a DJ / Get tickets. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → DJ.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 39. Private language tutor
*A learner books one lesson and later joins a small-group workshop.*

### Customer journey

1. Find the tutor’s profile and choose a language/lesson format.
2. Select a private appointment or dated group workshop.
3. Confirm the learner and payer if they are different people.
4. Pay the applicable lesson or session fee.
5. Attend the confirmed online or physical session.
6. Rebook or purchase another session explicitly.

### What the talent or authorised operator would experience

1. Review the requested format and time zone.
2. Check private and group commitments against one schedule.
3. Confirm the lesson and supported meeting/location details.
4. Mark attendance without creating another charge.
5. Collect any outstanding fee through the existing order.
6. Arrange future lessons only under an explicit booking or package policy.

### Difficult combination and resolution

- A parent paying for a learner needs a payer/participant relationship, not duplicate customer identities.
- Courses, lesson-credit packages and video links need their own supported implementation; labels alone do not create them.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Courses & Lessons · Learners · Instructors (hidden when solo) · Service Locations.
- **POS layout/opening:** Usually unnecessary; Appointments or Classes & Admissions for in-person collection.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Languages/lesson formats + availability + Book a lesson / Join a workshop. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Private tutor + Language school activity.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 40. Independent personal trainer
*A client books private training and occasionally joins the trainer’s outdoor group class.*

### Customer journey

1. Explore services and select private or group training.
2. Choose a time and confirmed location.
3. Confirm the participant and agreed service scope.
4. Pay the configured session fee or deposit.
5. Attend the booked session and approve any extension.
6. Receive a receipt and arrange the next session.

### What the talent or authorised operator would experience

1. Review individual and group requests.
2. Check training time, travel and any permitted facility allocation.
3. Confirm the appointment or group registration.
4. Check attendance against the correct record.
5. Collect an outstanding balance only if one exists.
6. Review client history with restricted personal notes.

### Difficult combination and resolution

- A class place does not grant gym membership or access to a third-party facility.
- Training plans, health tracking and recurring credits are separate scope; shared scheduling prevents private/group overlap.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Classes & Services · Clients · Instructors (hidden when solo) · Service Locations.
- **POS layout/opening:** Appointments + Classes & Admissions, optional; Today.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Training formats + availability + group schedule + Book training. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Personal trainer.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 41. Freelance makeup artist
*A bride books a trial and wedding-day makeup for several people.*

### Customer journey

1. Browse the artist’s Talent Profile and request a bridal package.
2. Book the trial and describe wedding-day timing and party size.
3. Approve an Offer defining the two dates and any assistant services.
4. Pay the agreed deposit or separate trial charge.
5. Confirm changes to the party size before the wedding.
6. Pay the remaining approved balance and receive the service record.

### What the talent or authorised operator would experience

1. Review both dates and the requested lineup.
2. Allocate artist, assistants and travel/setup time.
3. Send the Offer with explicit trial-credit rules if any.
4. Record trial completion independently from wedding fulfilment.
5. Collect the wedding balance through the correct order.
6. Review assignments and any assistant payment obligations.

### Difficult combination and resolution

- A trial payment is credited only if the contract explicitly provides it.
- Group size affects staffing and time; adding a person requires a fresh allocation check.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Makeup Artists (optional) · Service Locations.
- **POS layout/opening:** Appointments plus Booking collection, optional; Today’s Appointments.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Portfolio + bridal packages + trial appointments + Request bridal makeup. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Makeup artist + Bridal beauty team.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 42. Freelance translator
*A client commissions a document translation and a later revision.*

### Customer journey

1. Find the translator’s profile and submit an initial request.
2. Provide the document through an appropriately restricted channel.
3. Approve a quote with language pair, scope, deadline and revision terms.
4. Pay the agreed amount through the supported online flow.
5. Review the delivered work through the agreed process.
6. Approve extra revisions and pay additional charges only when agreed.

### What the talent or authorised operator would experience

1. Review scope and access restrictions.
2. Assess the deadline and committed workload.
3. Send the Offer with clear deliverables.
4. Track delivery and approved revisions separately from payment.
5. Collect the balance against the original or approved additional charges.
6. Retain files according to the explicit access/retention policy.

### Difficult combination and resolution

- Word count and revision pricing must be agreed rather than inferred from an appointment duration.
- Secure document delivery, certification and detailed production workflows are not supplied automatically by the preset.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Clients · Professionals (hidden when solo) · Service Locations (usually hidden).
- **POS layout/opening:** Usually unnecessary; optional Booking collection for an office visit.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Languages + accurately described specialisms + secure inquiry + Request a quote. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Translator.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 43. Independent dog walker
*An owner books a walk and asks to join a future small-group walk.*

### Customer journey

1. View the walker’s profile and service area.
2. Identify the pet and authorised owner/handler.
3. Request a private or group walk with the relevant location.
4. Confirm the time, service terms and payment.
5. Approve any change of date or group arrangement.
6. Receive completion confirmation and pay any agreed balance.

### What the talent or authorised operator would experience

1. Review pet/handler and location details.
2. Check travel and group-capacity requirements.
3. Confirm the appointment or group allocation.
4. Record the actual handoff and service completion.
5. Collect only an outstanding charge.
6. Manage future requests without assuming recurring billing authority.

### Difficult combination and resolution

- Pet count, people and handler capacity require explicit limits.
- Key handling, pet profiles, multi-day care and route tracking require separate support; a public profile must not expose a customer address.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Customers · Service Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Usually unnecessary; optional Appointments collection.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Walk options + service area + inquiry + Request a walk. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Generic local-service preset; Dog walker is a proposed taxonomy extension.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 44. Independent yoga instructor
*An instructor offers private online sessions and guest-teaches paid studio classes.*

### Customer journey

1. Discover the instructor and choose a private session or an authorised studio class.
2. Review the seller, location or online format.
3. Select an available date.
4. Pay through the correct private or studio booking flow.
5. Attend using the corresponding registration.
6. Rebook without creating a duplicate identity or payment.

### What the talent or authorised operator would experience

1. Review personal and studio assignments together.
2. Share busy time while preserving private client information.
3. Confirm private appointments or authorised studio participation.
4. Check in an existing attendee only within the operator’s permissions.
5. Collect privately only for work owned by the private seller.
6. Review service and payment records in their respective workspaces.

### Difficult combination and resolution

- Instructor identity can be shared while customer data and seller accounts remain separate.
- A profile listing must not resell studio places without an authorised connection to the studio’s capacity and checkout.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Classes & Services · Customers · Instructors (hidden when solo) · Service Locations.
- **POS layout/opening:** Optional Classes & Admissions or Appointments; Today’s Sessions.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Instructor profile + private sessions + authorised public classes + Book / Join. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Yoga studio with solo context.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 45. Voice-over artist
*A business commissions a recording and later requests another usage version.*

### Customer journey

1. Listen to approved samples on the profile.
2. Submit a script brief with length, format and intended use.
3. Approve a quote defining deliverables and revision/usage terms.
4. Pay the agreed deposit or fee.
5. Review delivery and request changes within the stated scope.
6. Accept additional charges explicitly for a new version or expanded agreed use.

### What the talent or authorised operator would experience

1. Review the script and requested delivery requirements.
2. Allocate recording time and studio resources if needed.
3. Send the Offer with clear terms.
4. Track delivered versions and client approval through supported tools.
5. Collect the balance or agreed additional charge.
6. Retain the approved scope and version history.

### Difficult combination and resolution

- Recording completion, file delivery and client acceptance are distinct milestones.
- Usage rights, version approval and secure audio delivery require explicit agreements/workflows, not automatic industry assumptions.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Packages & Services · Clients · Artists (hidden when solo) · Studios & Rooms (optional).
- **POS layout/opening:** Usually unnecessary; optional Booking collection.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Voice samples + service scope + request form + Request a recording. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Generic creative preset; Voice-over artist is a proposed taxonomy extension.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 46. Mobile car-detailing professional
*A customer requests a vehicle detail at home and adds an agreed service after inspection.*

### Customer journey

1. Find the professional’s profile and choose a package.
2. Describe the vehicle and service location.
3. Confirm the appointment and any inspection-dependent price terms.
4. Pay an agreed deposit if required.
5. Approve an extra after the actual scope is assessed.
6. Pay the balance and receive the completion record.

### What the talent or authorised operator would experience

1. Review vehicle and location details.
2. Reserve working and travel time.
3. Confirm the booking and scope.
4. Record inspection findings and agreed changes before charging.
5. Collect through supported mobile/online payment or cash.
6. Complete the visit and retain the approved service record.

### Difficult combination and resolution

- Vehicle identity and owner/payer identity are separate relationships requiring support.
- Weather or location constraints need explicit rescheduling rules; a mobile POS does not imply offline card acceptance.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services · Customers · Service Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Appointments or Booking collection, optional; Today.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Detailing packages + service area + Request a detail. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Mobile car detailing.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 47. Independent musician
*A musician offers private lessons and accepts live-performance bookings.*

### Customer journey

1. Explore lessons and performance services on the profile.
2. Book a lesson directly or send a performance brief.
3. Review the relevant price, date and scope.
4. Pay the agreed lesson fee or performance deposit.
5. Attend the lesson or host the performance under the confirmed arrangement.
6. Pay any remaining approved balance.

### What the talent or authorised operator would experience

1. Review lesson appointments and event inquiries together.
2. Block travel, rehearsal/setup and performance commitments.
3. Confirm the lesson or send the event Offer.
4. Keep the event booking separate from lesson registrations.
5. Use optional collection against the correct order.
6. Record service completion and any collaborator obligations.

### Difficult combination and resolution

- Performance dates must block conflicting lesson availability including necessary buffers.
- Event admission belongs to the event seller; a performer profile does not automatically control ticket sales.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Musicians (hidden when solo) · Service Locations.
- **POS layout/opening:** Appointments plus optional Booking collection; Today.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Performance samples + lesson options + availability + Book a lesson / Request performance. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Live band with solo context + Music school activity.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## 48. Independent event host or MC
*An organiser hires a bilingual host for a conference and adds a rehearsal session.*

### Customer journey

1. Find the host’s profile and submit date, languages and event format.
2. Discuss the run of show and rehearsal needs.
3. Approve the Offer with separate rehearsal and event commitments.
4. Pay the agreed deposit.
5. Approve schedule or overtime changes explicitly.
6. Settle the balance after the agreed service milestone.

### What the talent or authorised operator would experience

1. Review the brief and language/service requirements.
2. Allocate rehearsal, preparation, travel and performance time.
3. Send the Offer and confirm the accepted booking.
4. Keep the current run of show and approved changes connected.
5. Collect the appropriate balance online or through optional POS.
6. Record completion and preserve the original agreed scope.

### Difficult combination and resolution

- A rehearsal and event are two schedule allocations even when priced as one package.
- Private organiser documents and attendee data need appropriate access; hosting does not grant event-admin or ticketing rights.

### Suggested Talent Profile, management and POS preset

- **Management labels:** Services & Packages · Clients · Professionals (hidden when solo) · Service Locations.
- **POS layout/opening:** Booking collection, optional; Accepted Bookings.
- **Selling screen when used:** Selected client/payer + the existing service or accepted booking + approved charges + deposit already applied + outstanding balance. Hide tables, preparation and admission controls unless the actual service requires them.
- **Talent Profile / website suggestion:** Hosting samples + languages + event formats + Request a host. A separately branded business website is optional and must preserve the correct seller relationship.
- **Full preset reference:** Business-specific-labels-Workspace-Theme.md → Generic talent/entertainment preset; Event host or MC is a proposed taxonomy extension.
- **Readiness:** Proposed workflow. Validate the identified scheduling, recipient, delivery and payment capabilities before presenting the profession as fully supported.


## Shared foundation: feature labels and responsibilities

This is the approved candidate vocabulary for the 120-type directory, subject to final localisation review. Slash-separated names are alternatives: show one selected label in the interface, not the entire list. Fixed labels stay consistent across business types. Context labels describe a narrower view and must not rename a broader feature inaccurately. Every label resolves to the same canonical feature ID and authorised destination.

| Feature and display-label alternatives | Responsibility / selection rule |
|---|---|
| **Overview** | Fixed. Business summary and next actions, subject to permissions. |
| **Inbox** | Fixed navigation label. Conversations contain Inquiries / Requests / Briefs, depending on the intake form. |
| **Calendar** | Fixed. Combined time view of bookings, appointments, reservations, sessions and assignments. |
| **Sales** | Fixed common workspace destination for orders, bookings and customer commitments, including free/unpaid records. Orders / Bookings / Appointments / Reservations / Class registrations / Tickets are filter/view labels inside it. |
| **Catalog / Menu / Services / Services & Packages / Packages & Services / Treatments & Packages / Treatments & Services / Classes & Services / Courses & Lessons / Menus & Services / Menus & Packages / Menu & Experiences / Menu & Packages / Tastings & Menu / Spaces & Packages / Spaces & Services / Rooms & Services / Courts & Services / Retreats & Packages / Workshops & Packages / Experiences** | Define offerings, prices, variants and extras. Choose the label that covers the enabled offerings; never create a second catalog for a new label. |
| **Customers / Clients / Guests / Clients & Guests / Learners** | The customer relationship directory. Learners is suitable only when payer and participant relationships are represented; a child learner is not automatically the paying customer. Attendees and Participants belong in session views. Members requires an actual membership feature and is not a default synonym. |
| **Roster / Professionals / Specialists / Nail Technicians / Therapists / Practitioners / Artists / Stylists / Barbers / Lash Artists / Brow Specialists / Makeup Artists / Beauty Artists / Piercers / Instructors / Dance Instructors / Music Teachers / Vocal Coaches / Performers / Musicians / Guides / Crew / Creative Team / Event Professionals / Brand Ambassadors / Service Professionals / Groomers / Trainers** | Assignable professionals and their workspace relationships. Solo businesses may hide the roster navigation. Creative Team and Crew do not confer Team access. |
| **Team** | Fixed. Workspace members, invitations, roles and permissions. Separate from Roster. |
| **Inquiry / Request / Brief → Offer / Quote / Proposal → Booking** | Negotiated-work stage vocabulary. Show Inquiry for general work, Brief for agency/creative intake, Quote for priced service work, Proposal for packaged work. These are controlled stage labels, not interchangeable lifecycle states. Keep accepted Bookings accessible in Sales. |
| **Appointments / Consultations / Private Sessions / Service Appointments** | Individual scheduled services. Use Consultations only when the module is limited to consultations; a mixed business keeps Appointments. Do not use Sessions where it would collide with class sessions. |
| **Reservations / Table Reservations / Space Reservations / Room Reservations / Court Reservations / Cabana Reservations** | Allocate a resource over time. Narrow labels require the corresponding resource scope; otherwise use Reservations. |
| **Classes / Classes & Workshops / Lessons / Workshops / Group Sessions** | Class definitions, dated occurrences, registration and attendance. Courses is only suitable after multi-session enrolment is supported; changing the label alone does not add a course engine. |
| **Events & Tickets / Events & Admissions** | Events, admission types, ticketing and check-in. An Events-only view may hide ticket selling for a free/invitation event while retaining the canonical feature. |
| **Spaces & Seating / Spaces / Stations / Treatment Rooms / Chairs & Stations / Tables & Spaces / Tables & Booths / Studios & Rooms / Studios & Sets / Cabanas & Seating / Venues & Spaces / Classrooms / Workstations / Teaching Kitchens / Courts / Pools & Lanes / Rooms / Loungers & Cabanas** | Physical spaces, layouts and bookable resources. Show a narrow label only when it describes the resource set. |
| **Service Locations / Meeting Points** | Location-context labels for mobile or experience businesses. Addresses and meeting points are not reservable capacity automatically; distinguish them from true resources within the same location management area. |
| **Capacity / Available Places / Available Seats / Guest Limit / Participant Limit / Resource Availability** | Shared constraints displayed in context, not a separate sidebar module. A total limit, remaining count and time availability are different fields, not mathematical synonyms. No inventory. |
| **Website** | Fixed workspace destination. Public site, pages, navigation, preview, theme and publishing. |
| **Links & QR** | Fixed. Destination links and QR entry points with valid business/table/event context. |
| **Media** | Fixed management destination. Gallery / Portfolio are public display section labels for selected media, not replacements for the upload library. |
| **Reviews** | Fixed. Feedback and supported response/request workflows. Testimonials is a public presentation option, not an automatic reclassification of every review. |
| **Analytics** | Fixed. Sales, collection, attendance, resource utilisation and acquisition reporting. |
| **Discounts** | Required shared promotion feature for workspace sellers and independent talent sellers. Percentage/fixed amounts, codes, automatic rules and authorised manual adjustments; the same calculation across channels. |
| **Payments** | Fixed. Collections, refunds, settlement, reconciliation and supported payouts. Payments is not a synonym for Sales. |
| **Settings** | Fixed. Business type, vocabulary, module preferences, appearance, integrations and global configuration. |
| **Open POS** | Fixed workspace entry action. POS / Point of Sale names the operational mode. |
| **Kitchen / Bar / Kitchen & Bar / Preparation** | Optional preparation station/queue names. Stations receive relevant items; do not expose preparation controls to businesses without this workflow. |
| **Mercado Pago Point / Stripe Terminal** | Provider/product names for distinct eligible integrations, not theme synonyms. Do not rename one into the other or imply capability parity. Cash remains its own collection method. |

### POS: full label variation dictionary

These are supported design candidates, not automatic renames. Business type supplies defaults; enabled workflows and location context choose valid options. Keep provider and financial-state wording accurate. Changing a label must never change the action it triggers.

| Canonical POS area / action | Display-label alternatives | Rule |
|---|---|---|
| Workspace entry | **Open POS** | Fixed; header and navigation open the same mode. |
| Mode title | **POS / Point of Sale** | Choose one product title consistently. Do not name the whole workspace POS. |
| Create order | **New Sale / New Order / New Check / New Tab** | Same order-creation foundation with context. New Tab is hospitality only; it does not imply card preauthorisation. |
| Existing orders | **Open Orders / Open Checks / Open Tabs** | Active commercial records. Open Bookings is not an alias because bookings can exist without orders. |
| Scheduled work | **Today / Today's Appointments / Today's Reservations / Today's Bookings / Today's Sessions** | Narrow view labels only when the list is actually filtered to that type; Today is the mixed default. |
| Select resource | **Tables & Spaces / Tables / Tables & Booths / Booths / Cabanas / Cabanas & Seating / Rooms / Stations / Chairs & Stations / Courts / Studios & Rooms / Loungers & Cabanas** | Only the resources used in service at that location. No resource panel for a pure counter sale or online consultation. |
| Group activity | **Classes & Admissions / Classes / Sessions / Lessons / Workshops / Events & Tickets / Admissions** | Present available group/admission workflows; Classes and Admissions remain different record types underneath. |
| Participant list | **Attendees / Participants / Guests / Learners** | In the selected class/event view. Keep the paying customer identifiable separately. |
| Item selector | **Catalog / Menu / Services / Services & Packages / Packages & Services / Treatments & Packages / Treatments & Services / Classes & Services / Courses & Lessons / Menus & Services / Menus & Packages / Menu & Experiences / Menu & Packages / Tastings & Menu / Spaces & Packages / Spaces & Services / Rooms & Services / Courts & Services / Retreats & Packages / Workshops & Packages / Experiences** | Inherit the workspace catalog vocabulary. A filtered Tickets or Extras panel may use its narrower title without renaming Catalog. |
| Customer selector | **Customer / Client / Guest / Learner / Client or Guest** | Singular form of the configured directory vocabulary, preserving payer versus attendee distinction. |
| Professional selector | **Professional / Specialist / Nail Technician / Therapist / Practitioner / Artist / Stylist / Barber / Lash Artist / Brow Specialist / Makeup Artist / Beauty Artist / Piercer / Instructor / Dance Instructor / Music Teacher / Vocal Coach / Performer / Musician / Guide / Crew Member / Creative Professional / Event Professional / Brand Ambassador / Service Professional / Groomer / Trainer / Talent** | Singular context form of the roster dictionary, shown only where assignment is relevant. |
| Bill panel | **Current Order / Current Bill / Check / Tab** | Contains line items and outstanding balance. Never replace payment status with booking status. |
| Options | **Extras / Add-ons / Options** | Extras/add-ons can have prices; Options can include no-price choices. Label the actual behaviour. |
| Save open order | **Hold Order / Save Order / Keep Tab Open** | Preserve an unfinished sale. Not a capacity hold or payment authorisation. |
| Preparation screen | **Kitchen / Bar / Kitchen & Bar / Preparation** | Optional, station-aware workflow. |
| Preparation action | **Send to Kitchen / Send to Bar / Send to Preparation** | Route only appropriate new/changed items; use explicit separate destinations where needed. |
| Discount action | **Apply discount / Remove discount** | Permission-controlled adjustment using shared eligibility and stacking rules; record actor and reason. |
| Begin collection | **Charge** | Fixed. Opens methods for the outstanding amount. Do not substitute Confirm Booking or Complete Visit. |
| Payment methods | **Mercado Pago Point / Stripe Terminal / Cash** | Only enabled, supported choices. Other methods require separate integration and exact method labels. |
| Receipt/refund history | **Receipts & Refunds** | Fixed default. Receipts-only view for staff without refund rights; do not call refunds Returns unless an actual returns workflow exists. |
| Cash operations | **Shift & Cash / Register & Cash** | Location/register operational vocabulary; role and capability gated. |
| Attendance | **Check In / Mark Arrived** | Check In for valid admission/attendance; Mark Arrived for a scheduled visit. Neither charges the customer. |
| Service completion | **Complete Visit / Complete Service** | Operational completion only, subject to policy; does not silently collect a balance. |
| Exit mode | **Back to Workspace** | Fixed. Does not close shift, cancel saved orders, reverse payment or drop an in-flight charge. |

Fixed financial labels include Total, Tax, Discount, Deposit Applied, Paid and Balance Due, each shown only when applicable. Pending, Approved, Declined, Unknown, Refunded and Settled remain separate states with the correct business meaning. Display translations through reviewed locale dictionaries, never through an industry preset.

For the sidebar, avoid duplicate destinations with the same visible name. A classes-first business may use Classes & Services for Catalog and Classes for session management; provide clear page subtitles. If two resolved labels collide, retain the canonical qualified label and show the conflict in Settings preview.

## Discounts: required product capability

Recorded 8 September 2026. Discounts are part of the required Tulala product scope for both tenant/workspace businesses and independent talents selling their own services. This is a development requirement, not a claim that all discount capabilities are currently implemented. It applies across all 48 case studies where a seller charges for an offering.

### Seller ownership and permissions

| Context | Example | Authority |
|---|---|---|
| Workspace sells | A lash business offers 15% off a first appointment | Workspace owner or specifically authorised staff |
| Talent sells privately | Tania discounts a private massage | Tania as the responsible seller, or her authorised operator |
| Talent performs workspace-owned work | Tania performs a spa-owned treatment | Spa controls discount rules; talent assignment alone grants no discount authority |
| Platform subscription promotion | Tulala discounts its own subscription | Platform administration; separate from merchant customer-sale promotions |

Scope each promotion to its seller/workspace, eligible offerings and explicit rules. A public Talent Profile does not grant permission to discount another seller's services. Role checks apply on the server and in every entry point, not merely by hiding a POS button. Support distinct permissions for creating promotions, applying approved codes, making manual adjustments and authorising exceptions. Record actor, reason and any required manager approval.

### Navigation and customer-facing use

- **Workspace → Sell → Discounts:** manage promotions, schedules, eligibility, redemption limits, status and usage history. Use the fixed label Discounts across business types; localise it normally.
- **Website checkout:** accept eligible promo codes and clearly display qualifying automatic promotions and the resulting total before payment.
- **Inquiry → Offer → Booking:** include any negotiated discount explicitly in the offer's price breakdown. Preserve the accepted pricing agreement; do not silently combine an offer discount with another promotion.
- **POS:** provide Apply discount and Remove discount on an editable order, subject to permissions and policy. Show original amount, adjustment and final amount. Charge remains a separate action.
- **Sales details and receipts:** preserve applied discounts and relevant line allocations alongside charges, payments and remaining balance.
- **Analytics:** report gross sales, discounts and net sales using a consistent documented basis; distinguish these figures from payment collection and settlement.
- **Payments:** retain the discounted order linkage. A discount is not a provider payment, refund, deposit or settlement event.

The proposed logical destination is route ID discounts, suffix discounts, under the existing authorised workspace router. Map it to actual code during implementation; labels must not determine URLs. The latest agreed Sell menu is Catalog · Discounts · Appointments · Reservations · Classes · Events & Tickets. This addition also needs to be carried into the companion workspace-theme registry during implementation; older companion menu lists without Discounts are superseded by this decision.

### Supported promotion forms and rule fields

1. Percentage discounts with an optional maximum discount amount.
2. Fixed-amount discounts in an explicitly specified currency.
3. Customer-entered promo codes.
4. Automatic promotions for eligible purchases within defined conditions.
5. Authorised manual order or line-item discounts, including negotiated offer adjustments.

Specify seller, scope, eligible offering/variant/category, customer eligibility, sales channel, location, currency, start/end time and business time zone, minimum eligible spend if used, maximum discount, total redemptions, per-customer redemptions and combination policy. Clearly distinguish first completed purchase from first appointment creation when defining a first-customer promotion. Define how guest checkout and verified customer identity affect enforcement; do not claim reliable per-customer limits from an unverified email alone.

Default to no stacking unless a combination is explicitly permitted. If several automatic promotions qualify, use a deterministic documented selection policy and show which was applied. Never silently replace an accepted custom offer's terms. Promotion editing affects future eligibility; orders retain their accepted pricing snapshot. Disabling a code must not rewrite historical orders.

### Shared calculation and money rules

Website, staff-entered offers and POS must call the same server-side eligibility and pricing logic. Store the promotion reference/version, calculation inputs, original eligible amount, line-level allocation, discount amount, currency, funding party and final charge snapshot. Revalidate material order changes before confirming an amended total.

Example, before any separately applicable tax or additional charges: Tania's MXN 1,000 service minus a 10% discount is MXN 900. A MXN 300 deposit already paid leaves MXN 600 to collect. The discount reduces the charge; the deposit is an existing payment that reduces the balance. Never subtract the same deposit twice or classify it as a discount.

Clamp discounts to the eligible charge base; do not produce a negative payable amount. Use currency-aware rounding and deterministic line allocation so totals and partial refunds reconcile. Calculate taxes through the existing jurisdiction-aware pricing rules and preserve the relevant snapshot; do not apply a universal tax ordering rule through a theme preset. Define explicitly whether tips, deposits as payment requirements, service charges and other fees are eligible; do not discount them accidentally as ordinary catalog lines.

Record whether a discount is seller-funded, talent-funded under an agreement, or platform-funded through a separately approved programme. Commission bases and contractual obligations must follow the configured agreement, not an assumed universal percentage of either gross or net sales. A platform-funded customer promotion is distinct from a Tulala subscription promotion. Do not advertise funding arrangements before their accounting and settlement behaviour is supported.

If a price amendment on a partly paid order makes payments exceed the new amount due, show the resulting credit/refund obligation and require the supported resolution; do not silently refund, erase payments or display a misleading negative charge. For an in-flight terminal attempt, prevent conflicting price changes or explicitly cancel/reconcile the attempt before starting a new amount. A completed sale is not editable as though no money moved; use the authorised adjustment/refund process.

For partial cancellations, calculate the refund from the affected items' stored discounted allocation and payment history, subject to the applicable agreed policy. Refund through the original payment route. Define whether a cancelled/refunded purchase restores a limited redemption; never rely on an accidental side effect.

### Concurrency, capacity and recovery

Limited-use discounts require atomic redemption reservation/commit and expiry/release rules. Two simultaneous checkouts must not consume the same last redemption. Retries and duplicate notifications must not redeem a code twice. Keep temporary payment/checkout failure recovery consistent with capacity holds without merging the two concepts.

A 100% discount still creates the appropriate order/registration records and enforces capacity, availability, permissions and admission rules. It does not require a zero-value terminal charge. Applying a promotion cannot make an unavailable appointment, sold-out class or blocked room bookable.

### Required delivery and acceptance evidence

- Map existing promotion/pricing capabilities before adding another engine; identify implemented, partial, missing and untested behaviour.
- Build shared eligibility/calculation and seller scoping, then management UI, checkout/offer/POS actions and reporting.
- Verify workspace owners and independent talent sellers can create permitted promotions, while assigned talents cannot discount workspace-owned work without permission.
- Verify an identical eligible basket receives the same result on Website and POS; channel-restricted promotions differ only according to their stored rules.
- Verify the MXN 1,000 → MXN 900 → MXN 600 remaining example, currency rounding, expiry/time-zone boundaries, stacking, first-purchase eligibility and redemption limits.
- Verify concurrent last-use attempts, retry deduplication, a free but capacity-limited booking, partial refunds and discount changes on partly paid orders.
- Verify commissions/funding allocation follow the actual agreement and paid or pending terminal orders cannot be silently repriced.

Discounts must appear in the product backlog, workspace navigation registry, talent seller permissions and relevant acceptance journeys. They are not merely a decorative price field or a future industry-label option.

## What exists and what remains

Repository inspected on main at 749737206b6d8890442ab98a325f46d5873b7837. This is a targeted source review, not a live acceptance test.

Current code has a shared createPurchase pipeline with customer lookup, catalog pricing, variants/add-ons, policy checks, capacity holds, optional professional reservation and source-channel information. It explicitly replaces older instant/menu purchase engines and does not force direct purchases through quotation. The completion code distinguishes payments from orders and accounts for the fact that a deposit does not finish payment for a sale.\
Sources:

- [https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/purchase.ts](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/purchase.ts)
- [https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/purchase-types.ts](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/purchase-types.ts)
- [https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/complete-order.ts](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/complete-order.ts)

Existing payout routing inspected is Stripe-oriented; Point needs its own supported collection and settlement design.

- [https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/payments/disburse.ts](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/payments/disburse.ts)

No Mercado Pago/Point implementation was identified in the inspected paths. Do not label the connector or integrated POS as shipped based on existing commerce primitives.

Remaining delivery sequence:

1. Merchant connection and transaction back office: authorization, tenant/account ownership, supported history import, unmatched payments, source filters, sync status and reconciliation.
2. POS MVP with Point: touch-friendly register, catalog search, open existing orders, walk-ins, remaining balance, terminal selection, verified status updates, cash and receipts.
3. Payment hardening: deduplication, retries, pending recovery, cross-provider deposits/balances, refunds, fee/net reconciliation, failed/expired terminal sessions and audit trail.
4. Operational permissions and shifts: cashier controls, opening/closing cash, paid-in/out, cash discrepancies and manager-approved adjustments.
5. Industry connections: reservations/table tabs, class/event walk-ins with capacity and admission, appointment balances, group resources and optional Kitchen/Bar.
6. Later capability: split tenders/checks, additional hardware and deliberately designed offline behavior. Do not promise offline card acceptance.

Release proof: duplicate notifications do not double-count payment; a terminal timeout does not cause a duplicate charge; an online deposit plus Point balance closes correctly; refunds use the original provider; money marked approved is not mislabeled settled; cross-tenant account selection is refused; walk-ins cannot oversell classes/events; unmatched imports do not fabricate orders or customers.

Next implementation input: identify the first merchant's country and exact terminal model. This does not block the product design.


## Development record: final navigation, pages and business themes

Recorded 8 September 2026. This replaces earlier navigation proposals while preserving the twelve journeys. The companion [Business-specific labels - Workspace Theme](Business-specific-labels-Workspace-Theme.md) contains the 120-business directory, preset definitions, complete label dictionary, search/onboarding specification, data contracts and acceptance criteria. Both documents describe intended development, not a new repository audit. Earlier repository observations retain their original snapshot and must be checked before implementation.

## 3. Final workspace navigation

Open POS appears in the header and navigation when enabled and authorised. Overview remains the main entry point. The full list below is the platform superset; an individual business sees its enabled subset.

| Group | Canonical navigation items |
|---|---|
| Always visible | Overview; Open POS when eligible |
| Operate | Inbox; Calendar; Sales; Customers |
| Sell | Catalog; Discounts; Appointments; Reservations; Classes; Events & Tickets |
| People & Spaces | Roster; Spaces & Seating |
| Grow | Website; Links & QR; Media; Reviews |
| Manage | Analytics; Team; Payments; Settings |

Keep Sales, Inbox, Calendar, Payments, Team, Settings and Overview consistent across business types in each language. Catalog, Customers, Roster and Spaces & Seating have controlled vocabulary variants. Localisation translates all labels; “consistent” does not mean always English. Empty groups disappear. A business preset may prioritise a default view, but does not randomly reorder navigation on each visit.

### 3.1 Sales: the common destination for orders and bookings

Use Sales as the shared navigation name. Its subtitle is “Orders, bookings and customer activity.” Include unpaid and free commitments so a missing payment does not make a booking disappear. Keep the terms order, appointment and booking in detail pages and filters.

Sales views: All activity; Orders; Bookings; Appointments; Reservations; Class registrations; Tickets. Show relevant types only. Draft inquiries and unaccepted offers remain in Inbox with links; a quote is not recognised revenue. A preset can set the first selected view, such as Bookings for an agency or Orders for a restaurant, without changing the Sales label.

Filters: record type, operational status, payment status, date basis, date range, customer, professional, location, channel and currency. Date basis explicitly distinguishes created date, service date and payment date. Channel values include website, QR, POS and staff-entered; provider is a separate field. Persist personal saved filters separately from workspace defaults.

Recommended columns: reference and type; customer; service/event; service date; location/professional; operational status; total; collected; balance. At narrow widths use stacked rows, keeping reference, status and balance visible. Revenue metrics use financial records, not row count or the sum of every linked display amount. Do not add amounts in different currencies without an explicit conversion/reporting policy.

Opening a record shows Overview; Schedule & Assignments where relevant; Charges & Payments; Messages & Files; Activity history. Show a booking without an order as “No charges attached,” not “Payment failed.” Show a free confirmed registration as free, not overdue.

An order can contain multiple services or admissions, and a visit can have multiple orders. Render linked records under a clear group or expandable relationship, not a forced one-order/one-booking schema. Query and count each source by stable ID; deduplicate payments by their payment identity. A counter sale has no booking. A reservation may have no order. Payment approval, booking confirmation, service completion and settlement are independent states.

### 3.2 True ownership versus navigation grouping

| Module | Owns | References |
|---|---|---|
| Catalog | Offerings, categories, prices, variants, extras | People, channels and availability policies |
| Appointments | Appointment-specific rules and appointment records | Offerings, professionals, resources, orders |
| Reservations | Reservation policies and reservation records | Spaces/resources, optional charge records |
| Classes | Class definitions, sessions and registrations | Instructors, spaces, offering prices |
| Events & Tickets | Events, admission types and attendance | Spaces/layouts and commercial pricing |
| Spaces & Seating | Locations/spaces, resources and layout definitions | Availability allocations across all consuming modules |
| Roster | Assignable professionals and business relationships | Scheduling and permitted public profiles |
| Team | Membership and operational permissions | Identity and workspace access |
| Sales | A combined view of existing business records | Orders, bookings, appointments, registrations and payments |
| POS | Operational presentation and actions | The same services used by website and workspace |

Catalog is not the parent of Appointments or Reservations. Spaces & Seating is shared, not owned by Events. A useful spatial hierarchy is Location → Space → Layout → Tables/Seats/Stations, with layouts optional for a simple treatment room. Alternate layouts cannot create additional physical capacity. A resource retains a stable identity where shared between arrangements, and allocations must be checked across incompatible layouts. Virtual appointments and mobile service areas are not automatically reservable physical rooms.


## 4. Canonical page and link registry

The route suffixes below are proposed logical targets, not verified existing repository paths. Developers must map each stable route ID to the existing authorised workspace router before implementation. Use the current workspace prefix and stable IDs; never construct links from translated labels. Keep redirects or compatibility mappings for existing deep links. A label change must not change a URL.

| Page ID / proposed suffix | Visible default | Pages, tabs and actions | Key links |
|---|---|---|---|
| overview / overview | Overview | Today's activity, balances with clear basis, next actions | Relevant Sales detail; Calendar; Open POS |
| inbox / inbox | Inbox | Conversations; inquiries; offers; accepted work; attachments | Customer; professional; accepted booking in Sales |
| calendar / calendar | Calendar | Day/week/month; people/resources; availability; event details | Appointment, reservation, class, event or booking source |
| sales / sales | Sales | Unified views and filters described above | sales detail; source module; customer; payment |
| sales.detail / sales/:type/:id | Record reference | Overview; schedule; charges; messages; audit history | Source record; POS for eligible collection |
| customers / customers | Customers | Directory; search; contact profile; history; preferences | Sales; Inbox; permitted customer files |
| discounts / discounts | Discounts | All; scheduled; active; expired/disabled; create/edit; eligibility; usage; audit history | Eligible offerings; Sales; POS permissions |
| catalog / catalog | Catalog | Categories; offerings; variants/extras; pricing; channel visibility | Offering detail; website display; POS eligibility |
| appointments / appointments | Appointments | Upcoming; past; arrival/completion; availability; settings | Service; professional; resource; Sales |
| reservations / reservations | Reservations | Upcoming; past; arrivals; availability; policies | Space/table; customer; linked Sales |
| classes / classes | Classes | Definitions; dated/recurring sessions; registrations; attendance; waitlist when built | Instructor; room; capacity; linked Sales |
| events / events | Events & Tickets | Events; ticket types; attendees; check-in; settings | Space/layout; capacity; linked Sales |
| roster / roster | Roster | Professionals; invitations/relationships; assignment availability; public presentation | Profiles; Calendar; assignments |
| spaces / spaces | Spaces & Seating | Locations; spaces; resources; arrangements; capacity; availability | Reservations; event/class allocation |
| website / website | Website | Pages; navigation; theme; preview; publishing; domains | Page Builder; templates; live-data section configuration |
| links / links | Links & QR | Create/manage destination links; QR codes; context and channel | Page, offering, event or table destination |
| media / media | Media | Uploads; folders; permissions; alt text; usage | Website and portfolio sections |
| reviews / reviews | Reviews | Received feedback; permitted replies; request settings | Customer and relevant completed visit |
| analytics / analytics | Analytics | Sales; collection; attendance; utilisation; channels; exports | Source records with matching filters |
| team / team | Team | Members; invitations; roles; location scope; access audit | Permission settings; staff profiles |
| payments / payments | Payments | Collections; refunds; fees/net; settlement; unmatched imports; supported payouts | Original Sales record; provider transaction; integration settings |
| settings / settings | Settings | Business profile; Business type & workspace; appearance; integrations; billing; notifications; locale | Configuration subsections below |
| settings.business-type / settings/business-type | Business type & workspace | Search; primary/secondary types; label preview; module recommendations; apply/history | Relevant setup tasks and website suggestions |
| settings.payments / settings/integrations/payments | Payment integrations | Accounts; channel defaults; country eligibility; registers/terminals; connection status | Payments reconciliation; POS setup |
| pos / pos | Open POS | Dedicated operational mode | Same workspace and location identity |

Module settings remain inside their module. Global Settings links to them rather than duplicating cancellation, availability or admission rules. Capacity is a shared rule surfaced where users configure a resource or session, not a separate sidebar destination. Overview and analytics must not expose financial totals to a role lacking financial access.


## 5. POS operational navigation and screen contract

| POS page ID | Label | Function | Visibility |
|---|---|---|---|
| pos.new | New Sale | Start a walk-in/counter order | POS order-creation permission |
| pos.orders | Open Orders | Resume saved checks/unpaid orders | Order access; bar may use Open Tabs |
| pos.today | Today | Arrivals, appointments, reservations and bookings | Scheduled services enabled |
| pos.spaces | Tables & Spaces | Select the resource being served | Resource service enabled; use configured resource vocabulary |
| pos.admissions | Classes & Admissions | Dated sessions, place sales and check-in | Classes/events capability and staff permission |
| pos.preparation | Kitchen / Bar | Preparation queues | Preparation capability; station permission |
| pos.receipts | Receipts & Refunds | Completed sales and authorised refund actions | Separate receipt/refund permissions |
| pos.shift | Shift & Cash | Shift opening/closing, paid-in/out, count and discrepancy | Shift/cash capability and permissions |
| workspace.return | Back to Workspace | Return without cancelling work or closing shift | Workspace access; restricted operators return to their allowed landing page |

Open Orders describes actual operational checks inside POS. Sales remains the common workspace destination. Do not show every POS module to every business or create a second catalog.

| Selling-screen area | Required content |
|---|---|
| Header | Workspace, location, staff identity, connection/terminal state, Back to Workspace |
| Left | Current service context: tables, appointments, sessions or open orders |
| Centre | Menu/services/tickets; category and search; variants and approved extras |
| Right | Customer; linked visit/resource; line items; adjustments; eligible deposit credit; collected amount; balance |
| Action area | Hold order; preparation send where relevant; Charge |
| Charge panel | Configured eligible payment methods; exact amount/currency; terminal/account; pending/approved/declined/unknown states |
| Completion | Verified result; receipt; continue service or New Sale |

On mobile, use a service → items → bill flow with persistent order context and accessible bill access; do not squeeze three desktop columns into the viewport. Ensure keyboard and touch operation, readable labels, and no colour-only status. Distinguish unsaved draft from saved open order.

Sending preparation items must send only new or changed eligible items, not resend the whole check without explicit intent. Keep preparation status separate from payment status. Check-in without payment is possible for a valid already-paid or free admission, subject to its policy.

Payment-provider configuration is independent of business type. Use supported Stripe and/or Mercado Pago channels only after merchant/account/device checks. Cash is a recorded payment method, not a provider connection. A business-type switch never reconnects a terminal, changes a currency, moves money, updates tax rules or migrates a payment credential. Do not silently retry an unknown payment with another provider. Refund each original payment through its appropriate original route. Do not infer automated talent payouts from terminal collection.

External provider transactions imported without a known order stay in Payments → Unmatched until reconciled. Their presence does not fabricate an itemised Sales record or customer identity. Inventory is excluded; offline card acceptance and unverified integrations are not promised.


## 6. Twelve priority business configurations

These retain the twelve original journeys and specify where behaviour, not just wording, changes. All advanced behaviours below are requirements to validate, not claims of current delivery.

| Business | Catalog / customer / roster / resource labels | Required operational differences |
|---|---|---|
| Nail salon | Services / Clients / Nail Technicians / Stations | Technician and station availability; nail-art extras; deposits; bridal groups; appointment POS |
| Spa | Treatments & Packages / Clients / Therapists / Treatment Rooms | Multiple therapists plus room in one allocation; buffers; couples packages; restricted preferences |
| Independent massage therapist | Services / Clients / Professionals (hidden for solo) / Service Locations | Mobile visits and travel; personal/spa schedule conflict checks; explicit seller; service areas distinguished from rooms |
| Tattoo studio | Services / Clients / Artists / Stations | Inquiry-first custom quotes; references; deposits; multi-session work; direct flash appointments |
| Hair salon | Services / Clients / Stylists / Chairs & Stations | Processing phases and timing; wash stations; approved changes; tips if supported |
| Restaurant | Menu / Guests / Professionals (optional) / Tables & Spaces | Table reservations; contextual QR; preparation; open checks; eligible credit; split settlement if built |
| Bar | Menu / Guests / Performers (optional) / Tables & Booths | Open tabs; bar queue; booth and admission separation; performer payments distinct |
| Talent agency | Services & Packages / Clients / Roster / Spaces & Seating (optional) | Sales opens Bookings; inquiries/offers; multi-talent assignments; commission obligations; optional office POS |
| Yoga or fitness studio | Classes & Services / Customers / Instructors / Studios & Rooms | Recurring sessions; capacity; attendance/waitlist; private appointments; walk-ins |
| Photography studio | Packages & Services / Clients / Creative Team / Studios & Sets | Proposals; multiple people/resources; overtime validation; headshot appointments |
| Beach club | Menu & Packages / Guests / Professionals (optional) / Cabanas & Seating | Cabana service; QR; food/bar queues; explicit spending credit; independent event admission |
| Event venue | Packages & Services / Clients & Guests / Professionals / Venues & Spaces | Space hire; arrangements; capacity; performers; organiser and guest payers; ticketed/public events |

Customer profile entities do not change type when displayed as Clients or Guests. “Members” must not imply a membership entitlement unless such a feature is explicitly supported and configured. “Creative Team” is a roster label, not a grant of Team permissions.


## Build instructions for searchable business themes

1. Build one stable business-type registry shared by registration, Settings, POS and future Page Builder recommendations. Start with the companion document's 120 types, grouped into 12 reusable families. Store stable type IDs, localised names, aliases, maturity and versioned preset references. Other business remains available.
2. Let the owner choose a primary type and additional activities. Primary type sets default vocabulary; secondary types add recommendations. Business type is independent of plan, legal identity, payment country and personal talent/business relationships.
3. Provide Business type search during registration and Settings → Business type & workspace. Support English/Spanish aliases, accents, keyboard access, clear no-results behaviour and deliberate selection when ambiguous.
4. Preview labels, suggested modules, default Sales view and POS layout before applying. Preserve manual overrides, enabled modules with records, future bookings, financial settings, permissions and website content. Apply presentation changes atomically with a revision guard and audit history.
5. Use capability and permission checks for actual activation. A type selection must not enable unbuilt workflows, trigger an upgrade, connect a provider or invent resource availability. Hiding a menu entry is separate from disabling new bookings and separate from API authorisation.
6. Resolve vocabulary by manual override → type preset → family preset → canonical localised default. Keep stable routes and deep links. Validate singular/plural labels and duplicate navigation names. Show one selected label, never a slash-separated dictionary in the live sidebar.
7. Use Sales as a view over underlying records, not a replacement financial object. Preserve order/booking/payment distinctions, free records, multiple linked items and separate participant/payer identities. Count money once and preserve currency context.
8. Maintain a small set of POS layouts: table service, appointments, sessions/admissions, counter sale and optional office collection. All call shared commerce/scheduling services. A theme update must not interrupt a pending payment.
9. Offer Page Builder templates and sections based on business type and real enabled features. Respect global brand/theme inheritance and live bindings; preview draft import separately and never republish an existing website automatically.
10. Deliver registry/vocabulary first, Settings and safe migration second, registration third, unified Sales/POS fourth, and website recommendations fifth. Validate original twelve journeys before claiming workflow support for the broader directory. No inventory.

Acceptance priorities: type changes preserve records and manual choices; role checks cannot be bypassed by presets; translated labels retain links; conflicting edits are rejected; secondary types do not overwrite primary vocabulary; capacity is shared across modules and layouts; terminal results remain provider-correct; website content is untouched until explicitly changed; every additional industry exposes its actual delivery limits.


## Audit and development wrap-up — 8 September 2026

### Executive decision

**Build Tulala POS as another operating surface over Tulala's existing commerce services. Finish and prove the current event commerce paths before expanding into restaurant operations.** Keep the workspace, website, talent profile, door desk and POS connected to the same authoritative records.

This is not a recommendation to restart commerce or replace the existing application. Existing purchase, completion, capacity, ticketing, labels and promotion foundations materially reduce the work. They do not establish that a complete restaurant POS, terminal connector or all 48 journeys are delivered.

**Status of this document:** the 48 journeys and theme dictionaries remain product requirements. The audit below records implementation evidence at a pinned repository revision. Future-tense capabilities are not launch claims. This chapter supersedes the earlier “Remaining delivery sequence” wherever priorities differ.

### Audit scope and evidence standard

- Repository: orantene/impronta-app. Inspected main: `749737206b6d8890442ab98a325f46d5873b7837`. The production branch returned the same SHA during this audit.
- GitHub's open-issue collection returned **2 issues: #1812 and #1782**. The open-pull-request collection returned **0**, including no drafts in that collection.
- Inspected the complete recursive tree (8,955 entries; not truncated), selected implementation files, migrations, tests, recent merged PRs, current plans and historical handoffs. Tree enumeration is not a line-by-line review of every file.
- Returned workflow runs on the inspected head showed successful structural, fidelity and admin-boot runs; this is existing CI evidence, not tests newly executed during this audit.
- A matching production branch is deployment-intent evidence. It does not prove the database migration history, active feature configuration, terminal provisioning, or a successful live customer journey.
- No authenticated production QA, production database inspection, real-card purchase, refund, terminal operation or load test was performed. No repository code was changed.
- Cursor's screenshots are treated as a comparison checklist. Repository source, PR acceptance notes and live issue state take precedence where they disagree.
- “Full list” below means the consolidated unfinished-work register from the inspected evidence, with an explicit historical-reconciliation queue. It cannot certify that no unknown defect exists anywhere in the product.

**Status vocabulary:** **OPEN** = GitHub issue remains open; **SOURCE PRESENT / QA OPEN** = implementation found, acceptance not established; **GAP** = missing piece directly observed in inspected source; **DOCUMENTED** = plan or handoff records unfinished work, current runtime not verified; **DEFERRED** = deliberately outside the current phase; **PROPOSED** = requirement from these journeys without delivery proof; **RECONCILE** = historical claim that must be checked before opening a new engineering task.

### A. Cursor checklist: independent reconciliation

| ID | Item | Audit conclusion | Required next action / completion evidence |
|---|---|---|---|
| A01 | #1812: duplicate event sessions double seats | **OPEN; remediation source present.** The session writer handles duplicate inserts and a migration adds uniqueness on event, start instant and venue, including null venue. It is incorrect to describe the inspected source as still having only series uniqueness. | Inspect applied migration history and existing duplicate groups; handle conflicting live holds/admissions before any cleanup. Prove concurrent same-night retries create one session and one pool set. Close the issue only with evidence. |
| A02 | #1782: El Paisa described as represented talent | **OPEN; remediation source present.** A business homepage metadata helper is imported and called by the homepage. | Verify actual tenant preset, generated title/description, visible headings and cached/social metadata on the live business hostname. Test an agency still receives appropriate wording. |
| A03 | Admin Events navigation and Menu leakage, PR #1932 | **SOURCE PRESENT / QA OPEN.** PR merged; its admin, menu and public-picker test boxes remain unchecked. | Signed-in Events children, Add new, Orders and Door navigation; event-owned offerings absent from Menu and refused by mutation paths; direct guest page loads. |
| A04 | Cortesía hidden / public complimentary path | **DOCUMENTED configuration and QA gap.** PR #1933 says the test tier remains hidden. Current live visibility was not inspected. | Use an intentionally configured test/free tier with bounded capacity; do not indiscriminately unhide a production tier. Demonstrate a fresh zero-total purchase. |
| A05 | Complimentary door QR after mint fix | **SOURCE PRESENT / QA OPEN.** PR #1933 proves reaching a zero-total receipt, but explicitly leaves fresh post-merge QR proof unchecked. | Fresh purchase → committed seat → exactly one admission → receipt code → first scan accepted → repeat scan refused. An old failed receipt is not proof. |
| A06 | Pay-at-door missing from guest picker | **Screenshot claim superseded by source.** Picker includes full/in-person selection when the selected night offers it, and passes paymentChoice. | Test visibility by policy, hold expiry, unpaid receipt and supported door-settlement path. Source presence does not prove the deployed control works. |
| A07 | Promo code not exposed in picker | **GAP in inspected picker.** Promo handling exists downstream; no promo input was found in this component. | Add an accessible field, apply/remove feedback, server-calculated totals and eligibility errors. Reuse the promotion engine. |
| A08 | Guest unpaid order → Door Settle → admission | **SOURCE PRESENT / QA OPEN.** Settlement actions and purchase infrastructure exist; the complete guest acceptance path remains unproven here. | No admission before the permitted settlement boundary; settling twice cannot double-pay or double-mint; receipt updates and door check-in succeeds once. |
| A09 | Paid card checkout not exercised | **QA OPEN.** A merged PR explicitly instructs not to complete a card charge in QA. This audit did not change that instruction. | Run provider test-mode end-to-end proof first. A separately authorized controlled live purchase is a final release gate where required. |
| A10 | Loyverse POS integration | **PROPOSED.** No finished connector or integrated restaurant POS was established by this audit. | Decide whether a temporary receipt bridge has a real pilot need; do not mistake it for Tulala POS or a kitchen integration. |
| A11 | Payment succeeds but capacity is lost | **SOURCE PRESENT / QA OPEN.** Refund-intent worker exists; E5 plan leaves customer recovery acceptance unfinished. | Inject lost-capacity completion, verify no admission, one recoverable refund intent, eventual provider refund and clear customer/staff communication. |
| A12 | Session reschedule and held-seat expiry | **DOCUMENTED integration gap.** A hold-extension primitive exists; complete session-end reschedule application was not established. | Trace every reschedule writer; atomically validate new resource availability and repair/reject affected holds under an explicit policy. Never silently expire promised door holds. |
| A13 | Festival page design review | **DOCUMENTED design acceptance gap.** Picker delivery does not close the broader page-builder/creative review. | Accept mobile layout, content, states, accessibility and themed dedicated event page against actual tenant data. |
| A14 | Walk-up card ticket sales | **DEFERRED.** Door settlement is not proof of a complete walk-up card selling surface. | Deliver through the POS/event slice after order/payment/admission gates pass. |
| A15 | Offline door scanning | **DEFERRED.** No offline admission guarantee established. | Define revocation, duplicate scans across devices, synchronization and conflict handling before implementation. |
| A16 | Wallet passes / PDF tickets | **DEFERRED.** | Deliver revocable, privacy-conscious exports after admission identifiers and reissue rules are stable. |
| A17 | Waitlist, embed, transfer and reissue | **DEFERRED; split into separate tickets.** | Specify queue fairness and timed claims; embed context/auth; transfer ownership and revocation independently. |
| A18 | Seat maps / alternate layouts | **DEFERRED in event phase; broader resource design remains required.** | Shared physical-resource identity, layout exclusivity and atomic assignments; a second layout must not double capacity. |
| A19 | Deposit tickets / multi-event carts | **DEFERRED.** Existing general deposit support is not proof of these composite flows. | Define entitlement timing, mixed cancellation/refund rules and multi-session hold failure compensation. |

Evidence: [open issue #1812](https://github.com/orantene/impronta-app/issues/1812), [open issue #1782](https://github.com/orantene/impronta-app/issues/1782), [PR #1932 acceptance checklist](https://github.com/orantene/impronta-app/pull/1932), [PR #1933 acceptance checklist](https://github.com/orantene/impronta-app/pull/1933), [session writer](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/sessions/session-writer.ts), [event uniqueness migration](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/supabase/migrations/20261229000714_sessions_event_night_uniq.sql), [homepage call site](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/app/page.tsx), [business metadata](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/site-admin/server/tenant-home-meta.ts), [guest picker](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/site-admin/builder-node/ticket-picker-island.tsx), [E5 plan](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/events-e5-guest-checkout-design.md), [refund-intent worker](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/app/api/cron/ticket-refund-intents/route.ts).

**Migration design detail:** the observed event unique key includes venue_id but not space_id. The migration itself records the limitation for future multiple rooms within a venue. Extend that identity deliberately with Spaces; do not loosen uniqueness globally. A unique-index migration can also fail against existing duplicates: inspect and reconcile first, never delete sold sessions automatically.

### B. Additional unfinished-work register

These items extend Cursor's list. Similar-looking rows are kept separate when they require different owners or release evidence.

| ID | Workstream | Evidence/status | Development task and done condition |
|---|---|---|---|
| B01 | Print export integration | **GAP.** Print extraction currently returns null; export route returns an unavailable response for that condition. | Connect the actual design extractor to the published design revision; authorized export produces a usable file. |
| B02 | Print QR/link bindings | **GAP.** Inspected export route initializes sheet items as an empty list. | Resolve real link-set items, placement and revision binding; verify exported codes scan to the intended tenant destination. |
| B03 | Print canvas end-to-end acceptance | **DOCUMENTED.** Designs and partial delivery exist; an exporter alone does not complete the editor journey. | Create/edit/save/publish/export/reopen; multi-page layout, bleed/print dimensions where offered, stale revision handling and physical scan checks. |
| B04 | Sessions collision operator experience | **DOCUMENTED precise gap.** QA file says DST collision refusal only reaches structured logs. | Operator-visible failed-session list with affected date/resource, reason and repair action; prove it in the actual UI. |
| B05 | Searchable business-type settings | **PROPOSED extension of existing engine.** There are 20 preset IDs in inspected source, not 120 delivered presets. | Map the companion business taxonomy onto reusable preset families; searchable registration/settings selection, preview, explicit save and versioned migration. |
| B06 | Capability-to-theme mapping | **PROPOSED extension.** Existing presets already bundle words, features and site suggestions. | Extend current capability coverage for POS, classes, resources and hybrids; one stable module ID despite different labels. |
| B07 | Discount owner management | **PARTIAL.** Tenant-scoped percent/fixed promo resolution exists. A complete seller Discounts management experience was not established. | Tenant and talent-owned create/edit/deactivate, dates, scope, usage limits, permissions and audit trail; distinguish seller promotions from Tulala subscription coupons. |
| B08 | Discount redemption correctness | **PARTIAL; verify integration.** Resolver documents advisory count checks and an authoritative redemption operation. | Verify every purchase entry point reaches the authoritative concurrency-safe redemption; refunds/cancellations follow an explicit redemption-restoration rule. |
| B09 | Discount POS / quote / online parity | **PROPOSED integration requirement.** | Same calculation contract for website, quote, booking balance and POS; show original amount, discount, deposit, balance and receipt attribution. |
| B10 | Pricing and marketing capability claims | **DOCUMENTED reconciliation work.** September pricing audit distinguishes corrected code claims from unresolved DB-backed claims. | Reconcile live product_features and actual enforcement; only advertise proven capabilities. Do not repeat historical claim counts as current live counts. |
| B11 | Guest identity lifecycle | **DOCUMENTED structural program.** Genuine commerce still needs safe identity relationships; profile-view provisioning was separately corrected. | Identify remaining writes, nullable/FK implications and deduplication; keep guest checkout possible without fabricating account consent or cross-tenant visibility. |
| B12 | Workspace Sales destination | **PROPOSED integration.** Shared naming does not merge booking and payment state. | One filtered destination, stable subtype detail links and permissions; free reservations remain valid without dummy paid orders. |
| B13 | Native POS shell | **PROPOSED.** | Open POS / Back to Workspace; location/register/operator context; persistent open sales; enabled industry views and touch/keyboard access. |
| B14 | Open-order lifecycle | **PROPOSED extension of purchase services.** | Editable drafts, submitted items, cancellation/void permissions, revision conflict handling and immutable settled financial history. |
| B15 | Mercado Pago merchant connection | **PROPOSED.** No working Point adapter established. | Merchant authorization, token lifecycle, account/location ownership, country/model capability checks and disconnect behavior. |
| B16 | Point payment lifecycle | **PROPOSED.** | Create/retrieve/cancel payment request, pending recovery, verification, refunds and replay-safe order allocation. |
| B17 | Imported transactions and reconciliation | **PROPOSED.** | Import with provider/account-scoped IDs and history boundaries; unmatched queue, fees/net/settlement distinction, no fabricated line items or admissions. |
| B18 | Cash register operations | **PROPOSED.** | Cash tender/change, opening float, paid-in/out, closing count, discrepancy review and actor audit; Back to Workspace does not close shift. |
| B19 | Restaurant/bar preparation | **PROPOSED.** | Explicit submit-to-preparation, routing by station, acknowledgements, item amendments/voids, recovery and preparation timing. |
| B20 | Tables and open checks | **PROPOSED extension.** | Occupancy, linked reservation, check ownership, moves/merges under permissions and clean settlement state. |
| B21 | Multi-person/resource scheduling | **PROPOSED extension.** | Atomically reserve several professionals and resources; buffers, travel, recurring changes and timezone rules; no private customer leakage across workspaces. |
| B22 | Class/event walk-in selling | **PROPOSED.** | POS purchase uses the same capacity and admission rules as online; attendance/check-in separate from payment. |
| B23 | Receipts and customer follow-up | **PARTIAL; extend existing receipts.** | Unified payment allocation details, localized labels, allowed delivery channels and refund links; consent and access controls retained. |
| B24 | Public integration platform | **PROPOSED.** Internal server actions are not a supported external API. | Versioned commands/read models, scoped authorization, webhooks, sandbox examples, contract tests and developer documentation. |
| B25 | Offline POS and hardware | **DEFERRED product work.** | Separate safe offline browsing/drafts from offline payments and admission; qualify printers, cash drawers and terminals individually. |
| B26 | Hybrid bundles and recurring services | **PROPOSED.** | Explicit constituent services, sessions, spaces and entitlements; partial failure, repricing and cancellations; renewals do not imply resource availability. |
| B27 | Observability and operational recovery | **PARTIAL infrastructure; new flows need proof.** | Correlate purchase/provider/hold/admission/preparation IDs; actionable exception queues, retries, alerts and owned runbooks. |

Source anchors: [print extraction](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/links/print-extraction.ts), [print export route](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/app/(workspace)/[tenantSlug]/admin/print/[id]/export/route.ts), [print design](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/print-canvas-design.md), [sessions QA](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/qa/sessions.md), [20-preset registry](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/words/presets.ts), [preset settings](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/words/settings.ts), [signup inference](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/words/signup-preset.ts), [promo resolver](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/promo-resolve.ts), [shared purchase](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/src/lib/orders/purchase.ts), [pricing claim audit](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/pricing-claim-audit-2026-09-05.md), [guest identity program](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/guest-identity-program.md).

### C. Configuration, release and historical reconciliation queue

**Do not relabel these as confirmed current bugs.** The owner checklist is dated September 6 and other handoffs are older. Recheck evidence before changing infrastructure or opening duplicate issues.

| ID | Recorded work | Audit treatment / next verification |
|---|---|---|
| C01 | Authenticated admin QA access | September owner checklist records a blocked sign-in path. Arrange supported authenticated access; never bypass a denied authorization. This blocks acceptance proof, not all source development. |
| C02 | Appointments manager findings/session | Recover the linked findings and merged PR acceptance notes; a missing agent/session is coordination debt, not proof that appointments are missing. |
| C03 | tulala.digital MX/SPF | Checklist records platform-mail bounce despite tenant Reply-To correction. Verify current DNS and delivery; then repair through authorized DNS workflow. |
| C04 | El Paisa paid ticket proof | Checklist records a real-card gate. Use safe provider test-mode first; retain separate explicit authorization for live money movement. |
| C05 | Instagram/TikTok application configuration | Owner sign-in was recorded done; secret/config placement still listed. Verify deployment configuration and actual OAuth/callback proof without exposing credentials. |
| C06 | Stripe refund event subscription | Checklist says refund.failed and refund.updated were missing from live subscriptions. Verify dashboard configuration and handler delivery evidence. |
| C07 | Unreachable Stripe assistant connector | Tooling/access issue; not an app payment defect. Resolve only if needed for the release task. |
| C08 | Launch event date, address, capacity | Historical missing facts may already be supplied. Compare published event configuration and approved brief before changing anything. |
| C09 | Sentry access/configuration | Checklist records DSN without authenticated access/token. Verify what error visibility the operators actually have and close the monitoring gap. |
| C10 | Global Payouts v2 activation/onboarding | June status records activation, opt-in, webhook and live-proof tasks; later money PRs exist. Reconcile current rail behavior before claiming these all remain open. Keep this separate from Point collection. |
| C11 | Media permissions/release workflow | August execution plan records access-model decisions, release notifications, silent saves, duplicate/withdraw requests and quota UX. Recheck each against current code and subsequent PRs; do not infer a current vulnerability from an old plan. |
| C12 | Multilingual builder/content | June status includes an interrupted branch; later merges may supersede it. Test current build and EN/ES content editing; do not report main as broken from the old note. |
| C13 | Field-engine unification | Plan retains reader migration/removal work. Trace present imports and actual data dependencies before retiring compatibility paths. |
| C14 | Social feeds, GSC analytics, email branding | Separate provider configuration/verification from code delivery. Tenant-email branding PR #1925 is merged; this does not prove all provider setup is complete. |
| C15 | Talent/client dashboard and review polish | Reconcile July plans and longtail handoff; several rows already say DONE. Promote only surviving UX gaps to active tickets with a reproducible route. |
| C16 | Old SaaS O1–O7 and transitional debt | Trackers still mention earlier domains and phases. Treat as documentation drift until checked against current routing, membership and migrations. Do not re-open all seven as new architecture blockers. |
| C17 | Print/menu/reservations/capacity plan checkboxes | Later PRs and appendices supersede early “not built” statements. Normalize status against source and QA artifacts, not raw unchecked-box totals. |
| C18 | Old worktrees, orphan routes, fixture cleanup | Distinguish local cleanup from product debt. Prove lack of imports/traffic before deleting code; production test data requires a separate scoped cleanup process. |

Sources: [owner checklist](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/owner-hands.md), [historical payout status](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/global-payouts-status-2026-06-04.md), [media execution plan](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/execution-plan-2026-08-15.md), [historical multilingual status](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/multi-language-STATUS-2026-06-15.md), [field plan](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/field-engine-unification-65-to-100-plan.md), [polish handoff](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/web/docs/handoffs/premium-finish-longtail.md), [old open decisions](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/saas/open-decisions.md), [transitional tracker](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/saas/transitional-debt.md), [feature board](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/plans/platform-features-board.md), [decision log](https://github.com/orantene/impronta-app/blob/749737206b6d8890442ab98a325f46d5873b7837/docs/decision-log.md).

### D. What to reuse and what to extend

| Existing foundation observed | Reuse now | Extension needed for these journeys |
|---|---|---|
| Shared createPurchase pipeline | Pricing/policy evaluation, customer linkage, capacity and source-channel concepts | Stable draft/submission commands and POS-safe retries; prove all channels use the same rules |
| Order completion and payment separation | Existing deposit-aware completion behavior | Multiple provider allocations, terminal recovery, cash lifecycle, adjustments and reconciliation |
| Capacity pools, holds and session writers | Authoritative capacity instead of item inventory | Multi-resource atomicity, reschedule repair, layout identity and operator exception handling |
| Tickets, receipt and door desk | Admission identity and check-in flow | Complete paid/complimentary/door recovery proof; later POS walk-ins and reissue |
| Tenant promo engine | Percentage/fixed rules and scoped eligibility | Seller/talent UI, online/POS parity and redemption lifecycle proof |
| Industry words registry | Existing presets, overrides and feature-aware wording | Search taxonomy, family mapping, versioning and hybrid capability composition |
| Roster, inquiry/offer/booking workflows | Preserve the agency/talent workflow | Link commercial records and resource scheduling without requiring POS for agencies |
| Print/link/editor foundations | Existing layout and export primitives | Actual extraction and link bindings plus complete editor acceptance |

**Do not create a new engine simply because a navigation label changed.** Sales is the combined workspace destination. Its views can include orders, bookings and reservations, while underlying records retain their own lifecycle and authorization. Orders describe commercial obligations; bookings describe scheduled commitments; payments describe money movements.

### E. Engine architecture for sustainable growth

Recommended starting architecture: a modular monolith within the current application and database, with explicit domain interfaces and durable asynchronous jobs. Extract a service only when measured load, isolation requirements or team ownership justify it. Avoid a second database of “POS orders” and avoid adopting microservices solely to appear modern.

| Engine / boundary | Authoritative responsibility | Required design rules |
|---|---|---|
| Identity and seller relationships | Person, workspace membership, customer relationship, talent relationship and seller of record | Authenticated actor plus tenant scope on every command; separate a professional's private customers from a business assignment; no silent cross-workspace identity enrichment |
| Catalog and pricing | Offerings, variants, extras, price snapshots, tax inputs and discounts | Stable IDs independent of labels; server-computed minor-unit money; currency explicit; historical order prices do not change with catalog edits |
| Commercial orders | Line items, revisions, commercial status and allocations | Idempotent creation; revision checks on edits; paid records adjusted through explicit actions; free reservations need no artificial charge |
| Booking and scheduling | Commitments, service duration, assigned people and location/time | Timezone-aware recurrence; buffer/travel rules; reschedule command with affected-record preview and rollback/compensation plan |
| Capacity and physical resources | Holds, allocations, spaces/stations/seats and session capacity | Database-enforced concurrency; bounded hold expiry; one physical resource across alternate layouts; unique session identity grows to include actual room identity |
| Payments and reconciliation | Attempts, provider transactions, allocations, refunds, fees, settlement and cash | Provider IDs scoped to merchant account; financial ledger/history; pending is not paid, paid is not settled; refunds use original tender |
| Admissions and entitlements | Right to attend, use or receive a component | Grant/revoke rules independent of display labels; one-time check-in where applicable; cash food sale does not mint event admission |
| Preparation and fulfillment | Accepted work items, routing, readiness, pickup/delivery and completion | Submit once; acknowledged routing; amendments versioned; no lost or repeated preparation from payment/webhook retries |
| Industry configuration | Preset family, vocabulary, optional capabilities and website suggestions | Versioned presets; tenant overrides preserved; selecting a theme does not grant plan entitlements or rewrite existing commerce data |
| Communications and relationships | Receipts, operational messages, consent, reviews and customer context | Transactional vs promotional delivery distinct; tenant brand and locale; retry deduplication and recipient access checks |
| Integration and automation | External commands, event delivery, provider adapters and connected apps | Scoped credentials, durable inbox/outbox, retries, replay visibility and API compatibility |
| Analytics | Read models derived from authoritative events/records | Track source, location, business type and tender without double-counting imports; separate gross, discounts, refunds, fees, net and settlement |

**Transactional pattern:** validate permissions and command input; acquire required database locks; persist the domain change and outbox event in one transaction; perform provider/network work asynchronously where suitable; record the result through idempotent handlers. A distributed provider payment cannot be made atomic with a database seat allocation. Define compensation, including refund/recovery when payment succeeds but entitlement cannot be granted.

**State boundaries:** keep commercial, payment, fulfillment, booking and admission states separate. An appointment can be confirmed while a balance remains due. A paid ticket can be refunded and its admission revoked. An imported terminal transaction can remain unmatched without inventing a customer order.

**Scale deliberately:** index tenant/location/status/time queries; use cursor pagination; bound recurring expansion and hold duration; queue large imports and analytics work; measure lock contention and queue age. Set explicit tenant quotas and load targets before release. No architecture can honestly promise unlimited growth without capacity planning.

**Migration discipline:** extend existing contracts incrementally, backfill in bounded batches, compare old/new reads where needed, introduce constraints after reconciliation, and retain rollback compatibility. Do not dual-write money through independent engines. Record migration IDs and applied evidence in the release ticket; future-looking filename timestamps are not proof of rollout.

### F. Public API and integration strategy

A public API makes Tulala extensible. It does **not** require publishing the private application source code. Open-source SDKs, examples and connector templates can be a later distribution decision.

**What to learn from other platforms:** Loyverse's published developer guide describes completed-receipt creation, a single payment entry for that creation flow, and no API-created open tickets routed to KDS. That makes a receipt bridge useful for reporting, but insufficient for Tulala's live restaurant workflow. Do not synchronize seat capacity as inventory. [Loyverse developer guide](https://loyverse.town/topic/8463-loyverse-api-guide-key-developer-tips-limits-and-mistakes-to-avoid/)

Square documents orders with line items, adjustments, fulfillment, source attribution and linked payments. This supports separating those responsibilities in our own contract; it is not a recommendation to replace Tulala's engine with Square. [Square Orders API](https://developer.squareup.com/docs/orders-api/what-it-does)

Stripe documents webhook delivery that must account for retries, duplicate events and ordering. Use verification and replay-safe handling, with operational visibility. [Stripe webhook documentation](https://docs.stripe.com/webhooks)

**Proposed API surface — design contract, not existing routes:**

| Resource family | Initial commands / reads | Example event |
|---|---|---|
| Catalog | List offerings, variants, modifiers and published prices | catalog.offering.updated |
| Availability | Query slots/resources; create/release short-lived holds | capacity.hold.expired |
| Orders | Create draft; add/update lines with expected revision; submit; retrieve | order.submitted |
| Bookings | Create from accepted terms; reschedule; cancel under policy | booking.rescheduled |
| Payments | Create collection attempt; query; request eligible refund | payment.confirmed / refund.completed |
| Preparation | Submit items to a station; acknowledge; mark ready | preparation.ready |
| Admissions | Retrieve authorized entitlement; check in; revoke/reissue | admission.checked_in |
| Customers | Read/write only permitted seller relationships | customer.updated |
| Integrations | Configure subscriptions; inspect failed deliveries; replay | integration.delivery.failed |

Use `/api/v1/...` as the proposed public namespace, with an OpenAPI contract, explicit errors and generated client types. Internal adapters should call the same domain commands, not make network calls to the app's own public endpoints unnecessarily.

**Required platform contract:**

1. Tenant-scoped authorization at both HTTP and domain boundaries. Scope examples: orders.read, orders.write, payments.collect, refunds.write, bookings.write and admissions.check_in. Connected-app authorization never outranks operator permissions.
2. OAuth for third-party merchant connections; tightly scoped revocable credentials for supported first-party/server use. Never expose provider secrets to the POS browser.
3. Idempotency key scoped by tenant, actor/app and operation; persist request hash and response; reject key reuse with different input. Revision checks prevent two terminals overwriting a check.
4. Pagination, filtering, rate limits, bounded expansion, clear currency/timezone contracts and stable machine-readable error codes.
5. Signed outgoing webhooks with event ID, schema version, tenant context, occurred_at and correlation ID; minimal personal data; retry backoff, dead-letter queue and authorized replay. Delivery is at-least-once, not an exactly-once promise.
6. Durable webhook inbox for provider events; verify signature/account context, deduplicate and reconcile current provider state when events arrive out of order.
7. Developer sandbox, sample merchants, test clocks/expiry fixtures and failure simulators. Publish a tested create-order → collect → receipt example and an online-order → preparation example.
8. Versioned event schemas, additive-change policy, documented deprecation windows and contract tests against maintained clients.
9. Connector import mapping with external IDs and source attribution. Imported data must not loop back into the source as another sale.
10. Start with private pilot API consumers; publish a supported public API only after authorization, recovery, documentation and support ownership are proven.

**Optional Loyverse bridge:** if a pilot already uses Loyverse, choose one explicit reporting direction first. Map completed sales and external receipt IDs; make replay safe; expose unmatched records; determine who owns refunds. Keep Tulala tickets/admissions authoritative. Do not build a bidirectional catalog/capacity sync as the initial delivery.

### G. Mercado Pago / Stripe product contract

The product name for payment integration is **Mercado Pago**, including **Point** terminals. Mercado Libre marketplace integration would be a separate connector.

Current Mexican Point documentation describes terminal payment orders and payment notifications, and lists Point Smart 1 and 2 as integrable models. Confirm the actual merchant country, account and hardware before committing to a pilot. [Point overview](https://www.mercadopago.com.mx/developers/en/docs/mp-point/overview)

The current migration guidance directs new Point capabilities to the **Orders API**, including idempotency, order status, cancellation and refund resources. Design the new adapter around that supported interface rather than an assumed legacy Payment Intent implementation. [Point Orders API guidance](https://www.mercadopago.com.mx/developers/en/docs/mp-point/migrate-payment-intent-to-orders)

In Settings → Payments & Integrations, configure connections and then choose eligible defaults **per channel/location**, rather than one irreversible global Stripe-versus-Mercado-Pago switch. Preserve the provider of historical payments. An online Stripe deposit and a supported Point balance payment can allocate to one Tulala order, while each refund remains tied to its original transaction.

A Mercado Pago payment order is an external provider object. Store its ID separately from the Tulala commercial order ID. Terminal collection, online checkout, transaction-history import and payouts are separate capabilities; do not infer that enabling one enables all four.

**Adapter acceptance matrix:** country; supported terminal model; merchant ownership; test environment; create/query/cancel/refund; signed notification validation; timeout recovery; token refresh/revocation; supported history period; fees and settlement reporting. Fill this matrix from current provider documentation and pilot evidence before marking the connection available.

“All transactions in Tulala” must mean all supported, authorized transactions within documented API/history coverage. Unmatched imports remain visible for reconciliation. Do not fabricate item details, seat reservations or customer identity from a terminal total.

### H. Delivery sequence and developer work packages

Use dependency gates, not a calendar promise unsupported by team capacity. Scope each work package into reviewable PRs with its own acceptance evidence.

| Phase | Work packages | Suggested accountable roles | Exit gate |
|---|---|---|---|
| 0 — Establish release truth | Reconcile A01–A13, C01–C09; compare migration state and live configuration; normalize stale boards | Technical lead + QA + product owner for external configuration | Every event launch blocker has source, deployment/config and acceptance status; no contradictory “done” claims |
| 1 — Finish current event commerce | Complimentary QR, paid test checkout, pay-door settlement, promo picker, lost-capacity refund, reschedule repair and operator errors | Commerce engineer + frontend engineer + QA | Complete event acceptance matrix below; no known oversell, duplicate entitlement or unrecoverable paid order |
| 2 — Shared contracts and operational foundations | Extend order revisions, payment allocations, outbox/inbox, capability registry and core metrics; complete relevant discount management | Backend lead + platform engineer | Existing website/agency flows remain compatible; new commands pass concurrency and tenant-isolation tests |
| 3 — Thin POS vertical slice | One location: open existing appointment/order, agreed extras, calculate balance, cash + receipt; persist and resume sale | POS frontend + commerce engineer + designer | Nail/service counter scenario works without visiting separate management pages; agency workflow unchanged |
| 4 — Point pilot and back office | Country/model validation; connect one merchant; terminal lifecycle; unmatched imports and reconciliation | Payments engineer + QA + authorized merchant operator | Test-mode failure matrix passes; any live proof separately authorized; no duplicate charge under timeout/retry |
| 5 — Hospitality operations | Tables/checks, pickup timing, preparation routing, amendments, shift accounting; adapt sushi/takeaway/home-food scenarios | Operations frontend + commerce/backend + hospitality pilot | Dine-in and pickup orders reach correct preparation station; staff can recover failures without losing sale |
| 6 — Hybrid resource journeys | Multiple workers/rooms, mixed class/event/service bundles, travel buffers and recurring service constraints | Scheduling engineer + domain QA | Resource concurrency and partial-cancellation scenarios pass across several business families |
| 7 — External ecosystem | Documented API, scoped OAuth, signed events, sample app and one partner integration | Platform/API engineer + support owner | External developer completes supported flows using public documentation; revocation/replay/version tests pass |
| 8 — Advanced operations | Offline strategies, hardware expansion, wallets/reissue/waitlists and richer automation | Dedicated owners based on pilot evidence | Each capability has explicit limits, operational recovery and measured demand |

Print completion (B01–B03), surviving media defects and social/marketing configuration should have separate owners and can proceed alongside commerce once their dependencies are clear. Do not hold payment correctness hostage to a complete website redesign.

**First planning session should produce six concrete tickets:**

1. A01/A02 remediation verification with migration/tenant evidence and issue closure criteria.
2. A03–A06 admin + complimentary + pay-door acceptance proof, with safe configured test records.
3. A07/B07–B09 shared discount UI and redemption contract.
4. A08/A09/A11 payment-to-admission failure and recovery matrix.
5. A12/B04 reschedule/expiry and operator-visible scheduling exceptions.
6. B13/B14 native POS vertical-slice specification using existing purchase contracts.

Each ticket records: problem and affected persona; current source path; what is already reusable; dependencies; schema/API change; permission model; acceptance steps; failure cases; instrumentation; rollout flag; rollback conditions; owner; evidence links. Estimate after tracing its actual dependencies. Do not estimate a whole multi-industry POS from the size of a receipt API bridge.

### I. Release acceptance matrix

| Scenario | Required proof |
|---|---|
| Duplicate event scheduling | Concurrent retries at same event/time/venue yield one session/pool set; legitimate different venues remain possible; room-within-venue limitation is explicitly tracked |
| Last available seat | Two buyers contend; at most one obtains entitlement; losing payment path is prevented or compensated visibly |
| Complimentary purchase | Zero amount does not require a fake provider charge; one receipt and one scannable admission |
| Pay at door | Eligible option appears; expiry policy is visible; unpaid state stays unpaid; settlement grants entitlement once |
| Promo concurrency | Final allowed redemption cannot be consumed twice; website and POS totals match; excluded item remains full price |
| Paid but no capacity | Exactly one recovery process; no orphan paid order; guest and staff can see refund state |
| Reschedule | All affected holds/people/resources are evaluated; failures leave a coherent original commitment or explicit repair state |
| Deposit plus terminal balance | Previously paid deposit credited once; terminal timeout/retry does not duplicate collection; total allocations reconcile |
| Refund | Original provider/tender used; partial refund does not accidentally cancel unrelated bundle rights; ledger and receipt reconcile |
| Restaurant + pickup | Same menu prices; correct preparation routing and pickup slot; amendments do not resubmit all prior items |
| Spa with two therapists and one room | One availability decision; competing booking cannot claim any committed component |
| Talent across agencies/private clients | Busy time prevents conflicts while private client identity and commercial terms remain isolated |
| Industry theme change | Labels/default views change; stable URLs, historical records, permissions and existing overrides remain valid |
| External import + webhook replay | One financial record despite polling/webhook duplicates; no export/import loop; unmatched record remains actionable |
| Two POS operators | Stale edit is detected, not silently overwritten; submitted preparation and collected money remain consistent |
| Leaving POS | Open order persists; pending terminal attempt visible; register stays open until explicit shift close |

Use provider test modes, deterministic database concurrency tests and targeted browser acceptance. For release, follow repository-required exact-head quality gates and migration/production-pointer process. Store evidence with revision, environment, tenant, scenario and outcome. A green screenshot without the underlying financial/admission proof is insufficient.

### J. Innovation roadmap grounded in these engines

These are proposed differentiators to validate with customers, not claims that nobody else offers them.

| Opportunity | Concrete experience | Prerequisite and guardrail |
|---|---|---|
| One professional across multiple businesses | Tania accepts private massage work while spas see only assignable free/busy time | Shared scheduling with relationship-level privacy and explicit authority |
| Composable business packages | Venue + chef + performers + seats + timed services purchased as a coordinated experience | Component holds, seller allocations, entitlement policy and compensating actions |
| Recovery-centered operations | Staff see “payment received, admission pending” with a safe retry/refund action | Correlated state, durable jobs, verified permissions and audit trail |
| Contextual POS | Nail salon opens today's clients; restaurant opens tables; tour guide opens departures | Preset families over the same engines, not 120 separate apps |
| Assisted onboarding | Business search suggests labels, pages, services and booking settings, then previews changes | User confirmation, versioned configuration and no fabricated business claims |
| Assisted operations | Suggest schedule alternatives, demand-based staffing or matching an imported payment | Explainable proposals; human approval for charges, refunds, discounts, booking changes and data sharing |
| Integration-ready fulfillment | Website or partner app can submit live work to preparation, not just report a completed receipt | Supported command API, station acknowledgement, retries and partner authorization |
| Hybrid business analytics | Compare food, admission, services and space revenue without counting one payment twice | Stable attribution and read models over shared commercial records |

Do not introduce autonomous pricing, commitments or money movement as a shortcut. AI should initially draft, recommend and explain through the same permission-checked commands used by staff.

### K. Final product and build decision

Tulala's product is a shared business platform with industry-specific presentation and operating defaults. POS is an optional selling mode. The 48 journeys are a reusable acceptance library; the full vocabulary and business-type taxonomy remain in **Business-specific-labels-Workspace-Theme.md**.

Build once where rules are shared: pricing, discounts, commercial records, capacity, payments, admissions and permissions. Extend deliberately where operational behavior differs: kitchen preparation, appointments, group attendance, custom projects and physical-resource allocation. Keep inventory excluded.

The immediate engineering goal is **a proven commerce foundation and one complete POS slice**, followed by a qualified Point integration and hospitality expansion. Finish current event promises, retire contradictory status records, and make every next capability traceable to an owner, dependency, acceptance test and release gate.

