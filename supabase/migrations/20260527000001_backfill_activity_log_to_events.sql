-- Backfill inquiry_activity_log → inquiry_events.
--
-- Maps legacy event_type strings to canonical names.
-- Detects actor_role from profiles.app_role (NULL actor → 'system').
-- All backfilled rows get visibility = 'participants' (they were already
-- visible to staff via inquiry_activity_log, and the content is not
-- staff-only sensitive).
--
-- Idempotent: ON CONFLICT (id) DO NOTHING means re-running is safe.
-- The ids are carried over from inquiry_activity_log so duplicates are caught.
--
-- Event type mapping:
--   'offer_sent'                     → 'offer.sent'
--   'approval_submitted' (accepted)  → 'approval.approved'
--   'approval_submitted' (rejected)  → 'approval.rejected'
--   'approval_submitted' (other)     → 'approval.submitted'
--   'inquiry_converted_to_booking'   → 'booking.created'
--   'inquiry.client_cancelled'       → 'inquiry.cancelled'
--   <anything else>                  → 'legacy.' || event_type
--
-- DO NOT run this migration before 20260527000000_inquiry_events.sql.
-- Run 20260527000005_drop_activity_log.sql ONLY after verifying the row count matches.

BEGIN;

INSERT INTO public.inquiry_events (
  id,
  inquiry_id,
  event_type,
  actor_user_id,
  actor_role,
  visibility,
  payload,
  created_at
)
SELECT
  al.id,
  al.inquiry_id,

  -- Canonical event_type mapping
  CASE al.event_type
    WHEN 'offer_sent'                   THEN 'offer.sent'
    WHEN 'inquiry_converted_to_booking' THEN 'booking.created'
    WHEN 'inquiry.client_cancelled'     THEN 'inquiry.cancelled'
    WHEN 'approval_submitted'           THEN
      CASE (al.payload->>'decision')
        WHEN 'accepted' THEN 'approval.approved'
        WHEN 'rejected' THEN 'approval.rejected'
        ELSE 'approval.submitted'
      END
    ELSE CONCAT('legacy.', al.event_type)
  END AS event_type,

  al.actor_user_id,

  -- Actor role: join profiles to detect staff vs client vs system
  COALESCE(
    CASE p.app_role
      WHEN 'super_admin'  THEN 'admin'::public.inquiry_event_actor_role
      WHEN 'agency_staff' THEN 'coordinator'::public.inquiry_event_actor_role
      WHEN 'talent'       THEN 'talent'::public.inquiry_event_actor_role
      WHEN 'client'       THEN 'client'::public.inquiry_event_actor_role
      ELSE NULL
    END,
    CASE WHEN al.actor_user_id IS NULL THEN 'system'::public.inquiry_event_actor_role
         ELSE 'client'::public.inquiry_event_actor_role
    END
  ) AS actor_role,

  'participants'::public.inquiry_event_visibility AS visibility,
  al.payload,
  al.created_at

FROM public.inquiry_activity_log al
LEFT JOIN public.profiles p ON p.id = al.actor_user_id

ON CONFLICT (id) DO NOTHING;

-- Verification: confirm row counts match before allowing drop migration.
-- Run manually after applying this migration:
--
--   SELECT
--     (SELECT COUNT(*) FROM public.inquiry_activity_log)    AS source_rows,
--     (SELECT COUNT(*) FROM public.inquiry_events
--      WHERE id IN (SELECT id FROM public.inquiry_activity_log)) AS backfilled_rows;
--
-- Both numbers must match. If they differ, DO NOT run the drop migration.

COMMIT;
