-- Post-merge / post-migration audit for profile truth remediation.
-- Run in SQL editor or: psql $DATABASE_URL -f supabase/scripts/audit_profile_truth_post_merge.sql
--
-- Expect after 202604092200 + 202604092210 + 202604092220:
--   - No duplicate active groups by normalized name_en
--   - Reserved keys archived (or absent from active defs)
--   - No field_values rows pointing at reserved archived defs (deleted by migration)
--   - height_cm column aligned where value_number exists

-- 1) Active groups: duplicates by visible name (should return 0 rows if merge worked)
SELECT lower(btrim(name_en)) AS norm_name_en, count(*) AS cnt, array_agg(id ORDER BY sort_order, created_at) AS group_ids
FROM field_groups
WHERE archived_at IS NULL
  AND length(btrim(name_en)) > 0
GROUP BY lower(btrim(name_en))
HAVING count(*) > 1;

-- 2) Active reserved keys still present (should be 0 rows)
SELECT id, key, archived_at, active
FROM field_definitions
WHERE key IN ('display_name', 'short_bio', 'first_name', 'last_name', 'location')
  AND archived_at IS NULL;

-- 3) Stray field_values joined to reserved keys (should be 0 rows)
SELECT fv.id, fv.talent_profile_id, fd.key
FROM field_values fv
JOIN field_definitions fd ON fd.id = fv.field_definition_id
WHERE fd.key IN ('display_name', 'short_bio', 'first_name', 'last_name', 'location');

-- 4) height mirror drift: value exists but column differs (review — some rounding acceptable)
SELECT tp.id AS talent_profile_id, tp.profile_code, tp.height_cm AS column_cm, ROUND(fv.value_number)::int AS value_cm
FROM talent_profiles tp
JOIN field_values fv ON fv.talent_profile_id = tp.id
JOIN field_definitions fd ON fd.id = fv.field_definition_id AND fd.key = 'height_cm' AND fd.archived_at IS NULL
WHERE fv.value_number IS NOT NULL
  AND tp.deleted_at IS NULL
  AND (tp.height_cm IS DISTINCT FROM ROUND(fv.value_number)::int);

-- 5) Nav-relevant groups: active groups with talent-editable defs (eyeball sort_order / slugs)
SELECT fg.slug, fg.name_en, fg.sort_order, count(fd.id) AS active_talent_editable_defs
FROM field_groups fg
LEFT JOIN field_definitions fd ON fd.field_group_id = fg.id
  AND fd.archived_at IS NULL
  AND fd.active = true
  AND fd.editable_by_talent = true
  AND fd.profile_visible = true
  AND fd.internal_only = false
WHERE fg.archived_at IS NULL
GROUP BY fg.id, fg.slug, fg.name_en, fg.sort_order
ORDER BY fg.sort_order, fg.slug;
