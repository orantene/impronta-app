-- TUL-65 / Client Account P5: allow recording Apple sign-ins on client_auth_events.
-- Foundation CHECK was ('email_code', 'google', 'password', 'sso') only.

DO $$
BEGIN
  IF to_regclass('public.client_auth_events') IS NULL THEN
    RAISE NOTICE 'client_auth_events missing; skip apple method widen';
    RETURN;
  END IF;

  ALTER TABLE public.client_auth_events
    DROP CONSTRAINT IF EXISTS client_auth_events_method_check;

  ALTER TABLE public.client_auth_events
    ADD CONSTRAINT client_auth_events_method_check
    CHECK (method IN ('email_code', 'google', 'password', 'sso', 'apple'));
END $$;
