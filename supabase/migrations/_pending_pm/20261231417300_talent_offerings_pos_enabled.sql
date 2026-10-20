-- 20261231417300_talent_offerings_pos_enabled.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PROPOSAL for the Production Migration Manager (TUL-1271 #3, package B2).
--
-- WHY: the Catalog's "POS · Counter" switch wrote status = 'draft', which
-- unlists the item everywhere (website, /book, QR menu), not just at the
-- counter. A separate flag lets an owner keep an item online but off the till.
--
-- WHAT: one additive column, default true, so every existing row keeps its
-- current behaviour. Nothing else changes. The code reads the key when it is
-- present and treats a missing key as "on", so it works before AND after this
-- applies (lib/pos/pos-enabled.ts).
--
-- ORDER: safe to apply before or after the code.
--
-- ROLLBACK:
--   ALTER TABLE public.talent_offerings DROP COLUMN IF EXISTS pos_enabled;
--   (Items switched off at the counter would then show on it again.)

BEGIN;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.talent_offerings.pos_enabled IS
  'false = not sold at the counter / scan. Separate from status, which unlists the item everywhere.';

COMMIT;
