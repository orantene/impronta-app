# Barebones Inquiry Engine — Product Spec

**Status**: BINDING — canonical inquiry engine specification.
**Companion docs**: `client-execution-plan-2026-05-14.md` (overall plan), `phase-a-audit-2026-05-14.md` (audit findings).
**Implementation target**: Phase B-1 (data layer) → Phase B-2 (intent engine) → Phase B-3 (drawer UI).

---

## 1. Core idea

The inquiry form is not just a form. It is the **starting engine of the whole platform**. Every major flow begins here:

```
Client dashboard → New inquiry
Saved talent → Inquire
Favorite talent → Inquire
Shortlist → Send to agency
Public talent profile → Request talent
Agency site → New inquiry
Hub site → New inquiry
Pitch → Start inquiry
Book again → New inquiry from past booking
```

The inquiry form must become **one reusable engine** that accepts different starting contexts. Fast, clean, modern, flexible enough to grow into the full booking.

---

## 2. The 7 sections

```
1. Client / requester
2. Company / job identity
3. Location
4. Date / time
5. Selected talent
6. Budget / pricing preference
7. Event logistics / brief
```

Enough to start almost every inquiry.

---

## 3. Section 1 — Client / Requester

**Answers**: who is making this request? how can the agency contact them? is this person trusted?

### Fields
```
requester_name · requester_email · requester_phone
requester_photo_url · requester_account_status
requester_trust_level · requester_member_level
preferred_contact_method
```

### Behavior

**If logged in**:
- Prefill name, email, phone
- Show photo/avatar
- Show trust/member level
- Allow per-inquiry edit

**If not logged in**:
- Ask for name, email, phone/WhatsApp
- After submission, create lightweight client account + invite to register

### Trust display

Logged-in:
```
Logged-in client
Member since May 2026
Verified email
3 previous bookings
```

New:
```
New client
Contact info required so the agency can follow up
```

---

## 4. Section 2 — Client / Company / Job Identity

**Answers**: who is the job for? what's this inquiry called? is the requester booking for themselves, a company, or someone else?

### Fields
```
client_name · company_name · job_name · booking_for
```

### Booking-for options
```
Myself · My company · Another client / guest · A brand · A venue · An agency client
```

### "Same as requester" shortcut

Checkbox/button: **"Use my information"**.

When selected:
- `client_name = requester_name`
- `company = requester_company`
- Billing/contact reuses requester

When not selected: allow override for this specific job.

### Example
```
Requester: Maria Lopez
Company: Playa Events
Booking for: Hyatt Tulum Launch
Job name: Hyatt Summer Opening
```

---

## 5. Section 3 — Location

Critical. Location builds trust for both agency and talent.

### Fields
```
city · area · venue_name · google_place_id · address
location_notes · venue_status · latitude · longitude · google_maps_url
```

### Venue status options
```
Venue confirmed · Venue not confirmed yet · Online / remote · Not sure yet
```

### Google Maps behavior

Use Google Places autocomplete. Typing `"Tulum Beach Club"` auto-fills: venue_name, address, city, map coordinates, Google Maps link.

### UI after selection
```
Tulum Beach Club
Carretera Tulum-Boca Paila, Tulum
[Open in Google Maps]
```

Unconfirmed venue:
```
Venue not confirmed yet
Area: Tulum Hotel Zone
```

### Why this matters

Talent accepts when they can see: the venue exists · the area is known · the coordinator has location context · it is not a vague job.

---

## 6. Section 4 — Date / Time

**Answers**: when is the job? is the date fixed or flexible?

### Fields
```
date_status · event_date · start_time · duration · time_notes
```

### Status options
```
Exact date · Flexible date · Not sure yet · Multi-day · Recurring
```

### Barebones rule

Only require `date_status` (or `event_date`). **Do not force exact start/end time** in v1.

### Simple UI
```
Date: Aug 14
Time: Evening / 6:00 PM / Not sure yet
Duration: 2–4 hours / full day / not sure yet
```

Later → call sheet details.

---

## 7. Section 5 — Selected Talent

One of the most important parts of the platform.

### Pull-from sources
```
Saved talent · Favorites · Shortlists · Discover · Past bookings · Public profile CTA
```

### Fields
```
selected_talent_ids · selected_shortlist_id
talent_types_needed · number_of_talent_needed
talent_selection_mode · talent_notes
```

### Selected talent card
```
Sofia Reyes
Model · Playa del Carmen
Base rate: from $250/day
[Remove]
```

### Add more talent options
```
Add from favorites · Add from saved talent · Search talent · Let agency recommend
```

### Critical "agency recommends" button

Many clients don't know who to choose. Surface:

```
Let the agency recommend the best talent
```

This becomes `talent_selection_mode = 'agency_recommends'`.

### Rate display (careful)

If selected talent has visible base rate:

```
Estimated from-rate: $250/day
Final quote may vary based on schedule, usage, travel, and logistics.
```

**Do not make this feel like a fixed checkout price unless the rate is truly fixed.**

---

## 8. Section 6 — Budget / Pricing Preference

Flexible. Some know their budget, some want the agency to recommend, some pay per hour/day/week/contract/event.

### Main question
```
How would you like the agency to price this?
```

### Options
```
Let the agency recommend the best offer (default)
I have a total budget
I want to pay per hour
I want to pay per day
I want to pay per week
I want to pay per contract
I want to pay per talent
Not sure yet
```

### Fields
```
pricing_preference · budget_amount · budget_range
currency · rate_type · budget_notes
```

### Recommended default

First option is **"Let the agency recommend the best offer"**. Creates trust and prevents clients from blocking themselves with unrealistic numbers.

### Smart estimate (if selected talent has base rates)

```
Estimated talent base total

Sofia: from $250/day
Carmen: from $300/day

Agency will confirm final pricing based on schedule, location, usage, and logistics.
```

Builds confidence without overpromising.

---

## 9. Section 7 — Event Logistics / Brief

Beautiful, organized, modern. **Do not show 40 fields at once. Show grouped cards.**

### Main brief field
```
Tell us what you need
Describe the event, what the talent should do, and anything important for the agency to know.
```

### Logistics mini-sections (expandable cards)
```
Role expectations · Schedule details · Wardrobe / styling
Equipment · Travel / parking · Food / breaks
Media / photo/video usage · Special notes
```

### Barebones v1

Initially show only:
```
What should the talent do?
Any special requirements?
Files or links
```

Then allow **"Add more details"**.

### Expanded options

**Role expectations**
```
Greet guests · Pose for photos · Host booth · Dance / perform
Model clothing/product · Create content · Serve as brand ambassador · Other
```

**Wardrobe / styling**
```
Client provides wardrobe · Talent brings wardrobe · Specific dress code · Not sure yet
```

**Equipment**
```
Talent brings equipment · Client provides equipment · No equipment needed · Not sure yet
```

**Media / usage**
```
No filming/photos · Event recap only · Organic social · Paid ads · Website / campaign · Not sure yet
```

**Travel / parking**
```
Parking available · Transport provided · Talent handles own transport · Not sure yet
```

**Files and links**
```
Upload moodboard · Upload brand guide · Upload venue info · Paste Instagram/TikTok/reference link
```

---

## 10. Form layout

### Desktop
Two-column premium drawer/page.

```
Left column:
- Client / requester
- Company / job
- Location
- Date / time
- Budget

Right column:
- Selected talent
- Brief
- Logistics
- Files
- Review / send
```

### Mobile
Single-column cards.
```
1. Your info · 2. Job / company · 3. Location · 4. Date
5. Talent · 6. Budget · 7. Details · 8. Send
```

### Design style

**Yes**: luxury booking intake · modern concierge request · premium event brief builder.

**No**: admin form · database fields · long CRM intake · Google Form.

---

## 11. Barebones inquiry object

```
inquiry_id · tenant_id · workspace_id · source · source_context

requester_name · requester_email · requester_phone
requester_user_id · requester_photo_url
requester_trust_level · requester_member_level

client_name · company_name · booking_for · job_name

location_status · venue_name · address · city · area · country
google_place_id · google_maps_url · latitude · longitude · location_notes

date_status · event_date · start_time · duration · time_notes

selected_talent_ids · selected_shortlist_id
talent_types_needed · number_of_talent_needed · talent_selection_mode

pricing_preference · budget_amount · budget_range
currency · rate_type · budget_notes

brief · role_expectations · wardrobe_notes · equipment_notes
travel_notes · media_usage · special_requirements

files · links

status · missing_info_flags · created_at · updated_at
```

---

## 12. Fast form vs Details tab — division of labor

**Fast form captures**:
```
Requester · Client/company/job · Location · Date · Selected talent
Budget preference · Brief/logistics · Files
```

**Details tab completes later**:
```
Exact schedule · Full call sheet · Final talent lineup · Final offer
Payment · On-site contact · Billing contact · Talent confirmations
Usage rights · Transport/lodging · Internal notes · Activity log
```

**Key balance**: inquiry form is powerful but not overwhelming.

---

## 13. Modern UX behavior — smart defaults per source

| Source | Behavior |
|---|---|
| Logged-in (any source) | Prefill requester info + company + phone; show trust/member level |
| Selected talent | Attach talent automatically; show talent card + type + base rate |
| Saved/favorite | Attach saved talent; allow add/remove |
| Book again | Prefill location, previous brief, previous talent, previous schedule pattern |
| Public profile | Attach profile talent; ask for requester info; create lightweight account after submit |
| Discover single | Attach the one talent |
| Discover shortlist | Attach all shortlist talent + shortlist context |
| Pitch | Attach pitch talents + pitch brief; mark `source=pitch` |

---

## 14. Review step before sending

Clean summary before submission:

```
Send request to Impronta

Job:           Hyatt Summer Opening
Location:      Tulum Beach Club
Date:          Aug 14 · Evening
Talent:        Sofia Reyes + agency recommendations
Budget:        Let agency recommend best offer
Contact:       Maria Lopez · maria@email.com · WhatsApp

[Send to coordinator]  [Save as draft]
```

---

## 15. After submission

Immediately create:
- Inquiry row
- Client message thread (auto-ack from agency)
- Details tab record
- Activity event (`INQUIRY_SUBMITTED`)
- Source context preserved
- Missing-info checklist computed (§16)

Then redirect to:
```
/client/messages/:inquiryId
```

Show confirmation:
```
Your request was sent to Impronta.

A coordinator will review the details and continue with you here.
You can add or update details anytime.
```

Then the universal shell renders: **Chat · Lineup · Offer · Details · Files**.

---

## 16. Missing-info flags

Because the form is barebones, missing info is expected. Examples:
```
Exact time missing · Venue not confirmed · Budget not provided
Talent count not confirmed · Usage rights not specified
Wardrobe unclear · On-site contact missing · Files not added
```

These become **clean prompts in Details, not errors in the form**.

Example prompt:
```
Add exact time
This helps talent confirm availability.
```

---

## 17. Required vs optional

### Required
```
Requester name
Requester email or phone
Request type or selected talent
Brief
Location city/status
Date/status
```

### Optional but recommended
```
Budget preference · Selected talent · Company/job name · Files/links
Venue address · Start time · Duration
```

### Not required
```
Full address · Exact end time · Payment method · Billing info
Call sheet · On-site contact · Usage rights · Wardrobe · Transport
Equipment · Final talent count · Final offer
```

---

## 18. Implementation handoff

This spec drives Phase B-1 → B-4. Build order:

### Phase B-1 — Data layer (one migration commit)
- Add `source_context jsonb` column to `inquiries`
- Extend `INQUIRY_SOURCE_CHANNEL_VALUES` to include plan §7 sources (10 values)
- Create `inquiry_drafts` table with RLS
- Migration applies cleanly to remote

### Phase B-2 — Intent engine (one TS commit)
- `lib/inquiry/inquiry-intent.ts` — `InquiryIntent` type + `validateIntentForSubmit()`
- `lib/inquiry/inquiry-intent-engine.ts` — `createInquiryFromIntent()` + `saveInquiryDraft()` + `submitInquiryDraft()`
- `intentToSubmitInquiryInput()` adapter — maps the rich intent shape into the existing `submitInquiry()` engine input
- TS check clean

### Phase B-3 — Funnel legacy callers (one commit)
- Delete `createManualInquiry` (direct INSERT)
- Replace it with a thin shim that builds an `InquiryIntent` and calls `createInquiryFromIntent`
- Update `createAgencyInquiry` to route through `createInquiryFromIntent`
- Update `submitClientInquiry` + `submitGuestInquiry` + `createClientWorkspaceInquiryAction` + `convertPitchToInquiry` to route through `createInquiryFromIntent`
- All 6 existing callers now share one orchestrator

### Phase B-4 — Drawer UI (multiple commits)
- New `<InquiryDrawer>` component with 7 sections per this spec
- Smart defaults per source context
- Review step
- Save-as-draft + autosave
- Migrate every entry point to use the new drawer
- Delete dedicated `/client/inquiries/new` page (drawer-only)

### Acceptance
- Every inquiry creation path produces a normalized `InquiryIntent` → `submitInquiry`
- Source provenance preserved in `source_channel` (one of 10 values) + `source_context` (jsonb)
- Drafts persist across sessions/devices
- No direct INSERTs into `inquiries` outside the engine
