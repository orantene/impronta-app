-- QR & Links Q1 — readable is the DEFAULT, not the only mode.
--
-- WHY THIS EXISTS
-- 20261229000280 argues that a code printed on a table tent cannot be a secret,
-- so it should be short and typeable. That is right for a code that SHOWS
-- something: a menu, a reservation page, tonight's tickets. It is wrong for a
-- code that GRANTS something — a staff door, a comped ticket, a back-of-house
-- link. For those, guessability is the whole attack, and there is no printed
-- card a guest needs to type.
--
-- So the mode is a property of the LINK, decided when it is created, not a
-- switch on the engine. An engine-wide switch would force one answer on both
-- kinds of code, and the two kinds live side by side in the same venue.
--
-- WHY NOW RATHER THAN WHEN THE FIRST GRANTING LINK IS BUILT
-- Because `links` has zero rows today. Adding the column later means a
-- migration plus an audit of every row written in between to decide which of
-- them should always have been opaque — and that audit has no evidence to work
-- from, because intent is not recoverable from a code string. One column now.
--
-- WHAT THE MODE ACTUALLY CONSTRAINS
-- The generator branches on it, and the database refuses the combination that
-- would make it a lie: an `opaque` link whose code is short enough to guess.
-- 16 characters of the code alphabet is ~82 bits, which is not brute-forceable
-- through a 60-per-minute rate limit in the lifetime of a restaurant.
--
-- Rollback: ALTER TABLE public.links DROP COLUMN code_mode.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

ALTER TABLE public.links
  ADD COLUMN IF NOT EXISTS code_mode text NOT NULL DEFAULT 'readable';

DO $$
BEGIN
  ALTER TABLE public.links
    ADD CONSTRAINT links_code_mode_valid CHECK (code_mode IN ('readable', 'opaque'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- An opaque code that is short is not opaque. The constraint makes the mode
-- mean something rather than being a label the generator is trusted to honour:
-- a future caller that sets the mode and forgets the generator is refused here.
DO $$
BEGIN
  ALTER TABLE public.links
    ADD CONSTRAINT links_opaque_code_is_long_enough
      CHECK (code_mode <> 'opaque' OR length(code) >= 16);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.links.code_mode IS
  'readable (default): a short typeable code for something that SHOWS — a menu, '
  'a reservation page. opaque: >=16 random characters for something that GRANTS '
  '— a staff door, a comped ticket. Set at creation; the generator branches on '
  'it and links_opaque_code_is_long_enough refuses a mode the code does not match.';
