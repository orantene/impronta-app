-- Merge duplicate active field_groups that share the same visible name (EN),
-- reassign field_definitions to the canonical row, then archive duplicates.
-- Canonical = lowest sort_order, then earliest created_at.

BEGIN;
DO $$
DECLARE
  dup RECORD;
  keeper uuid;
  gid uuid;
BEGIN
  FOR dup IN
    SELECT lower(btrim(name_en)) AS norm
    FROM public.field_groups
    WHERE archived_at IS NULL
      AND length(btrim(name_en)) > 0
    GROUP BY lower(btrim(name_en))
    HAVING count(*) > 1
  LOOP
    SELECT fg.id INTO keeper
    FROM public.field_groups fg
    WHERE fg.archived_at IS NULL
      AND lower(btrim(fg.name_en)) = dup.norm
    ORDER BY fg.sort_order NULLS LAST, fg.created_at
    LIMIT 1;

    FOR gid IN
      SELECT fg.id
      FROM public.field_groups fg
      WHERE fg.archived_at IS NULL
        AND lower(btrim(fg.name_en)) = dup.norm
        AND fg.id <> keeper
    LOOP
      UPDATE public.field_definitions
      SET field_group_id = keeper, updated_at = now()
      WHERE field_group_id = gid;

      UPDATE public.field_groups
      SET archived_at = now(), updated_at = now()
      WHERE id = gid;
    END LOOP;
  END LOOP;
END
$$;
COMMIT;
