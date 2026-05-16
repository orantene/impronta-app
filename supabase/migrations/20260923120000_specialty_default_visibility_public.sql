-- ============================================================================
-- 20260923120000_specialty_default_visibility_public.sql
--
-- THE actual fix. Migrations 100000/110000 flipped show_in_public=true,
-- but that is only an APP-layer hint. The real security boundary for a
-- public talent profile is the RLS policy `tpfv_select_public` on
-- talent_profile_field_values, which gates the anon read on:
--
--   'public' = ANY(COALESCE(visibility_override, pfd.default_visibility))
--
-- i.e. it checks `default_visibility`, NOT `show_in_public`. 196 field
-- defs have default_visibility = {agency}, so the anon/public client is
-- RLS-blocked from ever reading those values — the public profile never
-- even receives the rows (hair/eye/body/sizes/social all silently
-- absent), regardless of show_in_public or app projection logic.
--
-- Fix: for the SAME curated public-appropriate set (non-sensitive,
-- non-admin type-specific specialty fields + the 3 social handles),
-- promote default_visibility {agency} -> {public, agency}. Agency
-- access is preserved; public is added so RLS lets the profile render
-- the data the agency filled. {private} rows and sensitive namespaces
-- (identity / travel / serviceArea / emergency / consent / documents)
-- are deliberately untouched. Reversible + idempotent (only rewrites
-- rows that are exactly {agency} and match the curation).
-- ============================================================================

UPDATE profile_field_definitions
SET default_visibility = ARRAY['public', 'agency'],
    updated_at = now()
WHERE deprecated_at IS NULL
  AND default_visibility = ARRAY['agency']
  AND (
    (
      tier = 'type-specific'
      AND COALESCE(is_sensitive, false) = false
      AND COALESCE(admin_only, false) = false
      AND split_part(field_key, '.', 1) NOT IN (
        'identity', 'travel', 'serviceArea', 'emergency', 'consent', 'documents'
      )
    )
    OR field_key IN (
      'creator.instagram_handle',
      'creator.tiktok_handle',
      'creator.youtube_channel'
    )
  );
