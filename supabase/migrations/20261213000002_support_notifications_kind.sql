-- Widen user_notifications.kind to include 'ticket' so support catalog
-- entries can write in-app bell rows with kind:'ticket' (life-buoy icon,
-- targetDrawer support-ticket). Drop + re-add the CHECK so re-runs are safe.

BEGIN;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_kind_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_kind_check
  CHECK (kind IN (
    'message','offer','booking','payment','approval','system','profile','ticket'
  ));

COMMIT;
