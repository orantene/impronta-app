-- Backfill presenting-female / presenting-male fit_label taxonomy assignments
-- for existing talents based on their gender column.
-- Also adds a trigger to keep the assignment in sync whenever gender changes.

-- 1. Backfill existing talents
INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, is_primary)
SELECT
  tp.id,
  tt.id,
  false
FROM public.talent_profiles tp
JOIN public.taxonomy_terms tt ON
  (tp.gender = 'female' AND tt.slug = 'presenting-female')
  OR (tp.gender = 'male'   AND tt.slug = 'presenting-male')
WHERE tp.gender IN ('female', 'male')
  AND tp.deleted_at IS NULL
ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;

-- 2. Trigger function: keep presenting-gender label in sync with gender column
CREATE OR REPLACE FUNCTION public.sync_gender_presenting_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_female_id uuid;
  v_male_id   uuid;
BEGIN
  SELECT id INTO v_female_id FROM public.taxonomy_terms WHERE slug = 'presenting-female' LIMIT 1;
  SELECT id INTO v_male_id   FROM public.taxonomy_terms WHERE slug = 'presenting-male'   LIMIT 1;

  -- Remove stale presenting labels
  DELETE FROM public.talent_profile_taxonomy
  WHERE talent_profile_id = NEW.id
    AND taxonomy_term_id IN (v_female_id, v_male_id);

  -- Insert new label if gender is set
  IF NEW.gender = 'female' AND v_female_id IS NOT NULL THEN
    INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, is_primary)
    VALUES (NEW.id, v_female_id, false)
    ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;
  ELSIF NEW.gender = 'male' AND v_male_id IS NOT NULL THEN
    INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, is_primary)
    VALUES (NEW.id, v_male_id, false)
    ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to talent_profiles (fires only when gender changes or on insert)
DROP TRIGGER IF EXISTS trg_sync_gender_presenting_label ON public.talent_profiles;
CREATE TRIGGER trg_sync_gender_presenting_label
  AFTER INSERT OR UPDATE OF gender ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_gender_presenting_label();
