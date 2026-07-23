-- Talent Services — product fulfillment chapter (Lane D1).
--
-- Adds a booking_sub_type discriminator to agency_bookings and a
-- booking_fulfillment sidecar so product bookings carry a shipment lifecycle.
-- Product payouts gate on booking_fulfillment.shipped_at (enforced in app code,
-- see transfers.ts) — money never releases before the item ships.

-- 1. Discriminator on the booking. Default 'service' keeps every existing row
--    and the whole services/instant-book path unchanged.
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS booking_sub_type text NOT NULL DEFAULT 'service'
  CHECK (booking_sub_type IN ('service', 'product', 'package'));

-- 2. One fulfillment row per booking (created lazily when a product booking is
--    made or first acted on). Cascade-deletes with the booking.
CREATE TABLE IF NOT EXISTS public.booking_fulfillment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  tenant_id uuid,
  fulfillment_type text NOT NULL DEFAULT 'shipment'
    CHECK (fulfillment_type IN ('shipment', 'pickup', 'digital', 'service')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'picked_up', 'downloaded', 'returned', 'completed')),
  ship_to jsonb,
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  digital_asset_id uuid,
  lead_time_days int CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_fulfillment_booking ON public.booking_fulfillment(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_fulfillment_tenant_status ON public.booking_fulfillment(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agency_bookings_sub_type ON public.agency_bookings(booking_sub_type) WHERE booking_sub_type <> 'service';

-- 3. RLS: reads for agency staff of the tenant; all writes go through
--    service-role server actions (app-layer auth mirrors offerings-actions).
ALTER TABLE public.booking_fulfillment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_fulfillment_staff_read ON public.booking_fulfillment;
CREATE POLICY booking_fulfillment_staff_read ON public.booking_fulfillment
  FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));
