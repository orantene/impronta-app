BEGIN;
-- Normalize duplicate protection around active field groups.
-- We keep archived rows flexible, but active groups must have unique visible names/slugs.

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_groups_active_slug_unique
  ON public.field_groups (lower(btrim(slug)))
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_field_groups_active_name_en_unique
  ON public.field_groups (lower(btrim(name_en)))
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_field_groups_active_name_es_unique
  ON public.field_groups (lower(btrim(name_es)))
  WHERE archived_at IS NULL
    AND name_es IS NOT NULL
    AND btrim(name_es) <> '';
COMMIT;
