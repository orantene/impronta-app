-- ============================================================================
-- 20260923110000_social_handles_show_in_public.sql
--
-- Follow-up to 20260923100000. The Instagram / TikTok / YouTube handle
-- fields are tier='global' (not type-specific), so the previous
-- migration's type-specific scope didn't reach them — they were still
-- show_in_public=false. A talent's public social handles obviously
-- belong on their public profile. Flip just those three, surgically
-- (NOT a blanket global flip — rates / limits / passports / emergency
-- / ID docs deliberately stay private).
-- ============================================================================

UPDATE profile_field_definitions
SET show_in_public = true,
    updated_at = now()
WHERE field_key IN (
  'creator.instagram_handle',
  'creator.tiktok_handle',
  'creator.youtube_channel'
)
  AND deprecated_at IS NULL
  AND show_in_public = false;
