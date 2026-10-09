-- A talent can read HER OWN sales (additive, SELECT only).
--
-- Why: the talent Money page reads booking_talent -> agency_bookings -> booking_commission_snapshot with her own
-- client. None of the first two has a talent self-read policy (only client, coordinator and tenant-staff policies),
-- and the snapshot's talent clause joins through booking_talent, so it never matched either. A talent who is the
-- SELLER but not a COORDINATOR of a sale (a client-initiated hub inquiry) saw her own paid sale as nothing:
-- Cobrado $0, Pagos 0 (paid run 2026-10-09).
--
-- Shape: three tiny SECURITY DEFINER boolean helpers (so the policies never recurse through each other's RLS),
-- each answering only "is this row mine" for auth.uid(); SELECT policies on top (booking_talent, agency_bookings, her own talent payout legs, and the snapshot). No write policy, no
-- grant to anon. The snapshot talent clause is NARROWED to her own participant rows (it used to be "any
-- snapshot row of a booking I am on", which would leak co-talents' rows once booking_talent became visible).
--
-- Rollback: drop the policies (booking_talent_self_select, agency_bookings_seller_select, booking_payouts_talent_self_select), restore the previous snapshot policy (see the DO block), drop the helpers.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_own_talent_profile(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = p_talent_profile_id AND tp.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_booking_seller(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_talent bt
    JOIN public.talent_profiles tp ON tp.id = bt.talent_profile_id
    WHERE bt.booking_id = p_booking_id AND tp.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_own_talent_participant(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inquiry_participants ip
    JOIN public.talent_profiles tp ON tp.id = ip.talent_profile_id
    WHERE ip.id = p_participant_id AND tp.user_id = (SELECT auth.uid())
  );
$$;

-- Never executable by anon / public (the 2026-09-03 anon-DEFINER incident): signed-in users only.
REVOKE ALL ON FUNCTION public.is_own_talent_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_booking_seller(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_talent_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_talent_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_booking_seller(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_talent_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS booking_talent_self_select ON public.booking_talent;
CREATE POLICY booking_talent_self_select ON public.booking_talent
  FOR SELECT TO authenticated
  USING (public.is_own_talent_profile(talent_profile_id));

-- Her own TALENT payout legs (the transferred_at the Money page windows "paid" on). Never a workspace leg.
DROP POLICY IF EXISTS booking_payouts_talent_self_select ON public.booking_payouts;
CREATE POLICY booking_payouts_talent_self_select ON public.booking_payouts
  FOR SELECT TO authenticated
  USING (party = 'talent' AND public.is_own_talent_profile(talent_profile_id));

DROP POLICY IF EXISTS agency_bookings_seller_select ON public.agency_bookings;
CREATE POLICY agency_bookings_seller_select ON public.agency_bookings
  FOR SELECT TO authenticated
  USING (public.is_booking_seller(id));

-- Snapshot: HER participant rows only. Production has the merged policy (coordinator OR talent-through-booking_talent);
-- other environments have the older separate talent policy. Both end up with the narrow clause.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_commission_snapshot'
      AND policyname = 'booking_commission_snapshot_merged_select_authenticated'
  ) THEN
    ALTER POLICY booking_commission_snapshot_merged_select_authenticated ON public.booking_commission_snapshot
      USING (public.is_booking_coordinator(booking_id) OR public.is_own_talent_participant(participant_id));
  ELSE
    DROP POLICY IF EXISTS booking_commission_snapshot_select_talent ON public.booking_commission_snapshot;
    DROP POLICY IF EXISTS booking_commission_snapshot_talent_self_select ON public.booking_commission_snapshot;
    CREATE POLICY booking_commission_snapshot_talent_self_select ON public.booking_commission_snapshot
      FOR SELECT TO authenticated
      USING (public.is_own_talent_participant(participant_id));
  END IF;
END
$$;

COMMENT ON POLICY booking_talent_self_select ON public.booking_talent IS 'A talent reads her own booking_talent rows.';
COMMENT ON POLICY agency_bookings_seller_select ON public.agency_bookings IS 'A talent reads the bookings she is a seller on (booking_talent row of hers).';

COMMIT;
