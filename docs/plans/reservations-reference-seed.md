# Reservations — the reference seed

**Built three times** (`zero-test-studio`, `impronta`, `elpaisa`) before being written
down. `elpaisa` is the canonical one: it is the demo the owner shows.

This is **tenant DATA, not schema**. It deliberately does not live in
`supabase/migrations/` — a migration is a statement about every environment, and this
is a statement about one restaurant. Run it by hand against the tenant you mean.

## What a correct seed contains

| Thing | Value | Why it is not the default |
|---|---|---|
| `venues.timezone` | **the venue's real zone** | The column defaults to `UTC` and **every production venue had silently inherited it.** A venue on UTC resolves "dinner at seven" in the wrong wall clock. Get it from the restaurant, not from the seed you copied — see the correction below. |
| Room + 10 tables | 4 two-tops, 6 four-tops | The band pools are sized from these. |
| 2 `space_groups` | `kind='party_band'`, `sell_mode='band'` | A party-size band is CAPACITY, not a room. |
| Both capacity pools | **`parent_pool_id = NULL`** | Parentless on purpose (Spaces SS-2): a parented band pool double-counts the room against itself. |
| 2 service windows | lunch 13:00/180, dinner 19:00/240, 7 days | Wall clock + duration, so a window may cross midnight. |
| `venue_service_rules` | `is_active = true`, parties 1–4 | The trigger flips `agencies.takes_reservations` from this. Never write that column by hand. |
| **A published offering** | wired into `reservation_offering_id` | **The one everybody forgets. See below.** |

## The four ways it looks seeded and is not

1. **Rules and windows with NO published offering is the worst shape available.**
   `createReservation` refuses `no_offering_configured` only at the moment of booking,
   so the guest is offered times, picks one, types their name, taps the button — and is
   refused. Worse than "we are closed", because everything up to the click looks like it
   works. Seed the offering in the SAME transaction as the rules, or seed neither.

2. **The offering must be workspace-owned, published, and payable in person.**
   `talent_offerings_owner_exclusivity` requires `owner_kind='workspace'` with a NULL
   `talent_profile_id`. The purchase pipeline **re-derives** `status`,
   `allow_pay_in_person` and `require_account_to_book`, and refuses if any disagrees
   with what `reserve.ts` chose. Use `visibility='on_request'` so the row does not also
   appear as a purchasable service card.

3. **`booking_mode` stays `'request'`, and that is not a compromise.**
   `talent_offerings_instant_needs_price` forbids `'instant'` at zero price, and the
   reservation path never reads `booking_mode` — it is not in the catalog select.

4. **`upsert_capacity_pool` takes TEN arguments; a positional call does not match** and
   rolls the whole `DO` block back. Use named parameters.

## Verifying — three questions, not one

Does the object exist, are its guards on it, and can anyone reach it who should not.
A row count answers only the first. **Ask the engine:** `capacity_remaining_public(pool)`
returning the band's real unit count proves the pool is reachable and live, which
`SELECT count(*) FROM capacity_pools` does not. And confirm `takes_reservations` flipped
**on its own** — if you had to write it, the trigger is not working.

## Environment facts that masquerade as routing bugs

- **localhost QA is PORT-LOCKED.** `agency_domains` holds `localhost`, `localhost:3000`
  and `localhost:3001`. The Host header carries the port, so a dev server on any other
  port 404s **every** path including `/`. Leases are granted on 3001.
- **A worktree needs its own `.env.local`**, or the app boots, serves 200s, and 404s
  every tenant path because middleware cannot read `agency_domains`.
- A worktree's `node_modules` must be a real directory (`cp -al`); Turbopack rejects a
  symlink pointing out of the project root.

## The seed

Set `t` to the tenant and change the venue name/city. Everything else is the reference.

```sql
DO $$
DECLARE
  t uuid := '<TENANT_ID>';
  v uuid; room uuid; g2 uuid; g4 uuid; off uuid; i int;
BEGIN
  INSERT INTO public.venues (tenant_id, name, slug, city, country_code, timezone, is_default, status)
  VALUES (t, 'El Paisa', 'el-paisa', 'Glew', 'AR', 'America/Argentina/Buenos_Aires', true, 'active')
  RETURNING id INTO v;

  INSERT INTO public.spaces (tenant_id, venue_id, parent_id, kind, name, party_min, party_max, sort_order)
  VALUES (t, v, NULL, 'room', 'Main room', 1, 20, 0) RETURNING id INTO room;

  FOR i IN 1..4 LOOP
    INSERT INTO public.spaces (tenant_id, venue_id, parent_id, kind, name, code, party_min, party_max, seat_count, sort_order)
    VALUES (t, v, room, 'table', 'Table T'||i, 'T'||i, 1, 2, 2, i);
  END LOOP;
  FOR i IN 5..10 LOOP
    INSERT INTO public.spaces (tenant_id, venue_id, parent_id, kind, name, code, party_min, party_max, seat_count, sort_order)
    VALUES (t, v, room, 'table', 'Table T'||i, 'T'||i, 3, 4, 4, i);
  END LOOP;

  INSERT INTO public.space_groups (tenant_id, venue_id, name, kind, party_min, party_max, sell_mode, sort_order)
  VALUES (t, v, 'Two-tops', 'party_band', 1, 2, 'band', 0) RETURNING id INTO g2;
  INSERT INTO public.space_groups (tenant_id, venue_id, name, kind, party_min, party_max, sell_mode, sort_order)
  VALUES (t, v, 'Four-tops', 'party_band', 3, 4, 'band', 1) RETURNING id INTO g4;

  INSERT INTO public.space_group_members (group_id, space_id, tenant_id, sort_order)
  SELECT g2, s.id, t, s.sort_order FROM public.spaces s
   WHERE s.venue_id = v AND s.kind='table' AND s.party_max = 2;
  INSERT INTO public.space_group_members (group_id, space_id, tenant_id, sort_order)
  SELECT g4, s.id, t, s.sort_order FROM public.spaces s
   WHERE s.venue_id = v AND s.kind='table' AND s.party_max = 4;

  -- PARENTLESS. Named parameters: ten arguments, positional does not match.
  PERFORM public.upsert_capacity_pool(
    p_tenant_id := t, p_subject_kind := 'space_group', p_subject_id := g2,
    p_units_total := 4, p_pool_key := 'default', p_parent_pool_id := NULL,
    p_overbook_units := 0, p_hold_ttl_seconds := 900, p_unit_label := 'table',
    p_is_active := true);
  PERFORM public.upsert_capacity_pool(
    p_tenant_id := t, p_subject_kind := 'space_group', p_subject_id := g4,
    p_units_total := 6, p_pool_key := 'default', p_parent_pool_id := NULL,
    p_overbook_units := 0, p_hold_ttl_seconds := 900, p_unit_label := 'table',
    p_is_active := true);

  INSERT INTO public.venue_service_windows
    (tenant_id, venue_id, key, label, local_time, duration_minutes, weekdays,
     last_seating_offset_min, seating_step_minutes, starts_on, is_active, sort_order)
  VALUES
    (t, v, 'lunch',  '{"en":"Lunch","es":"Comida"}'::jsonb, '13:00', 180,
     ARRAY[1,2,3,4,5,6,7], NULL, 30, CURRENT_DATE - 1, true, 0),
    (t, v, 'dinner', '{"en":"Dinner","es":"Cena"}'::jsonb,  '19:00', 240,
     ARRAY[1,2,3,4,5,6,7], NULL, 30, CURRENT_DATE - 1, true, 1);

  INSERT INTO public.talent_offerings
    (tenant_id, talent_profile_id, owner_kind, title, title_i18n, kind, status, visibility,
     price_type, amount_cents, currency, reserve_mode, allow_pay_in_person,
     require_account_to_book, booking_mode)
  VALUES
    (t, NULL, 'workspace', 'Table reservation',
     '{"en":"Table reservation","es":"Reserva de mesa"}'::jsonb,
     'service', 'published', 'on_request', 'flat_package', 0, 'USD', 'free', true, false, 'request')
  RETURNING id INTO off;

  INSERT INTO public.venue_service_rules
    (venue_id, tenant_id, is_active, party_size_min, party_size_max, horizon_days,
     min_notice_minutes, turn_time_bands, default_turn_minutes, allow_public_upsize,
     no_show_grace_minutes, free_cancel_hours, walkins_enabled, notes_enabled,
     reservation_offering_id)
  VALUES
    (v, t, true, 1, 4, 60, 60,
     '[{"minParty":1,"maxParty":2,"turnMinutes":75},{"minParty":3,"maxParty":4,"turnMinutes":90}]'::jsonb,
     90, false, 15, 2, true, true, off);
END $$;
```

## The correct-answer contract this seed produces

Derived from the ROWS, not from intent. Test against this.

- **Lunch** 13:00 + 180 = 16:00; turn 75 for a party of 1–2, so last seating 14:45 →
  **13:00, 13:30, 14:00, 14:30**.
- **Dinner** 19:00 + 240 = 23:00 → **19:00 through 21:30** in 30-minute steps.
- A party of **5 is refused** — `party_size_max` is 4. A REAL refusal.
- The **fifth simultaneous two-top** at one time is refused **sold out** — that pool
  holds 4 units. A REAL refusal.
- Anything inside **60 minutes** is not offered. Real.
- **"Nothing available today"** at a normal hour, or **"we are closed that day"**
  anywhere in the next 60 days, is a **BUG** — every weekday is open.

## Correction 2026-09-05 — the timezone was copied, not looked up

El Paisa was seeded `America/Cancun` because that is what the two tenants before
it used. **It is in Glew, Buenos Aires province, Argentina** — "Parrilla El Paisa
Regionales", a family parrilla, prices in ARS. Corrected on venue
`b0a18aee-4d0f-4a65-90e8-da9a1b74f726` to `America/Argentina/Buenos_Aires`, with
`city='Glew'`, `region='Buenos Aires'`, `country_code='AR'`.

**Why this is the exact mistake this document was written to prevent, one level
up.** The doc says to set the timezone explicitly rather than inherit `UTC`. I did
— and then inherited it from the previous seed instead. A value that is *stated*
is not the same as a value that is *checked*: the row looked deliberate and was
still wrong, which is harder to catch than a default, because nothing about it
reads as unset.

**Nothing about the windows changed, and that is the design working.** Windows
store a WALL CLOCK, not an instant, so lunch stayed `13:00` and dinner `19:00` —
the venue's own hours are still its own hours. Only the instants they resolve to
moved (lunch 18:00Z → 16:00Z), which is exactly what should happen when a venue
turns out to be two hours east of where you thought.

**Safe because nothing was booked.** Verified first: 0 capacity allocations, 0
orders, 0 admissions on this tenant. **Changing a venue's timezone with live
bookings would move the instant of every future seating** — a table booked for
20:00 would silently become 18:00 or 22:00. If you must re-zone a venue that has
taken bookings, that is a migration with a decision in it, not an `UPDATE`.

**Fix the whole row, not the field you were asked about.** The correction named
only the timezone; leaving `country_code='MX'` beside `region='Buenos Aires'`
would have left a row that contradicts itself, and the next reader cannot tell
which half is the stale one.

## The hours in this seed are INVENTED, and El Paisa proved it (2026-09-05)

Lunch 13:00/180 and dinner 19:00/240 are a plausible two-service restaurant that
I made up when this document was first written. They are a fine SHAPE to seed and
they are nobody's actual hours.

El Paisa's own listing says roughly **10:00 to 01:00 continuous** — one long
service, not two windows. So the seed reproduced its own defaults onto a third
tenant and the contract derived from them described a restaurant that does not
exist.

**Same failure as the timezone one section above, one turn later.** There the
lesson was that a value which is STATED is not a value that is CHECKED. Here the
lesson is narrower and worse: **a REFERENCE seed is the most likely thing in a
codebase to be copied without checking**, precisely because it is written down and
looks authoritative. The document that exists to stop people inheriting defaults
became the thing they inherit.

So: **the windows are the FIRST thing to replace per venue, not the last.** Ask
the restaurant. If nobody has asked yet, seed the venue and leave the windows
inactive rather than seeding hours that will be demonstrated wrong — an inactive
window refuses honestly, and invented hours accept a booking for a time the
kitchen is shut.

### The rule that follows: a seed's windows ship INACTIVE unless someone asked

**If nobody has asked the restaurant its hours, seed `venue_service_windows` with
`is_active = false`.**

An inactive window refuses honestly — the page says the venue is not taking
bookings, which is TRUE of a venue nobody has configured. Invented hours do the
opposite: they accept a booking for a time the kitchen is shut, and the guest
finds out at the door. Between a surface that refuses and a surface that lies,
the refusal is always the safer default, and it is the one that gets fixed
because somebody notices it.

Active windows require a source. El Paisa's are active because its published
hours were read from its own listing and recorded with the post date; they are
still marked unverified until someone speaks to the restaurant.
