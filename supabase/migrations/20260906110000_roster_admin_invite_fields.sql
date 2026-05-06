-- Roster admin invite fields.
--
-- Adds two convenience columns to talent_profiles for admin-created roster
-- entries that haven't been claimed by a talent yet:
--
--   invitation_email  — the email the admin intends to use for the claim
--                       invite. Null once the talent claims the profile
--                       (at which point auth.users / profiles.email is
--                       authoritative).
--
--   home_city_text    — denormalised free-text home city for admin
--                       quick-add. Shown on roster cards as a fallback
--                       when no talent_service_areas home_base row exists.
--                       Superseded by the proper locations + service_areas
--                       row once the talent completes their own profile.

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS invitation_email TEXT,
  ADD COLUMN IF NOT EXISTS home_city_text   TEXT;
