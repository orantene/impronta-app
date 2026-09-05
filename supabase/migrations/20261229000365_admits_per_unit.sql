-- Phase 2 · E5 — `admits_per_unit`: how many PEOPLE one purchased unit lets in.
--
-- The mint planner (`lib/events/mint-admissions.ts`) needs one number it cannot
-- get anywhere: given "someone bought 1 VIP table", how many people does that
-- admit? Without it a table for six mints an admission of party_size 1 and five
-- people are refused at the door holding a valid ticket.
--
-- IT IS NOT `consumes_units` AND IT IS NOT DERIVABLE FROM IT. Those answer
-- different questions and the difference is the entire reason this column
-- exists:
--
--     consumes_units    how much POOL one purchase eats.  A VIP table eats 1.
--     admits_per_unit   how many PEOPLE one unit admits.  A VIP table admits 6.
--
-- Nor can it come from the space group: a group may hold tables of different
-- sizes, so "the VIP group" has no single answer.
--
-- WHY THIS IS NOT THE COLUMN THAT WAS JUST DELETED. `admissions.units` was
-- proposed beside `party_size`, refuted four ways, and removed. The test that
-- separates the two cases, and the one to apply before adding any counter here
-- again: IS THERE ANOTHER COLUMN HOLDING THE SAME FACT AT THE SAME GRAIN?
--
--   * For `admissions.units` the answer was YES -- `party_size`, same row, same
--     question, equal in all five enumerated cases. Two names for one number,
--     which is the `unit_price` / `talent_cost` shape that turned $200 into $400.
--   * For `admits_per_unit` the answer is NO. Nothing stores it. It is a CATALOG
--     fact on a DIFFERENT table, read ONCE to COMPUTE `party_size` rather than
--     to duplicate it.
--
-- Default 1, so every existing variant and every standing tier is correct
-- without a backfill: one ticket admits one person.

BEGIN;

ALTER TABLE public.talent_offering_variants
  ADD COLUMN IF NOT EXISTS admits_per_unit int NOT NULL DEFAULT 1
    CHECK (admits_per_unit > 0);

COMMENT ON COLUMN public.talent_offering_variants.admits_per_unit IS
  'How many PEOPLE one purchased unit of this tier admits -- NOT how much capacity it consumes, '
  'which is consumes_units. A VIP table CONSUMES one table and ADMITS six. Do not derive one from '
  'the other and do not derive this from the space group, which may hold tables of different sizes. '
  'It is read once at mint time to compute admissions.party_size, and it is the reason a table for '
  'six does not become a ticket that lets one person in.';

COMMENT ON COLUMN public.talent_offering_variants.consumes_units IS
  'Units of the capacity pool one purchase consumes. A VIP table consumes one table. It says nothing '
  'about how many people that admits -- that is admits_per_unit.';

COMMIT;
