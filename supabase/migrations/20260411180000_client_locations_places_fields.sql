-- Work location (client_accounts): richer place intake + Google metadata.

BEGIN;
-- New commercial location kinds (keep existing enum values for legacy rows).
DO $$
BEGIN
  ALTER TYPE public.client_account_type ADD VALUE 'bar_nightclub';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  ALTER TYPE public.client_account_type ADD VALUE 'brand_activation';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  ALTER TYPE public.client_account_type ADD VALUE 'event_venue';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  ALTER TYPE public.client_account_type ADD VALUE 'office_company';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS address_notes TEXT,
  ADD COLUMN IF NOT EXISTS account_type_detail TEXT;
COMMENT ON COLUMN public.client_accounts.google_place_id IS 'Google Places place_id when sourced from autocomplete.';
COMMENT ON COLUMN public.client_accounts.account_type_detail IS 'Free-text subtype when account_type is other.';
COMMIT;
