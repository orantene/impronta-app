-- P0 confidentiality: close the inquiry_events agency-margin leak.
--
-- The merged SELECT policy `inquiry_events_merged_select_public`
-- (20260615200005_consolidate_permissive_policies) let ANY active inquiry
-- participant — INCLUDING peer lineup talents — read every 'participants'-tier
-- event on the inquiry. That includes:
--   • offer.sent          payload { total_client_price, ... }
--   • payment.requested   payload { gross_amount_cents, ... }
--   • payment.received    payload { amount_cents, ... }
-- A talent already knows their own cut, so reading the client's GROSS price lets
-- them back out the agency's markup (margin = client gross − own cost). That is the
-- exact confidentiality the group offer-card deliberately redacts — but a talent
-- could bypass the UI entirely with a direct PostgREST read
-- (/rest/v1/inquiry_events?inquiry_id=eq.…) under their own JWT.
--
-- Fix: re-scope the participant branch by role.
--   • Staff               → unchanged: full read (is_staff_of_tenant).
--   • The paying client    → unchanged: sees their own pricing
--                            (inquiries.client_user_id = the viewer).
--   • Every OTHER participant (talents) → may read a 'participants' row only when it
--     carries no money. Enforced two ways (defense in depth) so a future money event
--     stays closed by default:
--       (a) event_type is not a known money-bearing type, AND
--       (b) the payload holds none of the money keys.
--
-- SELECT-only policy; the table still REVOKEs all writes from authenticated (only
-- SECURITY DEFINER engine RPCs write). auth.uid() is wrapped in a scalar subquery to
-- preserve the RLS initplan optimization (20260615200003).

BEGIN;

DROP POLICY IF EXISTS inquiry_events_merged_select_public ON public.inquiry_events;

CREATE POLICY inquiry_events_merged_select_public ON public.inquiry_events
  FOR SELECT
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR (
      visibility = 'participants'
      AND EXISTS (
        SELECT 1 FROM public.inquiry_participants ip
        WHERE ip.inquiry_id = inquiry_events.inquiry_id
          AND ip.user_id    = (SELECT auth.uid())
          AND ip.status     = 'active'
      )
      AND (
        -- The paying client sees their own pricing.
        EXISTS (
          SELECT 1 FROM public.inquiries i
          WHERE i.id = inquiry_events.inquiry_id
            AND i.client_user_id = (SELECT auth.uid())
        )
        -- Every other participant (talents) sees money-free events only.
        OR (
          event_type NOT IN (
            'offer.created', 'offer.draft_updated', 'offer.sent',
            'payment.requested', 'payment.received', 'payment.receiver_selected'
          )
          AND NOT (payload ?| ARRAY[
            'total_client_price', 'gross_amount_cents', 'amount_cents',
            'net_amount_cents', 'platform_fee_cents', 'talent_cost',
            'net_to_talent', 'agency_margin', 'margin'
          ])
        )
      )
    )
  );

COMMIT;
