-- Impronta Models & Talent
-- Manual core schema repair for partially initialized Supabase databases.
--
-- Run this in Supabase SQL Editor as a privileged role.
-- This script is intentionally idempotent-ish: it creates missing core objects,
-- fills in key missing columns, re-applies helper functions, enables RLS, and
-- recreates essential policies only when their tables exist.
--
-- Use this when:
-- - the database already has some core tables like public.profiles
-- - later migrations fail because other base tables are missing
-- - replaying 20250409000000_init.sql directly causes "already exists" errors

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'agency_staff',
    'talent',
    'client'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.profile_workflow_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'hidden',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.account_status AS ENUM (
    'registered',
    'onboarding',
    'active',
    'suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.membership_tier AS ENUM (
    'free',
    'free_trial',
    'premium',
    'featured'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.membership_status AS ENUM (
    'active',
    'inactive',
    'pending',
    'expired',
    'manual_override'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.visibility AS ENUM ('public', 'hidden', 'private');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.inquiry_status AS ENUM (
    'new',
    'reviewing',
    'waiting_for_client',
    'talent_suggested',
    'in_progress',
    'closed',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.taxonomy_kind AS ENUM (
    'talent_type',
    'tag',
    'skill',
    'event_type',
    'industry',
    'fit_label',
    'language'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.media_approval_state AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.media_variant_kind AS ENUM (
    'original',
    'card',
    'gallery',
    'banner',
    'lightbox',
    'public_watermarked'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.revision_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT,
  app_role public.app_role NOT NULL DEFAULT 'client',
  account_status public.account_status NOT NULL DEFAULT 'registered',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_role public.app_role NOT NULL DEFAULT 'client';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'registered';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);

CREATE OR REPLACE FUNCTION public.is_agency_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.app_role IN ('super_admin', 'agency_staff')
  );
$$;

CREATE TABLE IF NOT EXISTS public.taxonomy_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.taxonomy_kind NOT NULL,
  slug TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_es TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_kind_active
  ON public.taxonomy_terms (kind)
  WHERE archived_at IS NULL;

ALTER TABLE public.taxonomy_terms ADD COLUMN IF NOT EXISTS promo_image_storage_path TEXT;
ALTER TABLE public.taxonomy_terms ADD COLUMN IF NOT EXISTS promo_placements TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  display_name_en TEXT NOT NULL,
  display_name_es TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, city_slug)
);

CREATE TABLE IF NOT EXISTS public.talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  profile_code TEXT NOT NULL UNIQUE,
  public_slug_part TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  short_bio TEXT,
  workflow_status public.profile_workflow_status NOT NULL DEFAULT 'draft',
  visibility public.visibility NOT NULL DEFAULT 'hidden',
  membership_tier public.membership_tier NOT NULL DEFAULT 'free',
  membership_status public.membership_status NOT NULL DEFAULT 'active',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_level INT NOT NULL DEFAULT 0,
  featured_position INT NOT NULL DEFAULT 0,
  featured_until TIMESTAMPTZ,
  listing_started_at TIMESTAMPTZ,
  profile_completeness_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  manual_rank_override INT,
  location_id UUID REFERENCES public.locations (id) ON DELETE SET NULL,
  height_cm INT,
  gender TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS profile_code TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS public_slug_part TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS short_bio TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS workflow_status public.profile_workflow_status NOT NULL DEFAULT 'draft';
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS visibility public.visibility NOT NULL DEFAULT 'hidden';
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS membership_tier public.membership_tier NOT NULL DEFAULT 'free';
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS membership_status public.membership_status NOT NULL DEFAULT 'active';
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS featured_level INT NOT NULL DEFAULT 0;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS featured_position INT NOT NULL DEFAULT 0;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS listing_started_at TIMESTAMPTZ;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS profile_completeness_score NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS manual_rank_override INT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations (id) ON DELETE SET NULL;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS height_cm INT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.talent_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS talent_profiles_profile_code_key
  ON public.talent_profiles (profile_code);

CREATE INDEX IF NOT EXISTS idx_talent_profiles_public_list
  ON public.talent_profiles (workflow_status, visibility, deleted_at)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_profiles_one_live_user
  ON public.talent_profiles (user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE SEQUENCE IF NOT EXISTS public.talent_profile_code_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_profile_code()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'TAL-' || lpad(nextval('public.talent_profile_code_seq')::text, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS public.client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  company_name TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talent_profile_taxonomy (
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  taxonomy_term_id UUID NOT NULL REFERENCES public.taxonomy_terms (id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (talent_profile_id, taxonomy_term_id)
);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  bucket_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  variant_kind public.media_variant_kind NOT NULL DEFAULT 'original',
  sort_order INT NOT NULL DEFAULT 0,
  approval_state public.media_approval_state NOT NULL DEFAULT 'pending',
  width INT,
  height INT,
  file_size BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner
  ON public.media_assets (owner_talent_profile_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.profile_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status public.revision_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.talent_submission_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  workflow_status_at_submit public.profile_workflow_status,
  completion_score_at_submit NUMERIC(5,2),
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_submission_snapshots_profile
  ON public.talent_submission_snapshots (talent_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.talent_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_workflow_events_profile
  ON public.talent_workflow_events (talent_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saved_talent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_session_id UUID REFERENCES public.guest_sessions (id) ON DELETE CASCADE,
  client_user_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guest_session_id, talent_profile_id),
  UNIQUE (client_user_id, talent_profile_id),
  CHECK (
    (guest_session_id IS NOT NULL AND client_user_id IS NULL)
    OR (guest_session_id IS NULL AND client_user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_session_id UUID REFERENCES public.guest_sessions (id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  status public.inquiry_status NOT NULL DEFAULT 'new',
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  company TEXT,
  event_type_id UUID REFERENCES public.taxonomy_terms (id) ON DELETE SET NULL,
  event_date DATE,
  event_location TEXT,
  quantity INT,
  message TEXT,
  raw_ai_query TEXT,
  interpreted_query JSONB,
  source_page TEXT,
  assigned_staff_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  staff_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inquiry_talent (
  inquiry_id UUID NOT NULL REFERENCES public.inquiries (id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  PRIMARY KEY (inquiry_id, talent_profile_id)
);

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_es TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_items (
  collection_id UUID NOT NULL REFERENCES public.collections (id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, talent_profile_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, app_role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    'client'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.talent_profile_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profile_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.talent_submission_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.talent_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saved_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inquiry_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self_or_staff ON public.profiles;
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS profiles_update_self_or_staff ON public.profiles;
CREATE POLICY profiles_update_self_or_staff ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS staff_permissions_staff ON public.staff_permissions;
CREATE POLICY staff_permissions_staff ON public.staff_permissions
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS taxonomy_select_active ON public.taxonomy_terms;
CREATE POLICY taxonomy_select_active ON public.taxonomy_terms
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());

DROP POLICY IF EXISTS taxonomy_write_staff ON public.taxonomy_terms;
CREATE POLICY taxonomy_write_staff ON public.taxonomy_terms
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());

DROP POLICY IF EXISTS locations_write_staff ON public.locations;
CREATE POLICY locations_write_staff ON public.locations
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_select_public ON public.talent_profiles;
CREATE POLICY talent_select_public ON public.talent_profiles
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND workflow_status = 'approved'
    AND visibility = 'public'
  );

DROP POLICY IF EXISTS talent_select_own ON public.talent_profiles;
CREATE POLICY talent_select_own ON public.talent_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS talent_select_staff ON public.talent_profiles;
CREATE POLICY talent_select_staff ON public.talent_profiles
  FOR SELECT USING (public.is_agency_staff());

DROP POLICY IF EXISTS talent_insert_staff ON public.talent_profiles;
CREATE POLICY talent_insert_staff ON public.talent_profiles
  FOR INSERT WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_insert_self ON public.talent_profiles;
CREATE POLICY talent_insert_self ON public.talent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS talent_update_own ON public.talent_profiles;
CREATE POLICY talent_update_own ON public.talent_profiles
  FOR UPDATE
  USING (user_id = auth.uid() OR public.is_agency_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS talent_delete_staff ON public.talent_profiles;
CREATE POLICY talent_delete_staff ON public.talent_profiles
  FOR DELETE USING (public.is_agency_staff());

DROP POLICY IF EXISTS client_profiles_select_own ON public.client_profiles;
CREATE POLICY client_profiles_select_own ON public.client_profiles
  FOR SELECT USING (user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS client_profiles_write_own ON public.client_profiles;
CREATE POLICY client_profiles_write_own ON public.client_profiles
  FOR ALL
  USING (user_id = auth.uid() OR public.is_agency_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS guest_sessions_insert_anon ON public.guest_sessions;
CREATE POLICY guest_sessions_insert_anon ON public.guest_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS guest_sessions_select_staff ON public.guest_sessions;
CREATE POLICY guest_sessions_select_staff ON public.guest_sessions
  FOR SELECT USING (public.is_agency_staff());

DROP POLICY IF EXISTS talent_taxonomy_select ON public.talent_profile_taxonomy;
CREATE POLICY talent_taxonomy_select ON public.talent_profile_taxonomy
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.deleted_at IS NULL
        AND (
          (t.workflow_status = 'approved' AND t.visibility = 'public')
          OR t.user_id = auth.uid()
          OR public.is_agency_staff()
        )
    )
  );

DROP POLICY IF EXISTS talent_taxonomy_write_staff ON public.talent_profile_taxonomy;
CREATE POLICY talent_taxonomy_write_staff ON public.talent_profile_taxonomy
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_taxonomy_write_own_talent ON public.talent_profile_taxonomy;
CREATE POLICY talent_taxonomy_write_own_talent ON public.talent_profile_taxonomy
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS media_select ON public.media_assets;
CREATE POLICY media_select ON public.media_assets
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      public.is_agency_staff()
      OR EXISTS (
        SELECT 1 FROM public.talent_profiles t
        WHERE t.id = owner_talent_profile_id
          AND t.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.talent_profiles t
        WHERE t.id = owner_talent_profile_id
          AND t.workflow_status = 'approved'
          AND t.visibility = 'public'
          AND approval_state = 'approved'
          AND variant_kind <> 'original'
      )
    )
  );

DROP POLICY IF EXISTS media_write_staff ON public.media_assets;
CREATE POLICY media_write_staff ON public.media_assets
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS media_write_talent ON public.media_assets;
CREATE POLICY media_write_talent ON public.media_assets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS media_update_talent ON public.media_assets;
CREATE POLICY media_update_talent ON public.media_assets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS revisions_select ON public.profile_revisions;
CREATE POLICY revisions_select ON public.profile_revisions
  FOR SELECT USING (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS revisions_insert_talent ON public.profile_revisions;
CREATE POLICY revisions_insert_talent ON public.profile_revisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS revisions_staff_all ON public.profile_revisions;
CREATE POLICY revisions_staff_all ON public.profile_revisions
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_submission_snapshots_staff ON public.talent_submission_snapshots;
CREATE POLICY talent_submission_snapshots_staff ON public.talent_submission_snapshots
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_submission_snapshots_talent_select_own ON public.talent_submission_snapshots;
CREATE POLICY talent_submission_snapshots_talent_select_own ON public.talent_submission_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_workflow_events_staff ON public.talent_workflow_events;
CREATE POLICY talent_workflow_events_staff ON public.talent_workflow_events
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS talent_workflow_events_talent_select_own ON public.talent_workflow_events;
CREATE POLICY talent_workflow_events_talent_select_own ON public.talent_workflow_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS saved_select_own ON public.saved_talent;
CREATE POLICY saved_select_own ON public.saved_talent
  FOR SELECT USING (client_user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS saved_insert_own ON public.saved_talent;
CREATE POLICY saved_insert_own ON public.saved_talent
  FOR INSERT WITH CHECK (client_user_id = auth.uid());

DROP POLICY IF EXISTS saved_delete_own ON public.saved_talent;
CREATE POLICY saved_delete_own ON public.saved_talent
  FOR DELETE USING (client_user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS inquiries_select_own ON public.inquiries;
CREATE POLICY inquiries_select_own ON public.inquiries
  FOR SELECT USING (client_user_id = auth.uid() OR public.is_agency_staff());

DROP POLICY IF EXISTS inquiries_insert_client ON public.inquiries;
CREATE POLICY inquiries_insert_client ON public.inquiries
  FOR INSERT WITH CHECK (client_user_id = auth.uid() OR client_user_id IS NULL);

DROP POLICY IF EXISTS inquiries_staff_all ON public.inquiries;
CREATE POLICY inquiries_staff_all ON public.inquiries
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS inquiry_talent_select ON public.inquiry_talent;
CREATE POLICY inquiry_talent_select ON public.inquiry_talent
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND (i.client_user_id = auth.uid() OR public.is_agency_staff())
    )
  );

DROP POLICY IF EXISTS inquiry_talent_staff ON public.inquiry_talent;
CREATE POLICY inquiry_talent_staff ON public.inquiry_talent
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS collections_select ON public.collections;
CREATE POLICY collections_select ON public.collections
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());

DROP POLICY IF EXISTS collections_staff ON public.collections;
CREATE POLICY collections_staff ON public.collections
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS collection_items_select ON public.collection_items;
CREATE POLICY collection_items_select ON public.collection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id
        AND (c.archived_at IS NULL OR public.is_agency_staff())
    )
  );

DROP POLICY IF EXISTS collection_items_staff ON public.collection_items;
CREATE POLICY collection_items_staff ON public.collection_items
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_staff ON public.notifications;
CREATE POLICY notifications_staff ON public.notifications
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS activity_log_staff ON public.activity_log;
CREATE POLICY activity_log_staff ON public.activity_log
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS settings_staff ON public.settings;
CREATE POLICY settings_staff ON public.settings
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media-originals', 'media-originals', FALSE),
  ('media-public', 'media-public', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS storage_media_public_select ON storage.objects;
CREATE POLICY storage_media_public_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media-public');

DROP POLICY IF EXISTS storage_media_originals_select_authenticated ON storage.objects;
CREATE POLICY storage_media_originals_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media-originals');

DROP POLICY IF EXISTS storage_media_originals_insert_authenticated ON storage.objects;
CREATE POLICY storage_media_originals_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-originals');

DROP POLICY IF EXISTS talent_insert_public_media ON storage.objects;
CREATE POLICY talent_insert_public_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media-public'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_update_own_public_media ON storage.objects;
CREATE POLICY talent_update_own_public_media ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media-public'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_delete_own_public_media ON storage.objects;
CREATE POLICY talent_delete_own_public_media ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media-public'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_insert_originals_media ON storage.objects;
CREATE POLICY talent_insert_originals_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media-originals'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_delete_own_originals_media ON storage.objects;
CREATE POLICY talent_delete_own_originals_media ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media-originals'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  );

INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, aliases, sort_order) VALUES
  ('talent_type', 'model', 'Model', 'Modelo', ARRAY['modelo'], 10),
  ('talent_type', 'hostess', 'Hostess', 'Anfitriona', ARRAY['anfitriona', 'host'], 20),
  ('talent_type', 'promotional-model', 'Promotional Model', 'Modelo promocional', ARRAY['promo model'], 30),
  ('talent_type', 'brand-ambassador', 'Brand Ambassador', 'Embajador de marca', '{}', 40),
  ('talent_type', 'dancer', 'Dancer', 'Bailarín', '{}', 50),
  ('tag', 'luxury', 'Luxury', 'Lujo', '{}', 10),
  ('tag', 'bilingual', 'Bilingual', 'Bilingüe', '{}', 20),
  ('tag', 'multilingual', 'Multilingual', 'Multilingüe', '{}', 30),
  ('skill', 'hosting', 'Hosting', 'Presentación', '{}', 10),
  ('skill', 'modeling', 'Modeling', 'Modelaje', '{}', 20),
  ('event_type', 'hotel-activation', 'Hotel Activation', 'Activación hotelera', '{}', 10),
  ('event_type', 'vip-event', 'VIP Event', 'Evento VIP', '{}', 20),
  ('industry', 'hospitality', 'Hospitality', 'Hospitalidad', '{}', 10),
  ('industry', 'nightlife', 'Nightlife', 'Vida nocturna', '{}', 20),
  ('fit_label', 'best-for-hotel-events', 'Best for Hotel Events', 'Ideal para hoteles', '{}', 10),
  ('fit_label', 'best-for-luxury-activations', 'Best for Luxury Activations', 'Ideal para activaciones de lujo', '{}', 20),
  ('language', 'en', 'English', 'Inglés', '{}', 10),
  ('language', 'es', 'Spanish', 'Español', '{}', 20),
  ('language', 'pt', 'Portuguese', 'Portugués', '{}', 30)
ON CONFLICT (kind, slug) DO NOTHING;

INSERT INTO public.locations (country_code, city_slug, display_name_en, display_name_es) VALUES
  ('MX', 'playa-del-carmen', 'Playa del Carmen', 'Playa del Carmen'),
  ('MX', 'cancun', 'Cancún', 'Cancún'),
  ('ES', 'ibiza', 'Ibiza', 'Ibiza')
ON CONFLICT (country_code, city_slug) DO NOTHING;

COMMIT;
