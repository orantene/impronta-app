-- Field groups: stronger duplicate prevention (slug + localized names).
-- Goals:
-- - Prevent duplicates across active (non-archived) groups
-- - Keep archived rows for history without blocking reuse

BEGIN;
-- Slug is already UNIQUE (hard constraint) from core migration.
-- Add name uniqueness for active groups (case-insensitive).
-- Note: these are partial indexes so archived groups don't block reuse.

CREATE UNIQUE INDEX IF NOT EXISTS field_groups_name_en_unique_active
  ON public.field_groups (lower(name_en))
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS field_groups_name_es_unique_active
  ON public.field_groups (lower(name_es))
  WHERE archived_at IS NULL
    AND name_es IS NOT NULL
    AND length(btrim(name_es)) > 0;
COMMIT;
