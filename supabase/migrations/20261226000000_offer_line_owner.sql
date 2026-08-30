-- Menu Phase 1: every priced offer line must name a payee — talent XOR workspace.
-- Replaces inquiry_offer_line_items_talent_required (A3) with an exclusivity CHECK.
-- Both owners would double-count in the commission context; neither orphans the charge.

BEGIN;

ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS owner_tenant_id uuid
    REFERENCES public.agencies(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.inquiry_offer_line_items.owner_tenant_id IS
  'Workspace payee for house/menu lines. XOR with talent_profile_id — never both, never neither on a priced line.';

ALTER TABLE public.inquiry_offer_line_items
  DROP CONSTRAINT IF EXISTS inquiry_offer_line_items_talent_required;

ALTER TABLE public.inquiry_offer_line_items
  DROP CONSTRAINT IF EXISTS inquiry_offer_line_items_owner_xor;

ALTER TABLE public.inquiry_offer_line_items
  ADD CONSTRAINT inquiry_offer_line_items_owner_xor
  CHECK (
    (talent_profile_id IS NOT NULL AND owner_tenant_id IS NULL)
    OR (talent_profile_id IS NULL AND owner_tenant_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_offer_line_items_owner_tenant
  ON public.inquiry_offer_line_items (owner_tenant_id)
  WHERE owner_tenant_id IS NOT NULL;

COMMIT;
