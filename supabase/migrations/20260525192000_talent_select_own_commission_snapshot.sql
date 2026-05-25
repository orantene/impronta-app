-- Phase D — allow talent to read commission snapshots for bookings they are on.
-- Additive policy: staff/platform paths from booking_commission_snapshot_read remain.

BEGIN;

DROP POLICY IF EXISTS booking_commission_snapshot_select_talent ON public.booking_commission_snapshot;
CREATE POLICY booking_commission_snapshot_select_talent ON public.booking_commission_snapshot
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.booking_talent bt
      JOIN public.talent_profiles tp ON tp.id = bt.talent_profile_id
      WHERE bt.booking_id = booking_commission_snapshot.booking_id
        AND tp.user_id = auth.uid()
    )
  );

COMMENT ON POLICY booking_commission_snapshot_select_talent ON public.booking_commission_snapshot IS
  'Talent self-view: SELECT snapshots for bookings where the signed-in user is rostered via booking_talent.';

COMMIT;
