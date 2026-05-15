-- Promote the three primary social-media handles from `type-specific`
-- to `global` tier so every talent sees them (not only those with a
-- creator/influencer primary or secondary type). Universal-by-talent
-- decision: any roster talent can list their Instagram / TikTok /
-- YouTube regardless of how they're booked.
--
-- Affects the editor surfaced by `LiveCategoryFieldsEditor` via
-- `getFieldsForTalent` — global-tier fields are included for every
-- talent (no recommendation match required).

UPDATE public.profile_field_definitions
   SET tier = 'global'
 WHERE field_key IN (
   'creator.instagram_handle',
   'creator.tiktok_handle',
   'creator.youtube_channel'
 );
