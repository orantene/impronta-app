# Client Dashboard + Inquiry Engine — Execution Plan

**Status**: BINDING — supersedes earlier audit + vision docs as the execution spec
**Date**: 2026-05-14
**Owner**: Product
**Hard rule**: **Do not build a better client dashboard on top of fragmented inquiry logic. First unify the inquiry engine, then make every client surface a lens into that same engine.**

This plan is the source of truth for the next 7 phases of work on the client experience. Earlier docs (`client-dashboard-audit-2026-05-14.md`, `client-experience-vision-2026-05-14.md`) remain valid as tactical / strategic references but the *order of operations* and *non-negotiable architecture* live here.

---

## 0. Product truth

The client dashboard is currently behind the rest of the product. Workspace Admin and Talent are moving toward a strong reservation/message shell, but the client side still feels like disconnected pages: inquiries, bookings, messages, discover, saved talent, new inquiry forms, and settings. That is dangerous because **the entire business starts with the client inquiry**.

The client experience must now be rebuilt around one core idea:

> **The client does not want a dashboard. The client wants confidence that their event, booking, activation, shoot, or request will be handled correctly.**

The client should never ask:
- Where is my inquiry?
- Did the agency see my request?
- Who is helping me?
- Is the offer ready?
- What do I need to approve?
- Which talent are confirmed?
- Where do I pay?
- What happens on the event day?
- Where is the call sheet?
- Where are my past bookings?
- How do I book again?

Everything must be answerable from the client Messages experience.

---

## 1. North Star

**A premium concierge command center where every inquiry, message, offer, booking, and next action is visible in one place.**

The client is not browsing for fun; they are trying to make sure something important does not fall apart. The system should reduce anxiety by always showing state and next action.

**Success standard** — a client should be able to open the app and understand within 3 seconds:
- What is waiting for me?
- What is the status?
- Who is handling it?
- What do I need to do next?

---

## 2. Core decision — Messages becomes the client home

### Required IA

```
Messages · Discover · Bookings · Settings
```

### Changes

- Remove as primary destinations: Today, Inquiries.
- Keep as redirects:
  - `/client/today` → `/client/messages?filter=needs-me`
  - `/client/inquiries` → `/client/messages?filter=open`
- `/client/bookings` remains — calendar/history lens.
- `/client/discover` remains for browsing, saving, starting inquiries.
- `/client/settings` remains for profile, company, notifications, team.

### Reason

The client should not have to decide whether something is an inquiry, message, booking, project, request, or reservation. The system decides and shows the correct state.

---

## 3. Client Messages must align with Workspace Admin and Talent

Same universal shell structure:

```
Project list / inbox
Selected project thread
Header with status, date, location, talent count, offer amount
Tabs: Chat · Lineup · Offer · Details · Files
Action ribbon / next action
Drawers for editing, approving, paying, viewing details
```

### Client-specific rule

The client does **not** see the Client / Group / DM sub-toggle. Only sees: **Chat**.

Behind the scenes this maps to the client-facing thread.

Client should not see:
- Talent group chat
- Internal coordinator/admin notes
- Talent rate negotiations (unless included in final offer)
- Coordinator commission
- Workspace margin
- Platform fee internals
- Engine terminology

---

## 4. Client project list redesign

The left-side project list IS the dashboard. Each row must show:

- Project title
- Stage/status
- Agency/coordinator
- Date
- Location
- Talent confirmation count
- Offer/payment state
- Unread messages
- Next action
- Deadline (if relevant)

### Examples

**New inquiry**
```
Beach activation
Inquiry received · Impronta reviewing
Aug 14 · Tulum
Next: Waiting for coordinator
```

**Offer waiting**
```
Fashion launch
Action needed: Review offer
3 talent proposed · $4,200
Offer expires Friday
```

**Booked**
```
Hotel opening night
Booked · 4 talent confirmed
Sep 2 · Playa del Carmen
Next: View call sheet
```

**Day-of**
```
Beach club residency
Today · 6:00 PM
Coordinator Diego on call
Open call sheet
```

### Filters (list-level, not nav-level)

```
Needs me · Open · Booked · Today · Past · Drafts · Saved / Shortlisted
```

---

## 5. Client thread header

```
Row 1: ← Project title                    Status pill
Row 2: via Agency · Date · Location
Row 3: N talent · $X offer state
```

Each segment opens a drawer (status → timeline; agency → coordinator sheet; date → schedule; location → map; talent count → Lineup; offer amount → Offer).

---

## 6. Client tabs

Universal tab order: **Chat · Lineup · Offer · Details · Files**

### 6.1 Chat
Main client surface. Includes structured system cards (not only free text). Required cards:

```
Inquiry received · Coordinator assigned · Talent invited · Talent confirmed
Offer ready · Offer approved · Payment requested · Payment completed
Booking confirmed · Call sheet updated · Reminder (event tomorrow)
Booking wrapped · Review requested
```

### 6.2 Lineup
Clean, trust-building view of who is proposed or confirmed.

**Client sees**: name, photo, talent type, status (proposed / confirmed / on hold / replacement being sourced), coordinator badge, public profile preview, "why this talent fits" if available.

**Client does not see**: private talent rates, internal notes, availability conflicts, admin-only negotiation notes.

**Client actions**: ask question, request replacement, approve lineup (if workflow supports), save talent to favorites after booking.

### 6.3 Offer
Where the client makes the money decision.

```
Total price · what is included · talent/services · date/time/location
Payment terms · cancellation terms · expiration deadline
Approve · Counter · Decline · Ask question
```

Irreversible actions use **drawers**, not modals. Approval drawer has clear summary + sticky CTA + 4-second undo toast.

### 6.4 Details
Canonical job record. Replaces Event/Project/Inquiry Details.

```
Request summary · schedule · location · coordinator · talent summary
logistics · client contact / on-site contact · special instructions
files/references · recent changes
```

Client can edit (or request changes to): brief, date/time before locked, location before locked, guest count/scope, reference files, contact info, notes. Every change creates an activity item.

### 6.5 Files
Client sees: uploaded briefs, references, contracts, receipts, invoices, call sheet PDF, talent/media references.

Client can upload: brief, moodboard, venue instructions, brand guide, reference photos, schedule.

---

## 7. The inquiry form problem

Inquiry forms are **not consolidated**. They produce different payloads, fields, defaults, and UX. This must stop.

### Required architecture

One canonical inquiry creation engine:

```
InquiryIntent · InquiryDraft · InquirySubmitPayload · InquirySource · InquiryContext
```

Every entry point uses the same engine.

### Entry sources

```
direct_client_dashboard · discover_single_talent · discover_shortlist
saved_talent · public_talent_profile · agency_site · hub_site
pitch · admin_created · book_again
```

### Canonical inquiry fields

```
client_id · workspace_id/tenant_id · source · source_context
title · event_type/request_type · talent_categories_requested
requested_talent_ids · shortlist_id · date · time · duration
location · city · budget_range · brief · files
client_contact · on_site_contact · special_notes
visibility/privacy · draft_status
```

### Draft behavior (engineering enabler)

- Autosave every 5 seconds
- Autosave on blur
- Autosave on tab close / visibility change
- Resume from Messages
- Resume from Discover
- Show draft cards in Messages list

---

## 8. New Inquiry drawer (5 steps)

1. **What do you need?** (talent for event / shoot / recurring / private event / brand activation / not sure yet)
2. **Who are you considering?** (prefilled from saved/discover/shortlist/profile/rebook; or "recommend / I know who / similar to past")
3. **Date / location** (date, flexible?, start time, duration, venue, city, remote?)
4. **Brief** (event, what should talent do, vibe, audience, wardrobe/equipment, budget, notes, files)
5. **Review and send** — CTA: "Send to coordinator" · "Save as draft" (NOT "Submit"/"Create")

---

## 9. Discover, saved talent, and inquiry creation

Required flows, all routing through the canonical engine:

- **Single talent**: "Inquire" → drawer with talent prefilled
- **Multiple talent**: "Inquire with 3 selected" → drawer with talent chips
- **Shortlist**: "Send shortlist to coordinator" → drawer with shortlist context
- **Book again**: "Book Sofia again" / "Book same lineup" / "Book similar" → drawer prefilled from old booking

---

## 10. Bookings page role

Calendar/history lens. Does not compete with Messages.

- Show: upcoming, today, past, cancelled, draft rebooks
- Each booking opens the same reservation thread in Messages
- Can have: list/calendar toggle, add to calendar, receipt/invoice, call sheet, book again
- **Conversation stays in Messages**

---

## 11. Day-of client experience

Major trust moment.

### Today priority card
```
Today
Beach activation · 6:00 PM · Tulum Beach Club
Open call sheet
Contact coordinator
```

### Call sheet drawer
- Coordinator on-call
- Talent list + arrival status (if available)
- Venue address + map link
- Timeline
- Wardrobe/logistics notes
- Emergency contact
- Files

Client does **not** see: internal admin notes, talent private payout, coordinator commission.

---

## 12. Client trust layer

The biggest missing layer. Every client project needs trust cards.

### Required trust cards

**Your coordinator**
```
Diego is coordinating this booking.
Usually replies within 2 hours.
[Message Diego] [Call on event day]
```

**What happens next** (state-dependent)
```
Impronta is confirming talent availability.
You will receive an offer once the lineup is ready.
```

**Who is confirmed**
```
2 of 3 talent confirmed
1 replacement being sourced
```

**Last updated**
```
Updated 14 minutes ago by Diego
```

**Payment confidence** (if relevant)
```
Your payment is secure. Booking is confirmed after payment.
```

---

## 13. Activity and transparency

### Client-visible activity
```
Inquiry submitted · Coordinator assigned · Sofia added to lineup
Offer sent · You approved the offer · Payment completed · Call sheet updated
```

### Hidden from client
```
Internal commission split · workspace fee changes · talent private rate edits
Coordinator internal notes · backend status mutations
```

### Where activity appears
1. Details tab activity section
2. Chat system card (if it affects client)

---

## 14. Notifications

### Required events
```
Coordinator replies · Offer ready · Lineup changes · Approval needed
Payment requested · Payment confirmed · Booking confirmed
Call sheet updated · Event tomorrow · Review requested
```

### Channels
```
In-app · Email · Push/PWA (later)
```

### Settings (client-controllable)
```
Messages · Offer/payment · Booking reminders · Reviews/rebook prompts
```

---

## 15. Client team / colleague approval

Many clients are brand managers, hotel managers, assistants, event planners, or agency people. They may need someone else to approve.

### Client can:
- Invite colleague
- Share offer for approval
- Add billing contact
- Add on-site contact
- Add procurement contact

### Roles
```
Owner · Approver · Viewer · Billing · On-site contact
```

Build later, but **the data model should not block it**.

---

## 16. Client identity and account states

### Possible arrivals
Public talent page · agency site · hub site · pitch · saved talent · email invite · admin-created · returning dashboard

### Required states
```
Guest inquiry · Email-verified client · Logged-in client
Client with company/team · Client invited by agency · Client created by admin
```

### Rule

**Do not force full registration before submitting inquiry if it kills conversion.**

Flow:
1. Let client submit inquiry with email/phone
2. Create lightweight client record
3. Send magic link
4. After submission, invite to set password/profile
5. Dashboard access becomes natural place to track inquiry

---

## 17. Public site and client dashboard alignment

An inquiry from an agency storefront and an inquiry from the client dashboard must land in the same engine.

### Required

Public agency site creates the **same inquiry type** as client dashboard. No separate logic like `contact request` / `lead` / `reservation request` / `booking request` / `frontend inquiry`.

Everything is `Inquiry` with source context.

---

## 18. Pitch-to-inquiry flow

When a pitch creates an inquiry:
- First chat card contains pitch context
- Details tab includes pitch source
- Offer can be built from pitch details
- Client can reply in same thread
- Admin/coordinator sees it as normal inquiry with source `pitch`

---

## 19. Payment and offer trust

### Offer page must answer
```
What am I paying? · Who/what is included? · When does this expire?
What happens after I approve? · What happens after I pay?
Can I counter? · Can I ask a question?
```

### Payment states
```
No offer yet · Offer being prepared · Offer sent · Client countered
Offer accepted · Payment requested · Payment completed
Booking confirmed · Refunded / cancelled
```

### Critical UX rule

**Do not show payment until the client understands what they are paying for.**

---

## 20. Client settings

```
Profile · Company · Phone · Billing info · Team members
Notification preferences · Saved payment method (later)
Language · Timezone · Security
```

All editable, not read-only.

---

## 21. Required engineering enablers (mandatory gates)

### 21.1 Single project loader
```
loadClientProjects(userId, tenantId)
```

Returns:
```
project_id · inquiry_id · booking_id · title · stage · status
next_action · next_action_owner · last_message · last_message_at
unread_count · offer_status · offer_total_client · payment_status
date · location · coordinator · talent_count · confirmed_talent_count
source · updated_at
```

Powers the Messages list.

### 21.2 Single inquiry creation engine
```
createInquiryFromIntent(intent)
saveInquiryDraft(intent)
submitInquiryDraft(draftId)
```

Used by every entry point.

### 21.3 Realtime

Subscribe only to active project/thread. Events:
```
message.created · inquiry.updated · offer.updated · lineup.updated
booking.updated · payment.updated · call_sheet.updated
```

### 21.4 Optimistic UI
For: send message · approve offer · counter offer · save draft · submit inquiry · upload file · mark notification read.

### 21.5 Permission and visibility layer

Do not rely on UI hiding. Create explicit client-safe views / server actions:
```
client_project_view · client_project_details_view · client_offer_view
client_lineup_view · client_activity_view · client_files_view
```

Client should never be able to fetch internal admin fields.

---

## 22. What must be audited before building

### Routes
```
/client · /client/messages · /client/messages/[id]
/client/today · /client/inquiries · /client/inquiries/[id]
/client/bookings · /client/bookings/[id]
/client/discover · /client/saved · /client/shortlists · /client/settings
public talent profile inquiry CTA
agency storefront inquiry CTA
pitch inquiry CTA
```

### Components
```
Client dashboard shell · client nav · client messages list
client inquiry form · client booking page · client offer drawer
client details tab · client files area · client discover cards
saved talent/shortlists · notification bell · settings forms
```

### Data creation paths
Search for every function that creates: inquiry · lead · request · booking request · client request · draft · pitch conversion. Consolidate to one engine.

---

## 23. Execution phases

### Phase A — Audit and consolidation map
**Goal**: know every broken route, duplicate form, disconnected inquiry path.

**Deliverables**:
- Client route map
- Inquiry creation source map
- Data payload comparison
- Broken UX list
- Permission leak list
- Component reuse map
- Screenshots
- Console/network errors

**Acceptance**:
- No unknown client inquiry path remains
- Every entry point is documented
- Every duplicate form is identified

### Phase B — Bring client into universal Messages shell
**Goal**: client Messages visually and structurally aligns with Workspace Admin and Talent.

**Build**:
- `/client/messages` as home
- Project list left / thread right on desktop
- Mobile-first project list → thread navigation
- Header row 1/2/3
- Tabs: Chat · Lineup · Offer · Details · Files
- Action ribbon
- Drawers
- Client-safe state language

**Acceptance**: client Messages feels like the same product family as Admin and Talent. No old disconnected inquiry detail page is the primary experience.

### Phase C — Details tab as source of truth
**Goal**: client can understand the entire job from Details.

**Build**: status summary · request brief · schedule · location · people · lineup summary · offer/payment summary · logistics · files · activity · editable fields where allowed.

**Acceptance**: client, admin, coordinator, talent, and talent-coordinator all see the same Details structure with correct visibility.

### Phase D — Unified inquiry creation
**Goal**: every inquiry starts through one canonical drawer/engine.

**Build**: new inquiry drawer · Discover inquiry drawer · saved talent inquiry drawer · shortlist inquiry drawer · public profile inquiry drawer · rebook drawer · pitch-to-inquiry wiring · inquiry drafts · autosave · source context.

**Acceptance**: all inquiry sources produce the same normalized inquiry record. No duplicate form logic remains.

### Phase E — Offer, payment, approval trust
**Goal**: client can confidently approve, counter, decline, or pay.

**Build**: offer card in chat · Offer tab · approve drawer · counter drawer · decline drawer · payment request card · payment status · receipt/invoice · offer expiration · undo where appropriate.

**Acceptance**: client understands the offer without asking coordinator. Admin/coordinator sees client action immediately.

### Phase F — Day-of and booking continuity
**Goal**: once inquiry becomes booking, the same thread continues.

**Build**: booking status in same project · call sheet drawer · Today priority card · one-tap coordinator contact · one-tap map · talent confirmed list · files/receipts · review prompt · book again.

**Acceptance**: inquiry does not disappear into a separate booking product. Client sees continuity from request to completed booking.

### Phase G — QA and polish
**Goal**: premium, mobile-first, no broken pages.

**Test**: client desktop · client mobile · admin desktop · admin mobile · talent mobile · coordinator · talent-coordinator · public inquiry · Discover inquiry · saved talent inquiry · pitch inquiry · rebook inquiry.

**Acceptance**: no broken links · no dead buttons · no duplicate forms · no inconsistent status · no internal terms exposed · no role permission leaks · no mobile layout collapse.

---

## 24. Design standard

### Visual rules
```
Warm neutral background · White cards · Near-black primary text
One primary accent · Calm motion · No emoji icons in production
Lucide icons only · Large readable type · No cramped 12px feel
```

### Product feeling
**Yes**: premium concierge · modern booking workspace · calm project command center · human agency communication.

**No**: CRM · admin panel · ticket queue · database table · developer prototype.

---

## 25. The biggest rule

**Do not build a better client dashboard on top of fragmented inquiry logic. First unify the inquiry engine, then make every client surface a lens into that same engine.**

Otherwise the UI looks nicer but the product still feels broken underneath.

---

## 26. What ships next (after this plan is committed)

Phase A audit. Three deliverables:
1. **Client route map** — every route, what loads it, what state it renders.
2. **Inquiry creation source map** — every function/component that creates an inquiry row, with the payload it produces.
3. **Payload diff + gap list** — what's different across paths, what should be normalized.

Output: `web/docs/phase-a-audit-2026-05-14.md`. Then Phase B can begin with confidence.
