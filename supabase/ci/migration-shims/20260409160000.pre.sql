-- 20260409160000_field_group_duplicate_prevention adds a unique index on
-- lower(name_en) for active field groups. Replayed from scratch, the seed
-- rows of 20260409094500 (field_system_core) and 20260409120000
-- (talent_profile_field_structure) leave duplicate active labels (e.g. two
-- "Basic Information" groups). Production was deduplicated by hand before
-- this ran (see supabase/manual_audit_merge_duplicate_field_groups.sql).
-- Mirror that: keep the newest active group per label, archive the rest.
UPDATE public.field_groups g
SET archived_at = now()
WHERE g.archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.field_groups n
    WHERE n.archived_at IS NULL
      AND lower(n.name_en) = lower(g.name_en)
      AND (n.created_at, n.slug) > (g.created_at, g.slug)
  );
