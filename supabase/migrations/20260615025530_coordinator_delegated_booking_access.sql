-- Coordinator-delegated booking access.
--
-- An agency admin can appoint a roster talent as the COORDINATOR of a single
-- inquiry (engine_add_secondary_coordinator → inquiry_participants
-- role='coordinator', status='active'). That coordinator must then see + manage
-- everything the admin can FOR THAT ONE INQUIRY: the client thread, the offer,
-- the lineup, and the full booking / payment / commission picture.
--
-- Every booking-management table currently gates on is_staff_of_tenant(), which
-- a roster talent never satisfies. This migration adds INQUIRY-SCOPED coordinator
-- access (never tenant-wide) keyed on the reliable participant row, mirroring the
-- existing inquiry_offers_coordinator_* policies.
--
-- The helpers are SECURITY DEFINER so a coordinator policy ON inquiry_participants
-- can test inquiry_participants membership without RLS recursion, and so the
-- booking→inquiry join reads agency_bookings/inquiry_participants past their RLS.

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_inquiry_coordinator(p_inquiry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inquiry_participants p
    WHERE p.inquiry_id = p_inquiry_id
      AND p.user_id = auth.uid()
      AND p.role = 'coordinator'
      AND p.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_inquiry_coordinator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_inquiry_coordinator(uuid) TO authenticated;

-- Booking → inquiry bridge (for tables linked by booking_id, not inquiry_id).
CREATE OR REPLACE FUNCTION public.is_booking_coordinator(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_bookings b
    JOIN public.inquiry_participants p ON p.inquiry_id = b.source_inquiry_id
    WHERE b.id = p_booking_id
      AND p.user_id = auth.uid()
      AND p.role = 'coordinator'
      AND p.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_booking_coordinator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_booking_coordinator(uuid) TO authenticated;

-- ── inquiries: coordinator reads + updates their inquiry ─────────────────────
-- (coordinator-only talents not on the lineup match no other SELECT policy)
DROP POLICY IF EXISTS inquiries_coordinator_select ON public.inquiries;
CREATE POLICY inquiries_coordinator_select ON public.inquiries
  FOR SELECT TO authenticated
  USING (public.is_inquiry_coordinator(id));

DROP POLICY IF EXISTS inquiries_coordinator_update ON public.inquiries;
CREATE POLICY inquiries_coordinator_update ON public.inquiries
  FOR UPDATE TO authenticated
  USING (public.is_inquiry_coordinator(id))
  WITH CHECK (public.is_inquiry_coordinator(id));

-- ── inquiry_participants: coordinator reads all rows of their inquiry ─────────
-- (lineup, client, other coordinators). Writes stay through gated server actions.
DROP POLICY IF EXISTS inquiry_participants_coordinator_select ON public.inquiry_participants;
CREATE POLICY inquiry_participants_coordinator_select ON public.inquiry_participants
  FOR SELECT TO authenticated
  USING (public.is_inquiry_coordinator(inquiry_id));

-- ── agency_bookings: coordinator reads + updates (via source_inquiry_id) ──────
DROP POLICY IF EXISTS agency_bookings_coordinator_select ON public.agency_bookings;
CREATE POLICY agency_bookings_coordinator_select ON public.agency_bookings
  FOR SELECT TO authenticated
  USING (source_inquiry_id IS NOT NULL AND public.is_inquiry_coordinator(source_inquiry_id));

DROP POLICY IF EXISTS agency_bookings_coordinator_update ON public.agency_bookings;
CREATE POLICY agency_bookings_coordinator_update ON public.agency_bookings
  FOR UPDATE TO authenticated
  USING (source_inquiry_id IS NOT NULL AND public.is_inquiry_coordinator(source_inquiry_id))
  WITH CHECK (source_inquiry_id IS NOT NULL AND public.is_inquiry_coordinator(source_inquiry_id));

-- ── booking_transactions: coordinator full access (direct source_inquiry_id) ──
DROP POLICY IF EXISTS booking_transactions_coordinator_all ON public.booking_transactions;
CREATE POLICY booking_transactions_coordinator_all ON public.booking_transactions
  FOR ALL TO authenticated
  USING (source_inquiry_id IS NOT NULL AND public.is_inquiry_coordinator(source_inquiry_id))
  WITH CHECK (source_inquiry_id IS NOT NULL AND public.is_inquiry_coordinator(source_inquiry_id));

-- ── booking_payouts: coordinator full access (via booking_id) ────────────────
DROP POLICY IF EXISTS booking_payouts_coordinator_all ON public.booking_payouts;
CREATE POLICY booking_payouts_coordinator_all ON public.booking_payouts
  FOR ALL TO authenticated
  USING (public.is_booking_coordinator(booking_id))
  WITH CHECK (public.is_booking_coordinator(booking_id));

-- ── booking_talent: coordinator full access (via booking_id) ─────────────────
DROP POLICY IF EXISTS booking_talent_coordinator_all ON public.booking_talent;
CREATE POLICY booking_talent_coordinator_all ON public.booking_talent
  FOR ALL TO authenticated
  USING (public.is_booking_coordinator(booking_id))
  WITH CHECK (public.is_booking_coordinator(booking_id));

-- ── booking_commission_snapshot: coordinator reads ALL legs of their booking ──
-- (the talent self-view policy only exposes a talent's own leg; the coordinator,
-- acting as the agency for this inquiry, sees the whole 3-way split.)
DROP POLICY IF EXISTS booking_commission_snapshot_coordinator_select ON public.booking_commission_snapshot;
CREATE POLICY booking_commission_snapshot_coordinator_select ON public.booking_commission_snapshot
  FOR SELECT TO authenticated
  USING (public.is_booking_coordinator(booking_id));

-- ── visible_from: per-coordinator client-thread history window ───────────────
-- null  → coordinator sees the full prior client thread ("show history").
-- set   → coordinator only sees private-thread messages created at/after it
--          ("start fresh"). Enforced app-side in loadTalentInquiryThread (the
--          talent private read is service-role); this column is the source of
--          truth. Only meaningful on role='coordinator' rows.
ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS visible_from timestamptz;
COMMENT ON COLUMN public.inquiry_participants.visible_from IS
  'Coordinator client-thread history window: null = full history; set = only private messages at/after this time (assign-time "start fresh").';
CREATE INDEX IF NOT EXISTS idx_participants_coordinator_visible_from
  ON public.inquiry_participants (inquiry_id, visible_from)
  WHERE role = 'coordinator';

COMMIT;
