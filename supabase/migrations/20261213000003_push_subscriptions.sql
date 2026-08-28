-- Support Center M3 — Web Push subscriptions.
--
-- Device endpoints for VAPID web-push. Writes go through service-role
-- server actions (`subscribePushAction` / `unsubscribePushAction`).
-- Authenticated users may SELECT their own rows. Default-off: the
-- channel no-ops when VAPID env vars are unset.
--
-- Rollback: DROP TABLE public.push_subscriptions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id)
  WHERE disabled_at IS NULL;

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push (VAPID) endpoints per user. Service-role writes; self SELECT.';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_self ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.push_subscriptions FROM authenticated, anon;
GRANT SELECT ON public.push_subscriptions TO authenticated;

COMMIT;
