-- Give the directory card something to say when appearance is absent.
--
-- THE CONSTRAINT THAT SHAPES THIS
-- The card renders at most TWO trait lines
-- (DirectoryCardAdapter.pickAttributeLines: `Math.min(2, maxFieldLines)`),
-- ordered by the catalog's `display_order`. So card fields are not additive —
-- every field added competes for one of two slots.
--
-- WHAT WAS THERE
--   identity.gender      order  50   column-backed, set on 54 of 79 listed
--   physical.height_cm   order 100   column-backed, set on 48 of 79 listed
--   industries           order 360   never reached; only 2 slots exist
--   fit_labels           order 350   never reached
--
-- WHY NOT SIMPLY REPLACE THEM
-- The audit's complaint was that the card "leads with gender and height" while
-- Tulala sells what people DO. That is right in general and wrong for the only
-- kind of agency currently on the platform: for casting, gender and height are
-- the shorthand a client actually scans, and stripping them would make
-- Impronta's cards worse at their real job. Both fields are already scoped to
-- casting categories (physical-casting and casting-identity groups), so a chef
-- or DJ roster does not see them at all — the directory facet gate handles the
-- category dimension already.
--
-- WHAT THIS DOES INSTEAD
-- Adds three capability fields BELOW the physical ones in display order, so
-- they claim a slot only when a physical field is absent — which is precisely
-- the two cases that matter:
--
--   1. A non-casting roster, where the gate suppresses physical entirely.
--      Those cards showed NO trait lines. Now they show capability.
--   2. A casting talent missing height or gender (31 of 79 lack a height).
--      That slot rendered blank. Now it carries something a client can act on.
--
-- No talent loses a line they currently have. This is strictly additive in
-- effect while respecting the two-slot budget.
--
--   availability.status    order 110   27 filled   "can I book them"
--   travel.scope           order 120   26 filled   "will they come to me" —
--                                      load-bearing in a destination market
--   experience.years_total order 130   27 filled   credibility
--
-- DELIBERATELY NOT ADDED: experience.level (redundant with years),
-- commercial.rateCardVisibility and about.bioTone (operator config, not client
-- facts), identity.response_time (unbounded free text), and the two textarea
-- fields professional_highlights / notable_work (prose does not fit a trait
-- line). Languages — 36 listed profiles have them — cannot ride this mechanism
-- at all: they live in `talent_languages`, not the field-value store, so the
-- card DTO would need a new source. Tracked separately.
--
-- REVERSIBLE:
--   UPDATE public.profile_field_definitions
--      SET show_in_directory_card = false
--    WHERE field_key IN ('availability.status','travel.scope','experience.years_total');

UPDATE public.profile_field_definitions
   SET show_in_directory_card = true,
       display_order = 110,
       updated_at = now()
 WHERE field_key = 'availability.status';

UPDATE public.profile_field_definitions
   SET show_in_directory_card = true,
       display_order = 120,
       updated_at = now()
 WHERE field_key = 'travel.scope';

UPDATE public.profile_field_definitions
   SET show_in_directory_card = true,
       display_order = 130,
       updated_at = now()
 WHERE field_key = 'experience.years_total';
