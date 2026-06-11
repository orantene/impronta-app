-- ============================================================
-- T1.3: System-A field_definitions hygiene
-- ============================================================
-- Three deletes, all idempotent (guarded by key + id).
--
-- 1. 'new_feild' (id=e262f3c9-c180-4232-8c03-0a80627e6249)
--    A junk test row: key='new_feild', label='Extra', boolean, directory_filter_visible=true.
--    Pollutes the LIVE directory facet list. 0 field_values references.
--
-- 2. experience_level TENANT duplicate (id=09f62177-4b8f-4f57-9536-ddb526fbae5c)
--    tenant_id=00000000-0000-0000-0000-000000000001, 0 field_values.
--    Identical config to the KEPT global row (c2b7d4d8-6fb8-4b8c-a6f5-fae859352a4b, 70 field_values).
--
-- 3. long_bio TENANT duplicate (id=43a6e442-21eb-4e59-bccd-ba3d47498a82)
--    tenant_id=00000000-0000-0000-0000-000000000001, 0 field_values.
--    Identical config ({}) to the KEPT global row (e4eb69b6-1049-4411-979f-1dca53f0e0bf, 0 field_values).
--    Kept row is the global/null-tenant canonical entry.
-- ============================================================

-- 1. Remove junk field_values first (safety; count is 0 but guard is cheap)
DELETE FROM public.field_values
WHERE field_definition_id = 'e262f3c9-c180-4232-8c03-0a80627e6249'
  AND (SELECT key FROM public.field_definitions WHERE id = 'e262f3c9-c180-4232-8c03-0a80627e6249') = 'new_feild';

-- 1b. Delete the junk definition row
DELETE FROM public.field_definitions
WHERE id = 'e262f3c9-c180-4232-8c03-0a80627e6249'
  AND key = 'new_feild';

-- 2. Delete tenant-scoped experience_level duplicate (0 values, identical config)
--    Keep: c2b7d4d8-6fb8-4b8c-a6f5-fae859352a4b (global, 70 field_values)
DELETE FROM public.field_definitions
WHERE id = '09f62177-4b8f-4f57-9536-ddb526fbae5c'
  AND key = 'experience_level'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';

-- 3. Delete tenant-scoped long_bio duplicate (0 values, identical config)
--    Keep: e4eb69b6-1049-4411-979f-1dca53f0e0bf (global, tenant_id IS NULL)
DELETE FROM public.field_definitions
WHERE id = '43a6e442-21eb-4e59-bccd-ba3d47498a82'
  AND key = 'long_bio'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';
