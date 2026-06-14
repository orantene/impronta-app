-- S18 — audit stamp: record which talent services-menu service prefilled an
-- offer line item. Purely additive + nullable, so existing offers / line items
-- and the wholesale delete+reinsert path in updateOfferDraft are unaffected.
-- Line items are inserted in TS (inquiry-engine-offers.updateOfferDraft +
-- instant-book-engine), NOT via an RPC, so no function signature change is
-- needed — the column just rides along on the existing .insert().
--
-- DOWN (manual):
--   ALTER TABLE public.inquiry_offer_line_items DROP COLUMN IF EXISTS source_service_id;

BEGIN;

ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS source_service_id text;

COMMENT ON COLUMN public.inquiry_offer_line_items.source_service_id IS
  'Services-menu ServiceMenuItem.id this line was prefilled from (S18). NULL = hand-authored. Free text, not an FK (the menu lives in a jsonb blob / catalog value).';

COMMIT;
