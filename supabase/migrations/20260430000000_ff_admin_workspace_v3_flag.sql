-- Admin Workspace V3 rollout flag (M0.1 — Phase 1 Admin Workspace Redesign).
-- Read by isWorkspaceV3Enabled() in web/src/lib/settings/admin-workspace-flag.ts.
--
-- Two keys:
--   ff_admin_workspace_v3             — boolean global flag. Default false.
--   ff_admin_workspace_v3_allowlist   — JSON array of user ids allowed to see v3
--                                       while the global flag is off. Used for
--                                       internal dogfooding in M7 before cutover.
--
-- Writes are gated by the existing `settings_staff` RLS policy. Reads go through
-- the service role client (off the public RLS allowlist), so this key stays
-- internal to the admin codepath.
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('ff_admin_workspace_v3', 'false'::jsonb, now()),
  ('ff_admin_workspace_v3_allowlist', '[]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
