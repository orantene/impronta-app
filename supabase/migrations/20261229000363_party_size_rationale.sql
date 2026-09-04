-- Phase 2 · the four reasons `admissions.party_size` is ONE column, written down.
--
-- Comment-only. No schema change, no data change.
--
-- WHY A MIGRATION FOR A COMMENT. `20261229000360` has already run against
-- production, so it is not edited to improve a sentence in it -- a migration
-- file and the database it produced must not disagree. And this particular
-- sentence earns a file: the fifth person to meet this constraint will be
-- trying to add the fifth column, and the reasons are not visible from the
-- schema alone. I was the FIRST person to try to add one, twelve hours after
-- designing the table, and I had every reason in front of me.
--
-- THE COLUMN I TRIED TO ADD was `units`, for "capacity units consumed", beside
-- `party_size` for "people admitted". It was refuted four separate times by
-- four people who were not comparing notes:
--
--   1. THE VIP TABLE. A "VIP table for 6" is ONE allocation of ONE unit -- one
--      table out of the group -- admitting SIX people. With both columns,
--      `units` is 1 and `CHECK (admitted_count <= units)` caps a six-person
--      table at one guest through the door. The column would have broken the
--      headline tier of the feature that wanted it.
--
--   2. THE GRAIN. Two integer counts, equal in every case anyone could name and
--      differing only in grain when they diverge, under names that do not say
--      so, is the exact shape of the `unit_price` / `talent_cost` defect that
--      turned a measured $200 into $400. It would have arrived looking like
--      thoroughness.
--
--   3. THE TWO COVERS NUMBERS (Reservations). "How many covers tonight" means
--      arrivals; the book means booked. `sum(admitted_count)` and
--      `sum(party_size)` over the same rows, differing by no-shows and
--      unarrived. One column would have made one of two real screens wrong.
--
--   4. "PART SEATED" (Reservations). Two of a four-top at 20:00 and the rest at
--      20:40 is a host-stand state that falls out of
--      `0 < admitted_count < party_size` for free. No column, no enum, no flag.
--
-- AND THE FIFTH COLUMN THAT WILL BE PROPOSED IS RE-ENTRY, so it is answered
-- here in advance. A multi-night pass has `party_size = 1` and returns on three
-- nights, which would need `admitted_count = 3` against a `party_size` of 1 --
-- refused by the constraint above. That refusal is CORRECT rather than an
-- obstacle: `admitted_count` counts PEOPLE ADMITTED and re-entry counts
-- ADMISSIONS OF THE SAME PERSON. Different grain again. A value of 3 that could
-- mean "three of the four arrived" or "one person came back twice", with
-- nothing on the row to say which, is the same collapse in a third costume.
-- Re-entry is a scan LOG, which is also the thing a venue actually wants from
-- it -- when someone left and came back, not how many times -- and a counter
-- cannot answer that at all.

BEGIN;

COMMENT ON COLUMN public.admissions.party_size IS
  'How many PEOPLE this one admission admits, and the only count the door asks for: 1 for a single '
  'ticket, 4 for a party of four. The denominator of admitted_count. NOT capacity consumed -- a VIP '
  'table for 6 is one allocation of 1 unit admitting 6, and a second "units" column would cap it at '
  'one guest. Do not add one: it was refuted four independent ways (VIP tables, the unit_price/'
  'talent_cost grain defect, arrivals-vs-booked covers, and "part seated"). Re-entry is NOT this '
  'counter either -- that is admissions of one person rather than people admitted, and it is a scan '
  'log. See 20261229000363 for the full argument.';

COMMENT ON CONSTRAINT admissions_admitted_within_party ON public.admissions IS
  'A party of five against a four-top is a DIFFERENT BOOKING: it may not fit the table they hold and '
  'may need another band. This constraint sends the host through the capacity check rather than '
  'around it, which is how the floor plan keeps matching the room. It also stops a double scan '
  'writing 3 of 2 from a caller that forgot to look. Both halves are load-bearing; do not relax it '
  'for a Saturday-night story.';

COMMIT;
