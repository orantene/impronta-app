-- Fix handle_new_user: honour signup_intent metadata so talent signups
-- start with app_role='talent' instead of 'client'.
--
-- Without this, every new user (including modal talent registrations)
-- starts as 'client'. complete_talent_onboarding_with_locations() still
-- promotes the role — but only after the talent-location form is submitted.
-- Setting the role from metadata means the user has the right role from the
-- very first request, guarding against partial-onboarding edge cases.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, app_role, account_status)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    -- Respect signup_intent: talent signups from the register modal
    -- arrive with signup_intent='talent' in raw_user_meta_data so they
    -- immediately land with the correct role. All other signups default to
    -- 'client' (the original behaviour, preserved for back-compat).
    CASE
      WHEN NEW.raw_user_meta_data ->> 'signup_intent' = 'talent'
        THEN 'talent'::public.app_role
      ELSE 'client'::public.app_role
    END,
    'onboarding'
  );
  RETURN NEW;
END;
$$;
