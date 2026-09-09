# People model · one person, three hats (D-POS-9)

Status: design proposal, owner approved the direction on 2026-09-09 ("love the ideas, love the design direction"). Designs W26–W35 in the back-office deck. No code.

## The three hats

| Hat | What it is | Storage today | Home in the design |
|---|---|---|---|
| Public profile | The profile engine as it is: talent_profiles + agency_talent_roster row, per-field visibility (public / agency / private), field locks, workflow status draft → submitted → approved / hidden, claim invites | `talent_profiles`, `talent_profile_field_values`, `talent_profile_taxonomy`, `talent_service_areas`, `talent_languages`, `media_assets`, `talent_profile_trust_badges`, `agency_talent_roster` | People › Talent; the drawer, section for section (W34) |
| Bookable | What this business books the person for: services here (workspace offerings that name a required skill, plus the person's own `talent_offerings` sold through us), booking hours, busy/free sharing, requirements, limits on the brief, POS permissions, pay | `talent_booking_hours`, `talent_availability_blocks`, `talent_offerings` (+variants, addons), `agency_talent_roster.direct_booking_enabled / external_booking_released`, `booking_talent` (talent cost vs client charge); new: per-person POS permissions and requirement rules | People › Bookable; the drawer's Bookable hat (W28) |
| Access | Sign-in and role | `agency_memberships` (owner / admin / manager / editor / viewer) + `staff_permissions`; new: POS roles (cashier, server, host, kitchen, gate) as permissions on top | People › Access (W29); limits per action stay in Settings › Roles & limits (W22) |

Rules
- Only the Bookable hat puts a person in "Pick a professional". A Public profile alone is never bookable; Access alone never performs.
- Hats are independent: removing one leaves the others. "Remove from roster" = remove the Public profile hat.
- Customers, the POS, the booking widget and receipts use one word set per business (Professional / Stylist / Instructor / Talent / Host), preset default.
- Bookable data is admin-only in the same privacy model as admin-only Agency Fields; "View as Talent" shows "Works with <business>".
- One History for all three hats (`talent_profile_field_value_history` + workflow events + membership events).

## What the Bookable hat reads from the Public profile (never re-entered)

| Profile section (live) | Read as |
|---|---|
| Services = skills (`talent_profile_taxonomy`, proficiency, `verified_at`) | A workspace offering names the skill and level it requires; verification gates guaranteed bookings |
| Booking terms › offerings (`talent_offerings`: price, unit, booking mode request / instant, reserve mode, duration, visibility, variants, add-ons) | The person's own menu, sellable through us with its booking and reserve modes; suggested talent cost |
| Booking terms › "Show booking on our pages" / "Allow bookings outside our site" | Become the Bookable toggle and its "outside our site" sub-switch |
| Booking hours (`talent_booking_hours`: weekly, exceptions, timezone, slot, buffers, notice, horizon) + `talent_availability_blocks` | The slots offered; edited from the Bookable hat as well as the talent Calendar settings (same tables) |
| Availability grid (`availability_data`, 28 days, recurring pattern, vacation) | Busy / blocked days close slots; stays the public signal |
| Location & service area (home base, service cities, radius, travel fee, visiting / away, seasonal) | Away dates close booking; cities and radius seed Field Services zones |
| Logistics (passport, license, vehicle, work-eligible countries, visas) | Pre-checks for cross-border and driving jobs |
| Limits (hard / case-by-case) | Printed on every brief; a service tagged with a hard no cannot be assigned |
| Trust badges (`talent_profile_trust_badges`: identity, background check, license, insurance, social, media authentic, agency approved) | Requirements; payout needed for Pay |
| Files (certification, ID, contract, release, NDA, tax) | A certification satisfies a requirement |
| Media (avatar) | The professional tile |
| Admin › emergency contact | Visible to coordinators during an active job |

## Corrections found while studying the live drawer and code

- The Rates accordion is retired (W3-9 marker); pricing lives under Booking terms (commercial terms + offerings manager). The design follows that.
- The Trust & verification editor does not persist (seeded values; absent from the commit payload). The design reads `talent_profile_trust_badges` instead of the toggles.
- Rooms, chairs and equipment are `talent_profiles` rows with `profile_kind = 'resource'` today. They move to the Spaces resource tree (D-POS-1); hats are for people.
- `PROFILE_SECTION_MAPPING.md` at the repo root documents the retired full-page editor and the wrong table names; do not rely on it.
- Appointment labor gate today: tenant enabled × (resource or talent opt-in) × direct booking allowed × roster site-visible × exclusivity. The Bookable toggle is the single switch that replaces the talent-opt-in + direct-booking pair in the UI without changing the gate.

## Migration (no data moves)

- Today's Roster → People › Talent (same records, same TAL ids, same drawer under the Public profile hat).
- Team drawer members → People › Access (same `agency_memberships`).
- Anyone with booking hours or a direct-booking switch on → shows the Bookable hat on.
- Registration, Applications, Rates (day rate) and CSV import keep their behaviour; entry points move under People.

## Screens

W26 model · W27 People › Talent · W28 person drawer › Bookable hat · W29 People › Access · W30 People › Bookable · W31 service › Who performs · W32 Add a person · W33 + W35 section map · W34 person drawer › Public profile hat (unchanged) · W11 staff Bookable hat.
