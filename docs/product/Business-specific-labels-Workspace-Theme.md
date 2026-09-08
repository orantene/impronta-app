# Business-specific labels - Workspace Theme

Version 1.0 | 8 September 2026 | Development specification and product decision record

Companion: Tulala-Business-Journeys-POS.md, version 1.4. This specification records the latest navigation decisions and supersedes earlier menu proposals in that document. It describes intended behaviour, not verified implementation. The business directory is a brainstorm of potential customers, not a market-size study or a claim that every industry is supported today.

## 1. Product objective

One Tulala platform should feel appropriate to a nail technician, restaurant, talent agency, yoga studio and event venue. A searchable business-type selector provides a useful starting workspace: familiar labels, relevant modules, operational defaults and, later, suitable Page Builder suggestions. It must not create a separate application, database or payment system for each industry.

Registration asks “What kind of business do you run?” Settings lets the owner revisit that answer. Selecting Nail salon can suggest Services, Nail Technicians, Clients and Stations, with Appointments and appointment-focused POS. Selecting Restaurant can suggest Menu, Guests and Tables & Spaces, with Reservations and table-focused POS. The underlying feature identifiers remain stable.

Business type is independent of subscription plan, legal seller, payment country, language, number of locations and whether someone also has a talent profile. A massage therapist may work for a spa while operating a private practice. Selecting Massage therapist does not create a second business automatically or change where money is collected.

No inventory module, stock tracking, supplier purchasing or inventory-based defaults are included. Capacity and time-limited resource availability remain in scope.

## 2. Five separate configuration layers

| Layer | Responsibility | Example | Must not do |
|---|---|---|---|
| Business identity | Describes the workspace | Nail salon; secondary type Beauty academy | Decide legal/payment identity from a label |
| Workspace vocabulary | Navigation and entity display names | Catalog becomes Services | Rename database entities or URLs |
| Operational preset | Suggests modules, default views and setup tasks | Appointments; stations; reception POS | Enable unbuilt features or grant permissions |
| Visual workspace appearance | Approved density, theme and accessibility preferences | Existing Tulala light/dark appearance | Change prices, rules or customer data |
| Public website theme | Page Builder templates, brand tokens and sections | Salon portfolio with Book appointment CTA | Overwrite or publish an existing site automatically |

“Workspace Theme” in this document covers vocabulary and operational presets as well as their future connection to appearance. It is not a single switch that mixes all five layers. Provide separate controls in Settings and explain the scope of each.

## 3. Final workspace navigation

Open POS appears in the header and navigation when enabled and authorised. Overview remains the main entry point. The full list below is the platform superset; an individual business sees its enabled subset.

| Group | Canonical navigation items |
|---|---|
| Always visible | Overview; Open POS when eligible |
| Operate | Inbox; Calendar; Sales; Customers |
| Sell | Catalog; Appointments; Reservations; Classes; Events & Tickets |
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
| Begin collection | **Charge** | Fixed. Opens methods for the outstanding amount. Do not substitute Confirm Booking or Complete Visit. |
| Payment methods | **Mercado Pago Point / Stripe Terminal / Cash** | Only enabled, supported choices. Other methods require separate integration and exact method labels. |
| Receipt/refund history | **Receipts & Refunds** | Fixed default. Receipts-only view for staff without refund rights; do not call refunds Returns unless an actual returns workflow exists. |
| Cash operations | **Shift & Cash / Register & Cash** | Location/register operational vocabulary; role and capability gated. |
| Attendance | **Check In / Mark Arrived** | Check In for valid admission/attendance; Mark Arrived for a scheduled visit. Neither charges the customer. |
| Service completion | **Complete Visit / Complete Service** | Operational completion only, subject to policy; does not silently collect a balance. |
| Exit mode | **Back to Workspace** | Fixed. Does not close shift, cancel saved orders, reverse payment or drop an in-flight charge. |

Fixed financial labels include Total, Tax, Discount, Deposit Applied, Paid and Balance Due, each shown only when applicable. Pending, Approved, Declined, Unknown, Refunded and Settled remain separate states with the correct business meaning. Display translations through reviewed locale dictionaries, never through an industry preset.

For the sidebar, avoid duplicate destinations with the same visible name. A classes-first business may use Classes & Services for Catalog and Classes for session management; provide clear page subtitles. If two resolved labels collide, retain the canonical qualified label and show the conflict in Settings preview.

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

## 7. Potential customer directory: 120 searchable business types

This is a deliberately broad initial catalog, not an exhaustive classification of every business. Each numbered row is one selectable type with an immutable ID derived from its English name using lowercase hyphens. Aliases improve search; an alias does not create another selectable type. Rows inherit their family preset and apply the listed variations. Capability recommendations do not bypass launch readiness.

Abbreviations: A = Appointments; R = Reservations; C = Classes; E = Events & Tickets; P = POS; K = Kitchen/Bar; S = Spaces & Seating; T = Roster. Sales, Inbox, Calendar, Customers, Catalog, Grow and Manage are common baseline destinations subject to permissions. “+” suggests a capability to offer during setup; it is not automatic activation. A location can override physical resources and POS context; the workspace owns the primary vocabulary.

### 7.1 Family presets and inherited labels

| Family ID | Catalog | Customers | Roster | Spaces | Recommended operational modules / POS start |
|---|---|---|---|---|---|
| beauty | Services | Clients | Specialists | Stations | A,T,S,P / Today |
| wellness | Treatments & Services | Clients | Practitioners | Treatment Rooms | A,T,S,P / Today |
| fitness | Classes & Services | Customers | Instructors | Studios & Rooms | C,A,T,S,P / Sessions |
| learning | Courses & Lessons | Learners | Instructors | Classrooms | C,A,T,S / POS optional, Sessions |
| dining | Menu | Guests | Professionals | Tables & Spaces | P,K,R,S / Tables or New Sale; T optional |
| nightlife | Menu & Experiences | Guests | Performers | Tables & Spaces | E,R,S,P,K / Open Orders; T optional |
| talent | Services & Packages | Clients | Roster | Spaces & Seating | T / Bookings; P,S optional |
| creative | Packages & Services | Clients | Creative Team | Studios & Sets | A,T,S / Bookings; P optional |
| venue | Spaces & Packages | Clients & Guests | Professionals | Venues & Spaces | R,E,S,T,P / Spaces |
| experiences | Experiences | Guests | Guides | Meeting Points | C,E,T / Sessions; A,R,S,P optional |
| professional | Services | Clients | Professionals | Meeting Rooms | A,T / Bookings; S,P optional |
| field | Services | Customers | Service Professionals | Service Locations | A,T / Today; P optional; S only for actual bookable resources |

Solo mode can hide T across families. Meeting Points and Service Locations describe places, not automatic capacity pools. Locations that are merely addresses must not be offered as reservable inventory. Row-specific default reductions take priority over family recommendations.

### 7.2 Beauty and personal care

| # | Selectable business type | Search alias (EN / ES example) | Variation from beauty preset |
|---|---|---|---|
| 1 | Nail salon | manicure / salón de uñas | Roster: Nail Technicians; bridal group allocation |
| 2 | Hair salon | hairdresser / peluquería | Roster: Stylists; spaces: Chairs & Stations; processing phases |
| 3 | Barber shop | barber / barbería | Roster: Barbers; walk-in queue requirement |
| 4 | Lash studio | eyelash extensions / pestañas | Roster: Lash Artists; longer service blocks |
| 5 | Brow studio | eyebrow shaping / cejas | Roster: Brow Specialists; consultation option |
| 6 | Makeup artist | makeup / maquillista | Roster: Makeup Artists; solo/mobile options; + custom booking |
| 7 | Bridal beauty team | wedding makeup / maquillaje de novia | Roster: Beauty Artists; group/team assignments and travel |
| 8 | Waxing studio | hair removal / depilación | Roster: Specialists; spaces: Treatment Rooms |
| 9 | Tattoo studio | tattoo artist / tatuajes | Roster: Artists; Sales starts Bookings; inquiry/reference workflow |
| 10 | Piercing studio | body piercing / perforaciones | Roster: Piercers; appointment and walk-in preparation |

### 7.3 Wellness and bodywork

| # | Selectable business type | Search alias | Variation from wellness preset |
|---|---|---|---|
| 11 | Day spa | spa / spa de día | Catalog: Treatments & Packages; roster: Therapists |
| 12 | Independent massage therapist | massage / masajista | Catalog: Services; solo; Service Locations; cross-business availability |
| 13 | Mobile massage service | home massage / masaje a domicilio | Travel buffers; service areas; no room reservation by default |
| 14 | Couples treatment spa | couples massage / masaje en pareja | Atomic allocation of two therapists and room |
| 15 | Sauna and steam bath | sauna / baño de vapor | +R; resource sessions and occupancy; T optional |
| 16 | Float therapy centre | float tank / flotación | +R; tank time and reset buffers |
| 17 | Meditation practitioner | meditation / meditación | +C; virtual or in-person sessions; no room for virtual |
| 18 | Breathwork facilitator | breathwork / respiración consciente | +C; group sessions; non-clinical presentation |
| 19 | Sound bath studio | sound healing / baño de sonido | +C,E; studio capacity and event admission |
| 20 | Wellness retreat organiser | wellness retreat / retiro de bienestar | Catalog: Retreats & Packages; +E; multi-day itinerary requires extension |

### 7.4 Fitness and movement

| # | Selectable business type | Search alias | Variation from fitness preset |
|---|---|---|---|
| 21 | Yoga studio | yoga classes / estudio de yoga | Recurring classes and private sessions |
| 22 | Pilates studio | reformer pilates / pilates | Reformer resources constrain class places |
| 23 | Personal trainer | fitness coach / entrenador personal | A first; solo; spaces optional; +C |
| 24 | Gym | fitness centre / gimnasio | Class bookings; access/membership system is a separate extension |
| 25 | Dance studio | dance lessons / academia de baile | Roster: Dance Instructors; +E for showcases |
| 26 | Martial arts school | karate / artes marciales | Course progression is an extension; class attendance in scope |
| 27 | Boxing studio | boxing gym / boxeo | Classes and private coaching; stations if needed |
| 28 | Swimming school | swim lessons / natación | Spaces: Pools & Lanes; concurrent allocation |
| 29 | Tennis coaching business | tennis lessons / clases de tenis | Spaces: Courts; +R; coach and court coordination |
| 30 | Padel club | padel courts / pádel | R first; spaces: Courts; coaching optional |

### 7.5 Learning and workshops

| # | Selectable business type | Search alias | Variation from learning preset |
|---|---|---|---|
| 31 | Language school | language lessons / escuela de idiomas | Levels/cohorts extension; classes and appointments |
| 32 | Private tutor | tutoring / profesor particular | A first; solo; virtual lessons option |
| 33 | Music school | music lessons / escuela de música | Roster: Music Teachers; rooms and instruments as time resources |
| 34 | Singing coach | vocal lessons / clases de canto | A first; roster: Vocal Coaches; solo option |
| 35 | Art workshop studio | art classes / taller de arte | C first; room capacity |
| 36 | Pottery studio | ceramics / cerámica | Spaces: Workstations; firing/production workflows outside base |
| 37 | Cooking school | cooking class / escuela de cocina | Spaces: Teaching Kitchens; C; K optional for separate sales |
| 38 | Photography school | photography course / curso de fotografía | C/A; roster: Instructors; outings may need meeting points |
| 39 | Beauty academy | beauty school / academia de belleza | C first; +A for supervised services; two participant roles |
| 40 | Corporate training provider | business workshop / capacitación empresarial | Catalog: Workshops & Packages; Customers: Clients; custom bookings |

### 7.6 Food and dining

| # | Selectable business type | Search alias | Variation from dining preset |
|---|---|---|---|
| 41 | Restaurant | dining / restaurante | Tables; R/P/K; private-dinner custom booking |
| 42 | Cafe | coffee shop / cafetería | New Sale first; reservations optional |
| 43 | Bakery cafe | bakery / panadería | Counter sales; no ingredient/stock tracking |
| 44 | Pizzeria | pizza restaurant / pizzería | Item modifiers; table or counter service |
| 45 | Food truck | mobile food / camión de comida | Counter mode; hide R/S by default; service location |
| 46 | Takeaway kitchen | takeout / comida para llevar | Pickup orders; delivery logistics separate; hide R |
| 47 | Private chef | chef at home / chef privado | Catalog: Menus & Services; Customers: Clients; custom bookings; T optional |
| 48 | Catering company | caterer / catering | Catalog: Menus & Packages; Clients; group quote and event schedule |
| 49 | Dessert shop | sweets / postrería | Counter mode; hide R; extras and preparation if needed |
| 50 | Ice cream shop | gelato / heladería | Counter mode; flavours/modifiers without stock tracking |

### 7.7 Nightlife and hospitality experiences

| # | Selectable business type | Search alias | Variation from nightlife preset |
|---|---|---|---|
| 51 | Bar | drinks bar / bar | Catalog: Menu; spaces: Tables & Booths; Open Tabs |
| 52 | Cocktail lounge | cocktails / coctelería | Booth reservations and preparation |
| 53 | Nightclub | club night / discoteca | Admissions first; E; guest tickets distinct from tables |
| 54 | Live music venue | concert bar / música en vivo | E/T; performers and guest sales distinct |
| 55 | Karaoke venue | karaoke rooms / karaoke | Spaces: Rooms; R first; time slots |
| 56 | Beach club | beach day / club de playa | Catalog: Menu & Packages; spaces: Cabanas & Seating |
| 57 | Rooftop lounge | rooftop bar / terraza bar | Layout and capacity; alternate arrangements |
| 58 | Wine tasting room | wine tasting / cata de vinos | Catalog: Tastings & Menu; +C; no cellar inventory |
| 59 | Brewery taproom | craft beer / cervecería | Catalog: Menu; +C/E tastings; no production tracking |
| 60 | Pool club | pool day pass / club de piscina | Spaces: Loungers & Cabanas; admissions versus resource rights |

### 7.8 Talent and agencies

| # | Selectable business type | Search alias | Variation from talent preset |
|---|---|---|---|
| 61 | Modelling agency | model agency / agencia de modelos | Multi-model briefs, assignments and commissions |
| 62 | Talent agency | talent management / agencia de talentos | Cross-discipline roster; Bookings default |
| 63 | Casting agency | casting / agencia de casting | Audition shortlists and multi-stage selection extension |
| 64 | Influencer agency | creator management / agencia de influencers | Campaign deliverables extension; bookings and fees |
| 65 | Music booking agency | artist booking / contratación musical | Roster: Artists; dates, locations and fee agreements |
| 66 | Entertainment agency | entertainers / agencia de entretenimiento | Multi-performer lineups and event briefs |
| 67 | Event staffing agency | event staff / personal para eventos | Roster: Event Professionals; shifts and attendance extension |
| 68 | Promotional staffing agency | brand ambassadors / promotores | Roster: Brand Ambassadors; location assignments |
| 69 | DJ | disc jockey / DJ para eventos | Solo; Catalog: Packages & Services; +E for own events |
| 70 | Live band | music group / banda musical | Roster: Musicians; collective availability and rider files |

### 7.9 Creative production

| # | Selectable business type | Search alias | Variation from creative preset |
|---|---|---|---|
| 71 | Photography studio | photo studio / estudio fotográfico | Packages; Creative Team; Studios & Sets |
| 72 | Independent photographer | photographer / fotógrafo | Solo; locations optional; direct packages and custom shoots |
| 73 | Videography business | videographer / videógrafo | Shoot scheduling; post-production delivery extension |
| 74 | Podcast studio | podcast recording / estudio de podcast | +R; room/time booking; equipment time resources |
| 75 | Recording studio | audio studio / estudio de grabación | +R; engineer and room scheduling |
| 76 | Graphic design studio | graphic designer / diseño gráfico | Hide S/A unless consultations; project milestones extension |
| 77 | Branding agency | brand design / agencia de branding | Inquiry and proposal-led; hide physical spaces by default |
| 78 | Web design agency | website designer / diseño web | Consultation + booked project; delivery workflow extension |
| 79 | Content production studio | content creator / creación de contenido | Multi-professional shoots; portfolio; custom fees |
| 80 | Floral design studio | florist events / diseño floral | Event-service packages; material inventory excluded |

### 7.10 Spaces and venues

| # | Selectable business type | Search alias | Variation from venue preset |
|---|---|---|---|
| 81 | Event venue | event hall / salón de eventos | Packages & Services; organiser and guest transactions |
| 82 | Wedding venue | wedding hall / lugar para bodas | Private bookings; setup/teardown holds; E optional |
| 83 | Conference centre | conference rooms / centro de convenciones | Multiple spaces and arrangements; organiser bookings |
| 84 | Coworking space | shared office / coworking | Catalog: Spaces & Services; Customers: Clients; desks/rooms; membership extension |
| 85 | Meeting room rental | meeting space / sala de reuniones | R first; no E/T by default; hourly blocks |
| 86 | Rehearsal room rental | rehearsal studio / sala de ensayo | Catalog: Rooms & Services; buffers; no E by default |
| 87 | Theatre | theater / teatro | E first; numbered seating and accessible seating requirements |
| 88 | Art gallery | gallery / galería de arte | Exhibitions/events/private hire; art stock/consignment excluded |
| 89 | Pop-up event space | pop-up venue / espacio temporal | Dated availability; arrangements and private bookings |
| 90 | Sports court rental | court hire / alquiler de canchas | Catalog: Courts & Services; R; no E/T by default |

### 7.11 Tours and experiences

| # | Selectable business type | Search alias | Variation from experiences preset |
|---|---|---|---|
| 91 | Local tour guide | walking tour / guía turístico | Solo; departures and guest capacity |
| 92 | Tour operator | excursions / operador turístico | Roster: Guides; departure groups; supplier workflow extension |
| 93 | Boat excursion operator | boat tour / paseo en barco | Roster: Crew; +R/S; boat capacity; weather reschedule |
| 94 | Diving school | scuba / escuela de buceo | Classes/departures; instructor ratios; certification workflow extension |
| 95 | Surf school | surf lessons / escuela de surf | Classes and private lessons; meeting point; weather policies |
| 96 | Snorkelling guide | snorkel tour / guía de snorkel | Departures and capacity; resource/safety validation before launch |
| 97 | Horse riding experience | riding tour / paseo a caballo | Time resources and group limits; animal-care system excluded |
| 98 | Food tour operator | culinary tour / tour gastronómico | Dated departures; dietary preference access; venues as itinerary |
| 99 | Escape room | escape game / sala de escape | +R/S/P; Spaces: Rooms; session-level exclusivity |
| 100 | Attraction day-pass operator | attraction tickets / entrada de día | E/P; timed admission; no hotel accommodation management |

### 7.12 Professional services

| # | Selectable business type | Search alias | Variation from professional preset |
|---|---|---|---|
| 101 | Business consultant | consulting / consultor de negocios | Consultation + accepted engagement; project deliverables extension |
| 102 | Career coach | career coaching / orientación profesional | Solo; A; private client notes |
| 103 | Life coach | coaching / coach personal | A/C optional; no clinical claims or clinical record system |
| 104 | Translator | translation / traductor | Inquiry/quote; document handling; A only for consultations |
| 105 | Interpreter | interpreting / intérprete | Time, language and location assignment |
| 106 | Wedding planner | wedding planning / organizador de bodas | Custom bookings; Roster: Event Professionals; multi-party planning extension |
| 107 | Event planner | event planning / organizador de eventos | +E if own public events; client engagement and suppliers separate |
| 108 | Interior designer | interior design / diseño de interiores | Site visits; proposals; delivery/project extension |
| 109 | Personal stylist | styling / asesor de imagen | A; mobile visits; no retail inventory |
| 110 | Virtual assistant business | admin support / asistente virtual | Remote work; booked hours; timesheets extension |

### 7.13 Local, mobile and care services

| # | Selectable business type | Search alias | Variation from field preset |
|---|---|---|---|
| 111 | Home cleaning service | house cleaning / limpieza de casas | Team assignments; travel; recurring visits extension |
| 112 | Commercial cleaning company | office cleaning / limpieza de oficinas | Customers: Clients; locations/crews; contracts extension |
| 113 | Laundry service | wash and fold / lavandería | Order-first; pickup/drop-off and production tracking extensions |
| 114 | Dry cleaning service | garment cleaning / tintorería | Order-first; garment intake/status extension; no stock |
| 115 | Pet grooming salon | groomer / estética canina | Roster: Groomers; Stations; pet profile extension linked to human customer |
| 116 | Dog trainer | dog training / adiestramiento canino | Roster: Trainers; +C; pet/owner relationship extension |
| 117 | Pet sitter | pet sitting / cuidado de mascotas | Multi-day care and pet records extension; service location |
| 118 | Mobile car detailing | car cleaning / detallado automotriz | Vehicle intake extension; mobile time and travel |
| 119 | Home organisation service | home organiser / organización del hogar | Custom quote; visit duration; solo/team |
| 120 | Handyman service | home repairs / mantenimiento del hogar | Custom quote and site visit; job completion extension; parts inventory excluded |

### 7.14 Scope boundaries and launch tiers

All 120 records may be searchable as classifications once their labels are reviewed, but availability of a classification must not imply availability of specialised workflows. Assign each type a maturity field: label-only, core-workflow-pilot, or validated-workflow. Initial state is label-only until actual delivery evidence exists. Pilot the original twelve workflows progressively; do not label every row production-ready.

Examples of extension needs: laundry production and pickup routing; pet/vehicle profiles; memberships and recurring entitlements; multi-day retreats; project milestones; credential/certification workflows; detailed staffing shifts. Surface a clear setup limitation instead of manufacturing these features through label changes. Clinical, hotel property-management, transport-dispatch and regulated financial workflows are not implicitly covered by this directory.

“Other business” is a fallback option outside the 120 types. It uses generic Services, Customers, Professionals and Spaces & Seating, then asks what the user needs to do. Allow an optional custom description without creating a new global taxonomy entry automatically.

## 8. Searchable business-type selector

### 8.1 Placement and content

Registration: after identifying the account/workspace intent, show a labelled search input “Business type,” helper “Choose the closest match. You can change this later,” and placeholder “Try nail salon, restaurant or photographer.” Do not require company branding, logo or incorporation to select a type. Offer solo professional versus business/team context without assuming a solo professional has no business.

Settings: Business profile → Business type & workspace (canonical settings.business-type destination). Show current primary type, optional secondary types, preset version, current customisations and Change business type. Website → Theme can link here, but does not change operational configuration itself.

Result row: localised type name; family; short differentiation when needed. For example, Photography studio versus Independent photographer. Search supports accent folding, case folding, common spelling errors and curated synonyms. Exact name match ranks above exact alias, then prefix, then fuzzy matches. Use stable tie-breaking and locale-aware results. Search “uñas” or “unas” finds Nail salon; “peluquería” finds Hair salon; “modelos” finds Modelling agency. “Salon” should offer Hair salon, Nail salon and Event venue if local aliases make it ambiguous, not select one automatically.

Support keyboard selection, labelled combobox/listbox semantics, announced result counts, visible focus and an explicit selection action. Preserve the typed query on no results; show Other business and an optional feedback action. Do not send customer, payment or private document data to search. Start with curated English and Spanish names/aliases; add Portuguese and other locales through reviewed dictionaries, not ad hoc label concatenation.

### 8.2 Registration flow

1. User chooses a business type or Other business.
2. Ask solo/team, fixed/mobile/online service and location context only as needed. Collect legal/payment details in their dedicated setup, not by inference.
3. Show “Suggested workspace” with four vocabulary examples and recommended modules. Separate available features from future/unavailable features.
4. User can select additional activities, such as classes, events or food service. These add recommendations without replacing the primary type.
5. Preview navigation and the POS start view if selected. Explain any plan-dependent module before activation; no automatic purchase.
6. Save the workspace configuration and begin setup tasks: create an offering, add availability, add people/resources and connect eligible payments.
7. Offer Page Builder template suggestions as a separate optional step. Preview before creating content; publish only through the website publishing flow.

Business type must not force an Agency plan, create an agency, or create a talent profile on behalf of the user. Existing talent/business relationships remain intact. Registration and Settings must use the same taxonomy and resolver, not separate hard-coded lists.

### 8.3 Changing an existing workspace

Changing Restaurant to Photography studio opens a before/after review. Show proposed label changes, new module recommendations, current modules being retained, default Sales view, POS layout and optional website suggestions. Save through an explicit Apply action. Navigation labels can update immediately after that action; operational rules with customer impact require their own configuration confirmation.

Preserve existing data, active modules with records, manual label overrides, payment settings, prices, tax behaviour, policies, team permissions and published website content. Do not turn restaurant reservations off just because the new preset does not recommend them. An unused module may be hidden through an explicit presentation toggle. Disabling new bookings is a different operational action and must leave access to historical and future existing records.

Changes apply as one versioned configuration transaction. Reject a stale edit with a readable conflict and fresh preview. Record actor, time, prior/new type, preset version and changed fields. A cashier with a pending payment keeps the current transaction context; show the new vocabulary/layout on a safe navigation boundary. Do not reload or interrupt terminal collection.

Provide Restore previous configuration as a new audited configuration version. It restores labels and defaults, not deleted records, completed payments or published pages. Module removal and website replacement have their own safeguards.

## 9. Preset composition and settings precedence

Primary type determines vocabulary and default operational layout. Secondary types add capability recommendations only; they do not fight over labels. Example: Spa + Yoga studio retains Therapists and Treatment Rooms, suggests Classes, and allows the owner to choose Professionals as a broader roster label. Restaurant + Live music venue retains Menu and Tables & Spaces, adds Events and optional Performers.

Suggested module set = union of the primary and secondary recommendations. Effective availability then intersects with implemented capabilities, plan entitlements, regional/provider eligibility where relevant, workspace activation and user permissions. A menu entry also respects navigation visibility. Hiding an entry is not authorisation: APIs and deep links still enforce permissions.

Label resolution order: explicit workspace label override → primary business-type override → family vocabulary → canonical locale default. Resolve localisation keys into the user's UI language, then apply a literal custom label only when the owner deliberately chose one. Custom labels can be locale-specific; fallback behaviour must be visible. A location can choose its operational POS layout and resources, but must not unpredictably rename the shared workspace sidebar.

Settings controls: primary type; secondary activities; recommended modules; enabled modules; navigation visibility; controlled vocabulary selections; optional custom labels; Sales default view; POS default view per location; website suggestions; appearance preferences. Show whether each value comes from a preset or a manual override. “Reset to business defaults” previews changes and resets only selected presentation fields.

Safe automatic defaults: vocabulary, initial navigation recommendations, empty-state wording and initial view. Explicit business choices: durations, capacity, opening hours, cancellation rules, deposits, prices, taxes, minimum spend, refund rules, team access, connected accounts, public publishing and plan changes. Never infer these financial or scheduling rules from industry alone.

## 10. Proposed configuration model

This is a contract proposal. Reuse existing schema/services after repository mapping; do not create parallel catalog or scheduling engines.

| Record | Required fields |
|---|---|
| business_type | Stable ID; family ID; localised name/description; aliases by locale; active/deprecated state; replacement ID if deprecated; maturity; preset reference/version |
| family_preset | ID/version; vocabulary keys; recommended modules; default Sales/POS views; setup tasks; template tags |
| type_preset | Type ID/version; vocabulary overrides; module additions/removals from recommendations; setup variations; extension requirements |
| workspace_configuration | Workspace ID; primary/secondary types; pinned preset version; manual overrides; active modules; nav visibility; default views; config revision |
| location_configuration | Location ID; compatible POS layout; resources; register association; explicit location overrides |
| configuration_audit | Workspace/actor; prior/new revisions; field diff; timestamp; reason; restore reference |
| template_recommendation | Template ID/version; type/family tags; capability requirements; supported locale; binding schema version; readiness |

Example resolved intent, before entitlement and permission evaluation:

```json
{
  "primaryBusinessTypeId": "nail-salon",
  "secondaryBusinessTypeIds": ["beauty-academy"],
  "presetVersion": "1.0.0",
  "labels": {
    "catalog": "vocabulary.services",
    "customers": "vocabulary.clients",
    "roster": "vocabulary.nailTechnicians",
    "spaces": "vocabulary.stations"
  },
  "recommendedModules": ["appointments", "roster", "spaces", "pos", "classes"],
  "salesDefaultView": "appointments",
  "posDefaultView": "today",
  "manualOverrides": {},
  "websiteSuggestionTags": ["beauty", "portfolio", "appointment-booking"]
}
```

Store label keys, not database table names or destination URLs. Schema validates allowed module IDs, valid default views, primary/secondary uniqueness and referenced preset versions. Type IDs never change when their display names are edited. Search synonyms can evolve independently of workspace configuration.

Proposed service responsibilities: list/search business types; retrieve a preset; preview a configuration diff; apply with expected revision; return resolved navigation and vocabulary; record and restore configuration history. Keep resolution deterministic and callable by registration, workspace, POS and Page Builder. The preview and apply paths must use the same resolution logic; revalidate entitlements and permissions at apply time.

Pin existing workspaces to an applied preset version. New preset releases may offer a diff but cannot silently rename businesses or activate modules. Deprecating a business type retains its historical ID and configuration until the owner accepts a suggested successor. An unknown/deleted lookup returns a generic presentation without blocking access to records.

## 11. Page Builder and public website connection

Business type supplies template suggestions and suitable empty states; actual business data supplies content. Use existing global brand tokens, navigation/footer and theme inheritance. Keep workspace appearance distinct from the public brand theme. A type change does not turn an existing website into a new template.

| Business pattern | Suggested public sections | Primary CTA | Live bindings |
|---|---|---|---|
| Salon / wellness | Services; specialists; gallery; visit details | Book appointment | Catalog, public Roster, available appointments |
| Restaurant / bar | Menu; location/hours; reservations; events | Reserve a table / View menu | Catalog, Reservations, Events |
| Agency / creative | Roster or portfolio; packages; brief form | Send inquiry | Public profiles, Catalog, inquiry flow |
| Fitness / learning | Class schedule; instructors; lesson options | Join a class | Sessions, capacity, public Roster |
| Venue / club | Spaces; arrangements; packages; event calendar | Request a booking | Public spaces, inquiry flow, Events |
| Tours / experiences | Experiences; departure dates; meeting information | Choose a date | Offerings, dated sessions, available places |
| Local / mobile services | Services; service areas; request form | Request service | Offerings, inquiry/appointment flow |

Every suggested section declares required capabilities and expected binding types. If a capability is unavailable, offer a suitable inquiry CTA or omit the section; do not render a broken booking button. Draft demo content must be marked and must not create fake operational appointments, people, prices or reviews. Preserve manual edits, SEO URLs, uploaded media and public profile permissions. Template import is previewable, reversible as draft content and separately publishable.

Later onboarding can suggest a complete starter site, but initial delivery should focus on reliable type selection and workspace vocabulary. Website templates, marketing industry pages and onboarding recommendations should share taxonomy IDs so they do not drift into incompatible categories.

## 12. Delivery sequence and ownership

| Phase | Work | Exit evidence |
|---|---|---|
| 0. Map existing implementation | Map nav/route IDs, labels, entitlements, business fields, page templates and twelve journeys to existing code | Gap register distinguishes implemented, partial, missing and untested |
| 1. Vocabulary foundation | Stable registry; reviewed EN/ES terminology; canonical navigation; label resolver; first 12 presets | Same destination works under every label; legacy links preserved |
| 2. Search and Settings | 120-type directory; aliases; primary/secondary selection; preview/apply/history; safe migration | Existing records and customisations survive a type change |
| 3. Registration | Shared selector; solo/team and delivery context; capability recommendations; setup checklist | New workspace reaches a useful first offering without false capability promises |
| 4. Sales and POS integration | Combined Sales view; type filters; industry POS defaults; permission and payment-state handling | Original twelve staff journeys pass relevant end-to-end acceptance |
| 5. Page Builder suggestions | Taxonomy-based template tags; binding validation; preview/import; theme inheritance | Draft import leaves existing public site unchanged until publication |
| 6. Expansion | Validate additional industry workflows and locales; add aliases from observed searches | Each promoted workflow has documented acceptance evidence |

Product owns taxonomy and capability promises. Workspace/UX owns navigation, vocabulary and previews. Engineering owns resolution, migrations and reusable services. Finance owns payment/settlement terminology and integration behaviour. Page Builder owns templates and binding contracts. Support/localisation reviews search aliases and understandable wording. These are responsibilities, not a request to create or contact agents.

Do not deliver 120 independent dashboards. Build the shared renderer and a small set of operational layouts, then populate the taxonomy and validate variations. Do not recreate services that the existing createPurchase, calendar, roster or inquiry-to-booking paths already provide.

## 13. Acceptance criteria

1. English and Spanish aliases resolve to the same stable type ID; accents, case and common typos are handled without automatic ambiguous selection.
2. Keyboard-only and touch users can search, inspect and select a type at mobile and desktop widths.
3. Registration and Settings produce identical resolved vocabulary for the same inputs and preset version.
4. The workspace menu contains the agreed canonical destinations; unsupported/unauthorised actions cannot be activated through a preset or direct link.
5. A Nail salon preset resolves Services, Clients, Nail Technicians and Stations; Restaurant resolves Menu, Guests and Tables & Spaces.
6. Primary Spa plus secondary Yoga suggests Classes without silently replacing Therapists or Treatment Rooms.
7. Changing type preserves unpaid orders, future appointments, free reservations, customer history and manual label overrides.
8. Existing deep links and external QR destinations still resolve after vocabulary changes.
9. Two simultaneous settings edits produce an explicit conflict instead of silently overwriting one another.
10. A pending POS payment retains original amount, currency, account and terminal while workspace presentation changes elsewhere.
11. Sales includes free/unpaid bookings without inventing orders; an order with multiple tickets and a booking with multiple orders display valid relationships.
12. Revenue counts each financial record once; approval and settlement are separate; different currencies are not silently summed.
13. A room used by a class and an appointment cannot be allocated twice; alternative layouts cannot duplicate capacity.
14. Roster membership never grants workspace login; Team permissions are enforced independently.
15. A hidden module with existing records remains accessible through an appropriate authorised records path; hiding does not cancel future visits.
16. Restoring a prior workspace configuration restores presentation/defaults only, with an audit record.
17. Page Builder recommendations honour the actual enabled modules; importing a draft does not publish it or erase existing content.
18. No preset creates inventory functions, changes payment providers, alters subscription plans or claims unsupported specialised workflows.
19. A solo talent who also operates a business can choose that context without losing existing agency/spa relationships or exposing private client details.
20. Each original business journey retains its inquiry/direct-booking path, correct resource checks and payment linkage under its new vocabulary.

## 14. Decision record and open implementation checks

Decided: Sales is the shared workspace destination; Operate/Sell/People & Spaces/Grow/Manage are the groups; Catalog and Spaces are independent shared modules; POS is optional; business type is searchable at registration and editable in Settings; primary type controls vocabulary; secondary activities recommend capabilities; Page Builder integration is preview-driven; inventory is excluded.

Superseded: separate top-level Orders and Bookings; Run your business as a group title; Offerings & Booking as a group title; agency-specific renaming of the common Sales destination. Order and Booking remain valid underlying records and detail labels. Earlier screenshots are historical design iterations.

Implementation checks still required: map proposed route IDs to actual routes; confirm built module capabilities and plan gates; determine existing business-type fields to migrate; verify terminal/country support at implementation time; validate specialised scheduling; review localised terminology; establish source grouping for Sales. These checks are developer tasks, not reasons to postpone the taxonomy and UX specification.

Maintenance rule: each change to a preset or canonical label requires a version, a compatibility note and a before/after preview for affected workspaces. Record acceptance evidence before describing a workflow as shipped.
