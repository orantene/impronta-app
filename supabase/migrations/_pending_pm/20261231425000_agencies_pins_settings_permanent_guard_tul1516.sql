-- TUL-1516 (P0, staging QA re-fail): manager PIN hash still readable by a viewer,
-- via agencies.settings.people.pins, for exactly one agency (s2-cantina on fxlank).
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it. NOT
-- applied by the author.
--
-- Root cause (confirmed by direct read-only query against fxlank, not guessed):
-- 20261231423900_staff_pin_hashes_and_throttle_tul1516.sql is already live there —
-- pos_set_staff_pin() writes ONLY to staff_pin_hashes (verified via
-- pg_get_functiondef), and staff_pin_hashes has ZERO rows for s2-cantina's tenant.
-- So the app did not write this stray hash; something else wrote directly into
-- agencies.settings AFTER that migration's own strip step ran (which is why only
-- one agency has it, not all of them) — most likely a fixture/reseed step for the
-- QA journeys branch that this repo's own scripts do not contain. Rather than chase
-- an external writer, this migration makes the leak structurally impossible to
-- reintroduce, from any source, going forward.
--
-- This:
--   1. Re-runs the original migration's rescue-then-strip step (idempotent): any
--      stray hash still in settings.people.pins is copied into staff_pin_hashes
--      first (so a real hash is never silently lost), then the key is removed.
--   2. Adds a CHECK constraint on agencies that REJECTS any future INSERT/UPDATE
--      that would leave settings.people.pins populated, regardless of which role
--      or process performs the write (service_role included — CHECK constraints
--      are not bypassable by role the way RLS is).
--
-- Idempotent: safe to run again with zero rows affected once clean.

BEGIN;

-- 1. Rescue + strip any current stragglers (mirrors 20261231423900's own logic).
INSERT INTO public.staff_pin_hashes (tenant_id, user_id, pin_hash)
SELECT a.id, e.key::uuid, e.value
  FROM public.agencies a,
       LATERAL jsonb_each_text(a.settings #> '{people,pins}') AS e(key, value)
 WHERE jsonb_typeof(a.settings #> '{people,pins}') = 'object'
   AND e.value <> ''
   AND e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE public.agencies
   SET settings = settings #- '{people,pins}'
 WHERE jsonb_typeof(settings #> '{people,pins}') IS NOT NULL;

-- 2. Permanent guard: no future write, from any role or process, can repopulate
-- this path. A CHECK constraint (unlike RLS) applies even to service_role writes.
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_settings_no_people_pins;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_settings_no_people_pins
  CHECK (settings #> '{people,pins}' IS NULL);

-- ── proof ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agencies WHERE jsonb_typeof(settings #> '{people,pins}') IS NOT NULL) THEN
    RAISE EXCEPTION 'TUL-1516: PIN hashes are still in agencies.settings after the strip';
  END IF;
END
$$;

COMMIT;
