-- SaaS Phase 1.B / B2 — tenantise the booking family.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B2,
--      docs/saas/phase-0/01-entity-ownership-map.md §3 (commercial ops).
--
-- agency_bookings is the parent. booking_talent and booking_activity_log
-- inherit tenant_id from it via JOIN backfill. failed_engine_effects is
-- tenantised directly (pairs 1:1 with inquiries).

BEGIN;

-- agency_bookings (parent) ---------------------------------------------------

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.agency_bookings
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- booking_talent (child) -----------------------------------------------------

ALTER TABLE public.booking_talent
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.booking_talent bt
   SET tenant_id = ab.tenant_id
  FROM public.agency_bookings ab
 WHERE bt.booking_id = ab.id
   AND bt.tenant_id IS NULL;

-- Catch orphan rows (if any) with tenant #1 to keep NOT NULL enforcement safe
-- in B8; orphans would otherwise remain NULL and fail.
UPDATE public.booking_talent
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- booking_activity_log (child) -----------------------------------------------

ALTER TABLE public.booking_activity_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.booking_activity_log bal
   SET tenant_id = ab.tenant_id
  FROM public.agency_bookings ab
 WHERE bal.booking_id = ab.id
   AND bal.tenant_id IS NULL;

UPDATE public.booking_activity_log
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- failed_engine_effects ------------------------------------------------------

ALTER TABLE public.failed_engine_effects
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.failed_engine_effects
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
