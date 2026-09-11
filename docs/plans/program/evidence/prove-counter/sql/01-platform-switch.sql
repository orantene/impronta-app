-- The point of sale's platform kill switch, on the ISOLATED QA database only.
--
-- `platform_settings.workspace_pos_enabled` is one row for the whole product
-- and ships FALSE (lib/platform/workspace-ui.ts: "the counter ships dark").
-- The application exposes NO control for it: `writePlatformWorkspaceUi` takes
-- `Omit<PlatformWorkspaceUi, "posEnabled">` and the super-admin settings card
-- knows only the other four switches. So this one had to be written directly,
-- and it was written on `fxlankepwnvelxjrahwk` (Supabase branch qa-journeys).
-- Production `pluhdapdnuiulvxmyspd` was never touched.
--
-- Before:
--   [{"id": true, "workspace_pos_enabled": false, "workspace_fab_enabled": false}]
UPDATE platform_settings
   SET workspace_pos_enabled = TRUE,
       updated_at = now()
 WHERE id = TRUE
RETURNING id, workspace_pos_enabled, updated_at;
-- After:
--   [{"id": true, "workspace_pos_enabled": true, "updated_at": "2026-09-10 12:29:38.286625+00"}]
