-- ============================================================================
-- A3 — every offer line item must name a talent.
--
-- A null/empty talent_profile_id orphans the line from the per-participant
-- commission snapshot and from the lineup sync, so the client could be charged
-- for a line that pays no one. The offer engine (updateOfferDraft) now rejects
-- such lines at draft with error 'line_item_talent_required'; this CHECK is the
-- database backstop so the invariant holds even if a future code path skips the
-- engine.
--
-- Safe to add as a plain CHECK: 0 existing rows have a null talent_profile_id
-- (verified before authoring). A plain (NOT VALID-free) ADD CONSTRAINT therefore
-- validates instantly against the current data.
-- ============================================================================

BEGIN;

ALTER TABLE public.inquiry_offer_line_items
  ADD CONSTRAINT inquiry_offer_line_items_talent_required
  CHECK (talent_profile_id IS NOT NULL);

COMMIT;
