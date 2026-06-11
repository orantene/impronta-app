-- T2.6 step 2 — drop stale legacy System-A social-URL field_values.
--
-- Context: the directory text-search reader (read-source-directory-search.ts)
-- previously kept reading three legacy System-A `field_values` keys
-- (instagram_url / tiktok_url / youtube_url) because System B had no def under
-- those exact keys. T2.6 repointed that leg to System B's canonical
-- creator.instagram_handle / creator.tiktok_handle / creator.youtube_channel,
-- so NOTHING reads these three legacy keys anymore.
--
-- The 33 rows on these three def-ids are stale DEMO seed data (verified
-- read-only against prod ref pluhdapdnuiulvxmyspd on 2026-06-11):
--   • instagram_url: 22 rows, all 22 value_text end in `.demo`.
--   • tiktok_url:     5 rows, all 5 `.demo`.
--   • youtube_url:    6 rows, demo handles (e.g. @ninahartdemo).
-- All created in a single seed window (2026-05-14 00:29–00:31 UTC); the only
-- two `updated_at` bumps still hold their original `.demo` seed value (mirror /
-- reconcile touches, not user edits). NO source-code path writes these keys —
-- the live editor writes the System-B creator.* handles instead. The two dead
-- A-writer actions that COULD have written them (saveAdminTalentScalarFieldValues
-- / saveTalentScalarFieldValues) were deleted in this same change as they were
-- rendered nowhere.
--
-- Scope: tightly limited to the THREE social-URL def-ids by UUID. Idempotent —
-- a second run deletes nothing (rows already gone). This is the last reader
-- dependency removed from `field_values` for the directory search surface.

DELETE FROM public.field_values
WHERE field_definition_id IN (
  'f1d1f5eb-6f62-4f80-8949-b9e738fadddd', -- instagram_url
  '37ac1076-c360-4e0a-9611-f8004aa64905', -- tiktok_url
  '68fdc665-94d3-4cb2-9bc5-b94c4c445ab3'  -- youtube_url
);
