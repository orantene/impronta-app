-- Phase 2 · E3 — `agencies.runs_events`: does this workspace do events.
--
-- The rail-nav cache for the Events slot, following `takes_reservations`
-- (`agencies`, Reservations' column) deliberately and closely.
--
-- IT IS A SETTING, NOT AN INVENTORY, AND THAT IS THE WHOLE DESIGN.
--
-- I proposed deriving it from "does this workspace have any event, including
-- drafts". The Reservations Manager pointed out that this contradicts the
-- visibility rule I had written one paragraph earlier, and they are right:
--
--   * A workspace with events ON and ZERO events created must still see the
--     slot, because the page is what explains how to make one. An
--     inventory-derived flag is FALSE in exactly that state, so the door is
--     hidden precisely when it is most needed.
--   * And it fails from the far side: delete the last event and the rail item
--     VANISHES from a workspace that has run events all year. An empty page
--     teaches an operator the feature is broken; a MISSING DOOR is worse,
--     because there is nothing left to click to find out why.
--
-- The rail is asking *does this workspace do events*, which is a statement
-- about the BUSINESS. Only a human can answer it, so it is a toggle.
--
-- NO TRIGGER, AND THAT IS THE ONE PLACE THIS DIVERGES FROM `takes_reservations`.
-- Theirs is trigger-maintained because its truth lives per-venue in
-- `venue_service_rules.is_active` and the rail needs one workspace-level answer.
-- Events has no equivalent rules table: the operator toggle IS the truth, with
-- nowhere else for it to live. A trigger here would maintain a column from
-- itself.
--
-- Copying the RULE and not the mechanism is deliberate. The alternative --
-- inventing a `event_service_rules` row to have something to trigger off --
-- would be a table whose only purpose is to make a convention match.
--
-- WHY A COLUMN AND NOT `settings` JSONB. `loadTenantIdentity` already selects
-- the `agencies` row on every workspace page load for every tenant, so a
-- boolean there is ZERO extra round trips. The case that decides it is not the
-- venue, it is the tenant who does NOT run events -- most of them -- who would
-- otherwise pay a query on every page for a feature they do not have.

BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS runs_events boolean NOT NULL DEFAULT false;

-- Wording lifted from `takes_reservations` rather than paraphrased. Two comments
-- saying the same thing differently is how the next reader concludes they mean
-- different things.
COMMENT ON COLUMN public.agencies.runs_events IS
  'Rail-nav cache: does this workspace run events. An operator SETTING, not an inventory -- never '
  'derived from whether any event exists, because a workspace that has switched events on and created '
  'nothing yet is exactly when it needs the page that explains how, and deleting the last event must '
  'not remove the door. DECIDES WHETHER A LINK IS DRAWN AND NOTHING ELSE — never gate access on it. '
  'Every real check reads the event row it is about, because a cached boolean used as a permission is '
  'a permission that can be stale, and that failure is silent in both directions.';

COMMIT;
