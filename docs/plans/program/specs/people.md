# People: one person, up to three hats

Source: `docs/plans/program/pos/`  -  screen-index.md, people-model.md, decisions.md (D-POS-9), coverage-final.md. Data verified against `supabase/migrations/*.sql` in this worktree on 2026-09-09.

## 1. The journey

An owner or manager is trying to manage one person  -  who may be public talent with their own profile, someone this business can book, someone who can sign in and do work, or any combination of the three  -  without maintaining that person as two or three disconnected records. The three "hats" (Public profile, Bookable, Access) are independent: a person can have any subset, removing one leaves the others, and the same underlying tables serve all three views. This replaces the previous Roster list + Team drawer split. This is a design decision approved 2026-09-09 ("love the ideas, love the design direction"); **no code exists yet**  -  every screen in this slice is Not started against the current app, even though every table it reads already exists.

## 2. Screens in this slice

1. **W26** People · one person, three hats  -  the model explainer / entry list. Next action: open a person.
2. **W27** People › Talent (public profiles)  -  the list, filtered to people with the Public profile hat on.
3. **W28** Person drawer › Bookable hat  -  what the POS, calendar and booking widget read for this person, inside the existing person drawer. Next action: toggle Bookable, edit hours/requirements.
4. **W29** People › Access (roles)  -  who can sign in and what they can do. Next action: change a role, invite, revoke.
5. **W30** People › Bookable  -  the Bookable-hat-only list/view (who this business can book).
6. **W31** Service › Who performs  -  from a service's own editor, which people (by skill/verification) can be assigned to it. Next action: pick eligible people.
7. **W32** Add a person · pick hats  -  create a person and choose which hats to turn on. Next action: save.
8. **W33** Today's drawer → hats (1 of 2)  -  mapping the existing drawer's sections onto the three hats.
9. **W34** Person drawer › Public profile hat  -  the existing profile editor, unchanged, now framed as one hat among three.
10. **W35** Today's drawer → hats (2 of 2)  -  continuation of W33's mapping.
11. **W11** People › Dani Cruz › Bookable hat (staff)  -  a concrete worked example of W28 for a staff (not represented-talent) person.

Related, outside this slice: **MW32** staff invitation accept/decline, **MW33** talent invitation → representation/assignments (scoped grant), **MW34** expired/wrong-account/removed-access states, **W22** Settings › Roles & limits (where POS action limits per role actually live, separate from W29's role assignment).

## 3. Data per screen

Every table below is confirmed present in `supabase/migrations/`.

- **Public profile hat (W27, W34)**: `talent_profiles` (base identity), `talent_profile_field_values` (per-field visibility public/agency/private, field locks, workflow status draft→submitted→approved/hidden), `talent_profile_taxonomy` (skills + proficiency + `verified_at`), `talent_service_areas`, `talent_languages`, `media_assets` (avatar and gallery), `talent_profile_trust_badges` (identity/background-check/license/insurance/social/media-authentic/agency-approved), `agency_talent_roster` (the tenant-to-talent relationship row: `status`, `agency_visibility`, `is_primary`). "Remove from roster" per people-model.md's rules means removing this hat, i.e. changing `agency_talent_roster.status`  -  not deleting `talent_profiles`.
- **Bookable hat (W11, W28, W30)**: `talent_offerings` (the person's own sellable services: `price_type`, `amount_cents`, `booking_mode` request/instant, `duration_minutes`, `visibility`), `talent_booking_hours` and `talent_availability_blocks` (weekly hours, exceptions, timezone), `agency_talent_roster.direct_booking_enabled` / `external_booking_released` (confirmed columns, added in `20261217000000_roster_direct_booking.sql` and read by `20261221000000_surface_booking_gates.sql`)  -  these two columns are exactly what people-model.md calls "the talent-opt-in + direct-booking pair" that the single Bookable toggle is meant to replace in the UI without changing the underlying gate. "Only the Bookable hat puts a person in 'Pick a professional'" (people-model.md rule) is enforced wherever `lib/scheduling/public-slots.ts` or the equivalent reads these columns to build the picker  -  **unverified** that the picker code already reads exactly this set and nothing else; would verify by reading that query against a seeded Bookable-off person.
- **Access hat (W29)**: `agency_memberships` (owner/admin/manager/editor/viewer) and `staff_permissions`  -  both confirmed tables. **Not in the database yet**: POS-specific roles (cashier, server, host, kitchen, gate) as a layer on top of these. People-model.md itself calls this "new" work, and no column or table carrying a `pos_role` value was found anywhere in `supabase/migrations/`. This is the concrete backlog item behind D-POS-9's "no data moves" promise  -  the promise holds for the three existing hats, but the fourth thing POS-5.x needs ("eligible professionals" filtered by POS permission) has no source at all yet.
- **W31 who performs**: reads `talent_profile_taxonomy` (skill + `verified_at`) joined against whatever skill a service (`talent_offerings` or a workspace-defined required-skill offering) names, filtered to people whose Bookable hat is on. "Verification gates guaranteed bookings" (people-model.md) means an unverified skill match is shown differently from a verified one, not hidden  -  **unverified** exactly how that distinction renders; would verify once W31 exists.
- **W32 add a person, pick hats**: writes a new `talent_profiles` row and then, per hat chosen, the corresponding `agency_talent_roster` (Public profile), `talent_booking_hours`/`direct_booking_enabled` (Bookable), or `agency_memberships` (Access) rows. No single "add a person" RPC was found; this is presumed to be several separate writes coordinated by the new screen  -  **unverified**, since the screen does not exist yet.
- **W33/W35 section maps**: pure documentation screens; no new data, they map existing drawer sections (Booking terms, Booking hours, Availability grid, Location & service area, Logistics, Limits, Trust badges, Files, Media, emergency contact  -  all listed with their live tables in people-model.md's own table) onto the three hats.
- **History**: people-model.md states "One History for all three hats" backed by `talent_profile_field_value_history` (confirmed table) plus workflow events and membership events. **Unverified** whether membership/access changes (role grants, revocations) actually write into the same history table or a separate `agency_memberships` audit trail  -  would verify by checking for triggers on `agency_memberships`.

Two corrections carried over from people-model.md, both already true of the live schema and not new work: the Rates accordion is retired (pricing lives under Booking terms / `talent_offerings`); the Trust & verification editor does not persist today (it reads `talent_profile_trust_badges` but the toggle UI does not write back)  -  the design's plan is to read that table directly rather than the seeded toggle values.

## 4. Refusals and empty states

- W28/W30: a person with the Bookable hat off must never appear in "Pick a professional" anywhere in the POS or booking widget  -  this is a hard rule (people-model.md: "A Public profile alone is never bookable; Access alone never performs"), not a display preference.
- W32: removing a hat leaves the others; the UI must never present hat removal as deleting the person.
- W29: Access changes must not silently grant POS money permissions  -  coverage-final.md's F16 contract states this explicitly: "Bookable never grants money permissions; professional access is a scoped grant" (MW33). A role change that would grant a POS action must be visible as that, not implied by an unrelated toggle.
- W31: a hard "no" on a person's Limits (in the Public profile hat) must refuse assignment to a matching service, not merely warn (people-model.md: "a service tagged with a hard no cannot be assigned").
- Talent-facing (MW33/MW34): expired invitation, wrong account, and removed access are three distinct states, each with its own recovery ("request new," "switch account," "other workspaces")  -  never a single generic "access denied."

## 5. Definition of done

The one journey that must pass end to end on the QA host: a new person is added with the Public profile and Bookable hats on but Access off (W32), appears correctly in W27 (Public profile list) and W30 (Bookable list) but has no sign-in, is then given the Access hat with a `cashier`-equivalent role (W29  -  noting the POS-role layer itself is not-in-the-database-yet, so this step may only prove the `agency_memberships` grant, not a POS permission check), is selectable in W31's "who performs" for a matching service, and removing the Bookable hat alone removes them from W31/W30 while leaving the Public profile and Access hats intact. Because no code exists yet for any W26–W35 screen, "done" for this pass is the data model holding up under that sequence via direct writes/reads (e.g. through the isolated Supabase branch), not a UI click-through  -  the UI is future work.
