-- Phase 2: client-safe offer views (column privacy)
-- RLS controls row access; these views remove internal economics columns for client-facing selects.

BEGIN;

-- Client-safe offers (exclude coordinator_fee / internal fields)
CREATE OR REPLACE VIEW public.inquiry_offers_client_view AS
SELECT
  o.id,
  o.inquiry_id,
  o.status,
  o.version,
  o.total_client_price,
  o.currency_code,
  o.notes,
  o.sent_at,
  o.accepted_at,
  o.created_at,
  o.updated_at
FROM public.inquiry_offers o;

-- Client-safe line items (exclude talent_cost)
CREATE OR REPLACE VIEW public.inquiry_offer_line_items_client_view AS
SELECT
  li.id,
  li.offer_id,
  li.talent_profile_id,
  li.label,
  li.pricing_unit,
  li.units,
  li.unit_price,
  li.total_price,
  li.notes,
  li.sort_order,
  li.created_at
FROM public.inquiry_offer_line_items li;

COMMIT;

