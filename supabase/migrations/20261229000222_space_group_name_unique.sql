-- Spaces & Seating S2b — a venue cannot have two groups with the same name.
--
-- WHY THIS IS A CONSTRAINT AND NOT A CONVENIENCE
-- The editor's primitive is "add four tables seating two, called Two-tops". Run
-- twice, that must ADD FOUR MORE TABLES TO THE EXISTING BAND, not create a
-- second band with the same name — because two bands named "Two-tops" over
-- overlapping tables is precisely the double-count SS-2 exists to prevent, in a
-- form no invariant check would catch (each group would be internally
-- consistent; the venue would simply be selling its tables twice).
--
-- So the upsert needs a conflict target, and the conflict target is the fact:
-- a name identifies a group within a venue. Case-insensitive, because "VIP
-- tables" and "VIP Tables" are the same band to everyone except a byte
-- comparison.
--
-- Rollback: drop the index.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_space_groups_name_per_venue
  ON public.space_groups (tenant_id, venue_id, lower(name));

COMMIT;
