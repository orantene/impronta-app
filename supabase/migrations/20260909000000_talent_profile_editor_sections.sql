-- Phase: talent profile editor — persist all drawer sections to DB.
--
-- Adds structured JSONB/scalar columns so every section of the talent
-- profile drawer has a real storage home instead of living in the
-- reducer and evaporating on page reload.
--
-- Columns added to talent_profiles (talent-owned data):
--   bios                JSONB  — [{locale, text}]
--   bio_tone            TEXT   — e.g. "professional", "casual"
--   personality_traits  JSONB  — string[]
--   tagline             TEXT
--   rates_data          JSONB  — [{typeId, amount, currency, unit}]
--   package_rates_data  JSONB  — [{id, name, description, amount, currency}]
--   rate_card_visibility TEXT
--   ask_for_quote       BOOLEAN
--   travel_included     BOOLEAN
--   lodging_included    BOOLEAN
--   availability_data   JSONB  — {cells:[{date,status}], recurring, vacation}
--   credits_data        JSONB  — [{id, title, brand, role, year, pinned}]
--   limits_data         JSONB  — {hardLimits:[], softLimits:[]}
--   social_proof_data   JSONB  — [{id, brand, quote, verified}]
--   remote_only         BOOLEAN
--   travel_radius_km    INTEGER
--   travel_fee_required BOOLEAN
--   passport_status     TEXT
--   drivers_license     TEXT
--   work_eligibility    JSONB  — string[]
--
-- Columns added to agency_talent_roster (roster/tenant-specific data):
--   internal_notes      TEXT
--   emergency_contact   JSONB  — {name, relation, phone}
--   field_locks_data    JSONB  — {locks:string[], reasons:{[key]:string}}
--   feature_in_directory BOOLEAN
--
-- DOWN: drop the added columns (all IF NOT EXISTS / IF EXISTS safe).

BEGIN;

-- ─── talent_profiles ──────────────────────────────────────────────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS bios                JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bio_tone            TEXT,
  ADD COLUMN IF NOT EXISTS personality_traits  JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tagline             TEXT,
  ADD COLUMN IF NOT EXISTS rates_data          JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS package_rates_data  JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_card_visibility TEXT    NOT NULL DEFAULT 'agency-only',
  ADD COLUMN IF NOT EXISTS ask_for_quote       BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS travel_included     BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lodging_included    BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS availability_data   JSONB    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS credits_data        JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS limits_data         JSONB    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_proof_data   JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS remote_only         BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS travel_radius_km    INTEGER,
  ADD COLUMN IF NOT EXISTS travel_fee_required BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passport_status     TEXT,
  ADD COLUMN IF NOT EXISTS drivers_license     TEXT,
  ADD COLUMN IF NOT EXISTS work_eligibility    JSONB    NOT NULL DEFAULT '[]'::jsonb;

-- rate_card_visibility CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'talent_profiles_rate_card_visibility_chk'
       AND table_name = 'talent_profiles'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_rate_card_visibility_chk
      CHECK (rate_card_visibility IN ('public','agency-only','on-request'));
  END IF;
END $$;

-- passport_status CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'talent_profiles_passport_status_chk'
       AND table_name = 'talent_profiles'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_passport_status_chk
      CHECK (passport_status IS NULL OR passport_status IN ('valid','expired','none'));
  END IF;
END $$;

-- drivers_license CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'talent_profiles_drivers_license_chk'
       AND table_name = 'talent_profiles'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_drivers_license_chk
      CHECK (drivers_license IS NULL OR drivers_license IN ('none','standard','international','commercial'));
  END IF;
END $$;

COMMENT ON COLUMN public.talent_profiles.bios IS
  'Multi-locale bios. Array of {locale: string, text: string}. English (en) is the primary locale.';
COMMENT ON COLUMN public.talent_profiles.rates_data IS
  'Rate cards. Array of {typeId, amount, currency, unit}. Denormalised for fast read; source of truth for invoicing is separate.';
COMMENT ON COLUMN public.talent_profiles.availability_data IS
  'Availability calendar. {cells:[{date:YYYY-MM-DD, status:open|busy|blocked}], recurring:{...}, vacation:{...}}.';
COMMENT ON COLUMN public.talent_profiles.credits_data IS
  'Past work credits. Array of {id, title, brand, role, year, pinned}.';
COMMENT ON COLUMN public.talent_profiles.limits_data IS
  'Content/work limits. {hardLimits:string[], softLimits:string[], customNote:string}.';
COMMENT ON COLUMN public.talent_profiles.social_proof_data IS
  'Past clients and testimonials. Array of {id, brand, logoUrl, quote, year, verified}.';

-- ─── agency_talent_roster ─────────────────────────────────────────────────────

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS internal_notes       TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact    JSONB    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_locks_data     JSONB    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_in_directory BOOLEAN  NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agency_talent_roster.internal_notes IS
  'Agency-internal notes about this talent. Not visible to the talent. Max 4 KB.';
COMMENT ON COLUMN public.agency_talent_roster.emergency_contact IS
  '{name: string, relation: string, phone: string}. Visible to coordinators during active bookings only.';
COMMENT ON COLUMN public.agency_talent_roster.field_locks_data IS
  '{locks: string[], reasons: {[fieldPath: string]: string}}. Fields the talent cannot self-edit without admin approval.';
COMMENT ON COLUMN public.agency_talent_roster.feature_in_directory IS
  'Pin this talent near the top of the public directory.';

COMMIT;
