-- Adds home_place_id (Google place_id for the home city) and
-- upcoming_visits (JSON array of { id, city, placeId, date, dateEnd })
-- to talent_profiles. Both are optional and backward-compatible.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'talent_profiles' AND column_name = 'home_place_id'
  ) THEN
    ALTER TABLE public.talent_profiles ADD COLUMN home_place_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'talent_profiles' AND column_name = 'upcoming_visits'
  ) THEN
    ALTER TABLE public.talent_profiles ADD COLUMN upcoming_visits jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
