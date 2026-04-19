-- SaaS Phase 1.B / B1 — tenantise the inquiry family.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B1,
--      docs/saas/phase-0/01-entity-ownership-map.md §3,
--      Plan §4.5 (Migration/Backfill Order), L13, L18, L37.
--
-- Pattern per table: ADD COLUMN IF NOT EXISTS tenant_id (nullable) → backfill
-- tenant #1 → leave nullable in this migration. SET NOT NULL is applied in B8
-- after all backfills run; indexes in B9. Strict additive — no existing column
-- touched, no RLS changed.

BEGIN;

-- inquiries ------------------------------------------------------------------

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiries
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_participants -------------------------------------------------------

ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_participants
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_messages -----------------------------------------------------------

ALTER TABLE public.inquiry_messages
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_messages
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_message_reads ------------------------------------------------------

ALTER TABLE public.inquiry_message_reads
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_message_reads
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_offers -------------------------------------------------------------

ALTER TABLE public.inquiry_offers
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_offers
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_offer_line_items ---------------------------------------------------

ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_offer_line_items
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_approvals ----------------------------------------------------------

ALTER TABLE public.inquiry_approvals
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_approvals
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_events -------------------------------------------------------------

ALTER TABLE public.inquiry_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_events
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_action_log ---------------------------------------------------------

ALTER TABLE public.inquiry_action_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_action_log
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_requirement_groups -------------------------------------------------

ALTER TABLE public.inquiry_requirement_groups
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_requirement_groups
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- inquiry_coordinators -------------------------------------------------------

ALTER TABLE public.inquiry_coordinators
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.inquiry_coordinators
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
