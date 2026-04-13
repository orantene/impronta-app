-- Impronta Models & Talent — core schema, RLS, storage buckets, taxonomy seeds
-- Apply with: supabase db push / supabase migration up / SQL editor

BEGIN;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- ---------------------------------------------------------------------------
-- Enums (orthogonal state dimensions per blueprint)
-- ---------------------------------------------------------------------------
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
-- ---------------------------------------------------------------------------
-- Profiles (auth extension — separate from talent_profiles per blueprint)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT,
  app_role public.app_role NOT NULL DEFAULT 'client',
  account_status public.account_status NOT NULL DEFAULT 'registered',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_permissions (
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);
-- ---------------------------------------------------------------------------
-- Helper: agency staff check (SECURITY DEFINER avoids RLS recursion on profiles)
-- ---------------------------------------------------------------------------
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
-- ---------------------------------------------------------------------------
-- Taxonomy & locations
-- ---------------------------------------------------------------------------
CREATE TABLE public.taxonomy_terms (
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
CREATE INDEX idx_taxonomy_terms_kind_active
  ON public.taxonomy_terms (kind)
  WHERE archived_at IS NULL;
CREATE TABLE public.locations (
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
-- ---------------------------------------------------------------------------
-- Talent & client profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.talent_profiles (
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
CREATE INDEX idx_talent_profiles_public_list
  ON public.talent_profiles (workflow_status, visibility, deleted_at)
  WHERE deleted_at IS NULL;
CREATE TABLE public.client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  company_name TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.talent_profile_taxonomy (
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  taxonomy_term_id UUID NOT NULL REFERENCES public.taxonomy_terms (id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (talent_profile_id, taxonomy_term_id)
);
-- ---------------------------------------------------------------------------
-- Media (metadata in DB; files in Storage — owner vs uploader per blueprint)
-- ---------------------------------------------------------------------------
CREATE TABLE public.media_assets (
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
CREATE INDEX idx_media_assets_owner ON public.media_assets (owner_talent_profile_id)
  WHERE deleted_at IS NULL;
-- ---------------------------------------------------------------------------
-- Revisions, saves, inquiries, collections
-- ---------------------------------------------------------------------------
CREATE TABLE public.profile_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status public.revision_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE TABLE public.saved_talent (
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
CREATE TABLE public.inquiries (
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
CREATE TABLE public.inquiry_talent (
  inquiry_id UUID NOT NULL REFERENCES public.inquiries (id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  PRIMARY KEY (inquiry_id, talent_profile_id)
);
CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_es TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.collection_items (
  collection_id UUID NOT NULL REFERENCES public.collections (id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, talent_profile_id)
);
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ---------------------------------------------------------------------------
-- Auth: provision profile row on signup
-- ---------------------------------------------------------------------------
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
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profile_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
-- profiles
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_agency_staff());
CREATE POLICY profiles_update_self_or_staff ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_agency_staff());
-- staff_permissions: staff only
CREATE POLICY staff_permissions_staff ON public.staff_permissions
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- taxonomy & locations: public read active; staff write
CREATE POLICY taxonomy_select_active ON public.taxonomy_terms
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());
CREATE POLICY taxonomy_write_staff ON public.taxonomy_terms
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY locations_select ON public.locations
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());
CREATE POLICY locations_write_staff ON public.locations
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- talent_profiles
CREATE POLICY talent_select_public ON public.talent_profiles
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND workflow_status = 'approved'
    AND visibility = 'public'
  );
CREATE POLICY talent_select_own ON public.talent_profiles
  FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY talent_select_staff ON public.talent_profiles
  FOR SELECT
  USING (public.is_agency_staff());
CREATE POLICY talent_insert_staff ON public.talent_profiles
  FOR INSERT WITH CHECK (public.is_agency_staff());
CREATE POLICY talent_update_own ON public.talent_profiles
  FOR UPDATE
  USING (user_id = auth.uid() OR public.is_agency_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_agency_staff());
CREATE POLICY talent_delete_staff ON public.talent_profiles
  FOR DELETE USING (public.is_agency_staff());
-- client_profiles
CREATE POLICY client_profiles_select_own ON public.client_profiles
  FOR SELECT USING (user_id = auth.uid() OR public.is_agency_staff());
CREATE POLICY client_profiles_write_own ON public.client_profiles
  FOR ALL
  USING (user_id = auth.uid() OR public.is_agency_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_agency_staff());
-- guest_sessions: created via service role or anon insert for session key — allow insert for anon with limited use
CREATE POLICY guest_sessions_insert_anon ON public.guest_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
CREATE POLICY guest_sessions_select_staff ON public.guest_sessions
  FOR SELECT USING (public.is_agency_staff());
-- talent_profile_taxonomy: follow talent profile access
CREATE POLICY talent_taxonomy_select ON public.talent_profile_taxonomy
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.deleted_at IS NULL
        AND (
          (t.workflow_status = 'approved' AND t.visibility = 'public')
          OR t.user_id = auth.uid()
          OR public.is_agency_staff()
        )
    )
  );
CREATE POLICY talent_taxonomy_write_staff ON public.talent_profile_taxonomy
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
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
-- media_assets
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
CREATE POLICY media_write_staff ON public.media_assets
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY media_write_talent ON public.media_assets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY media_update_talent ON public.media_assets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  );
-- profile_revisions
CREATE POLICY revisions_select ON public.profile_revisions
  FOR SELECT USING (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY revisions_insert_talent ON public.profile_revisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = talent_profile_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY revisions_staff_all ON public.profile_revisions
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- saved_talent
CREATE POLICY saved_select_own ON public.saved_talent
  FOR SELECT USING (client_user_id = auth.uid() OR public.is_agency_staff());
CREATE POLICY saved_insert_own ON public.saved_talent
  FOR INSERT WITH CHECK (client_user_id = auth.uid());
CREATE POLICY saved_delete_own ON public.saved_talent
  FOR DELETE USING (client_user_id = auth.uid() OR public.is_agency_staff());
-- inquiries
CREATE POLICY inquiries_select_own ON public.inquiries
  FOR SELECT USING (client_user_id = auth.uid() OR public.is_agency_staff());
CREATE POLICY inquiries_insert_client ON public.inquiries
  FOR INSERT WITH CHECK (client_user_id = auth.uid() OR client_user_id IS NULL);
CREATE POLICY inquiries_staff_all ON public.inquiries
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY inquiry_talent_select ON public.inquiry_talent
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND (i.client_user_id = auth.uid() OR public.is_agency_staff())
    )
  );
CREATE POLICY inquiry_talent_staff ON public.inquiry_talent
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- collections: public read non-archived; staff write
CREATE POLICY collections_select ON public.collections
  FOR SELECT USING (archived_at IS NULL OR public.is_agency_staff());
CREATE POLICY collections_staff ON public.collections
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY collection_items_select ON public.collection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id AND (c.archived_at IS NULL OR public.is_agency_staff())
    )
  );
CREATE POLICY collection_items_staff ON public.collection_items
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- notifications
CREATE POLICY notifications_own ON public.notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_staff ON public.notifications
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- activity_log: staff only
CREATE POLICY activity_log_staff ON public.activity_log
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- settings: public read keys needed for frontend watermarks etc. — restrict to staff read/write
CREATE POLICY settings_staff ON public.settings
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- ---------------------------------------------------------------------------
-- Storage buckets (originals private, public derivatives readable)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media-originals', 'media-originals', FALSE),
  ('media-public', 'media-public', TRUE)
ON CONFLICT (id) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Seed taxonomy (blueprint §12 — representative set)
-- ---------------------------------------------------------------------------
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
  ('language', 'pt', 'Portuguese', 'Portugués', '{}', 30);
INSERT INTO public.locations (country_code, city_slug, display_name_en, display_name_es) VALUES
  ('MX', 'playa-del-carmen', 'Playa del Carmen', 'Playa del Carmen'),
  ('MX', 'cancun', 'Cancún', 'Cancún'),
  ('ES', 'ibiza', 'Ibiza', 'Ibiza');
-- ---------------------------------------------------------------------------
-- Storage: public derivatives readable; originals limited (tighten paths later)
-- ---------------------------------------------------------------------------
CREATE POLICY storage_media_public_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media-public');
CREATE POLICY storage_media_originals_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media-originals');
CREATE POLICY storage_media_originals_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-originals');
-- Allow talents to manage their own objects in media-public and media-originals.
-- Path convention: first segment MUST be talent_profiles.id (UUID) for ownership checks.
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
COMMIT;
