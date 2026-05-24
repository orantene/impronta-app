-- Platform Users Control Center — M0.2
--
-- public.user_visibility_overrides
--
-- Per-site visibility suppression for talent profiles. A super_admin can
-- hide a talent_profile on a specific tenant (site) without deleting it or
-- affecting its visibility on any other site.
--
-- Design:
--   • target_kind is an enum-constrained text column (extendable later).
--   • Unique on (target_id, tenant_id) — one active decision per
--     talent × site pair.
--   • tenant_id FK → public.agencies (the canonical tenant/workspace table).
--   • hidden_by_user_id FK → auth.users (SET NULL on delete for safety).
--   • RLS: read + write = super_admin only (via public.is_platform_admin()).
--
-- Additive only — no changes to existing tables or policies.

BEGIN;

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_visibility_overrides (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind       text        NOT NULL DEFAULT 'talent_profile'
                                  CHECK (target_kind IN ('talent_profile')),
  target_id         uuid        NOT NULL,
  tenant_id         uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  hidden_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  hidden_at         timestamptz NOT NULL DEFAULT now(),
  reason            text,
  UNIQUE (target_id, tenant_id)
);

COMMENT ON TABLE public.user_visibility_overrides IS
  'Platform-admin-issued per-site visibility suppressions for talent profiles. '
  'One row hides the target on the given tenant site; removing the row restores visibility. '
  'Unique on (target_id, tenant_id).';

COMMENT ON COLUMN public.user_visibility_overrides.target_kind IS
  'Discriminator for the target entity type. Currently only ''talent_profile'' is supported.';

COMMENT ON COLUMN public.user_visibility_overrides.target_id IS
  'UUID of the suppressed entity (currently a talent_profiles.id).';

COMMENT ON COLUMN public.user_visibility_overrides.tenant_id IS
  'The workspace/site on which the target is hidden. FK → public.agencies.';

COMMENT ON COLUMN public.user_visibility_overrides.hidden_by_user_id IS
  'The super_admin user who created the suppression. SET NULL if that account is deleted.';

COMMENT ON COLUMN public.user_visibility_overrides.reason IS
  'Optional free-text explanation recorded by the acting super_admin.';

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS user_visibility_overrides_target_idx
  ON public.user_visibility_overrides (target_id);

CREATE INDEX IF NOT EXISTS user_visibility_overrides_tenant_idx
  ON public.user_visibility_overrides (tenant_id);

-- ─── RLS — platform admins only ─────────────────────────────────────────────
--
-- Server actions use the service-role client (bypasses RLS); this policy is
-- defense-in-depth so the table is never readable/writable through a leaked
-- anon/authenticated key.

ALTER TABLE public.user_visibility_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_visibility_overrides_super_admin_select ON public.user_visibility_overrides;
CREATE POLICY user_visibility_overrides_super_admin_select ON public.user_visibility_overrides
  FOR SELECT
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS user_visibility_overrides_super_admin_insert ON public.user_visibility_overrides;
CREATE POLICY user_visibility_overrides_super_admin_insert ON public.user_visibility_overrides
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS user_visibility_overrides_super_admin_update ON public.user_visibility_overrides;
CREATE POLICY user_visibility_overrides_super_admin_update ON public.user_visibility_overrides
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS user_visibility_overrides_super_admin_delete ON public.user_visibility_overrides;
CREATE POLICY user_visibility_overrides_super_admin_delete ON public.user_visibility_overrides
  FOR DELETE
  USING (public.is_platform_admin());

COMMIT;
