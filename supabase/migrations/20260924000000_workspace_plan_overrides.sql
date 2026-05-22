-- Platform Admin — public.workspace_plan_overrides.
--
-- Lets a Tulala super_admin grant a workspace a temporary, auditable,
-- reversible plan upgrade (comp / trial / promo) WITHOUT corrupting billing.
--
-- Design:
--   • The OVERRIDE row is the source of metadata: base plan, granted plan,
--     start/expiry, reason, author, lifecycle status.
--   • The EFFECTIVE plan is mirrored straight onto agencies.plan_tier +
--     agencies.talent_seat_limit, so every existing plan read (workspace
--     dashboard, billing page, capability gates, roster seat checks)
--     respects the override with ZERO rewiring — agencies.plan_tier was
--     already the single source of truth.
--   • base_plan_tier / base_talent_seat_limit snapshot the pre-override
--     values so removal/expiry restores them exactly.
--   • On expiry, the workspace returns to its base plan UNLESS it has a
--     live paid Stripe subscription, in which case it returns to that.
--
-- Additive only — one new table + one function + one trigger. No changes
-- to existing rows or existing policies.

BEGIN;

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_plan_overrides (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  status                      TEXT        NOT NULL DEFAULT 'active'
                                            CHECK (status IN ('active','expired','revoked')),
  -- Snapshot of the workspace's plan at the moment the override was applied.
  base_plan_tier              TEXT        NOT NULL
                                            CHECK (base_plan_tier IN ('free','studio','agency','network')),
  base_talent_seat_limit      INTEGER     CHECK (base_talent_seat_limit IS NULL OR base_talent_seat_limit > 0),
  -- The granted (effective-while-active) tier.
  override_plan_tier          TEXT        NOT NULL
                                            CHECK (override_plan_tier IN ('free','studio','agency','network')),
  override_talent_seat_limit  INTEGER     CHECK (override_talent_seat_limit IS NULL OR override_talent_seat_limit > 0),
  starts_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = indefinite (no auto-expiry).
  expires_at                  TIMESTAMPTZ,
  reason                      TEXT,
  note                        TEXT,
  created_by                  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the override stops being active (expired or revoked).
  ended_at                    TIMESTAMPTZ,
  ended_by                    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.workspace_plan_overrides IS
  'Platform-admin-issued temporary plan grants (comp/trial/promo). The effective plan is mirrored onto agencies.plan_tier; this table is the audit + reversal record. At most one active row per tenant.';

-- At most one active override per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_plan_overrides_one_active
  ON public.workspace_plan_overrides (tenant_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS workspace_plan_overrides_tenant_idx
  ON public.workspace_plan_overrides (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_plan_overrides_expiry_idx
  ON public.workspace_plan_overrides (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- ─── updated_at auto-touch ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_workspace_plan_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_plan_overrides_updated_at ON public.workspace_plan_overrides;
CREATE TRIGGER trg_workspace_plan_overrides_updated_at
  BEFORE UPDATE ON public.workspace_plan_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_plan_overrides_updated_at();

-- ─── RLS — platform admins only ─────────────────────────────────────────────
--
-- Server actions use the service-role client (which bypasses RLS); this
-- policy is defense-in-depth so the table is never readable/writable by a
-- tenant user even through a leaked anon/authenticated key.

ALTER TABLE public.workspace_plan_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_plan_overrides_platform_admin ON public.workspace_plan_overrides;
CREATE POLICY workspace_plan_overrides_platform_admin ON public.workspace_plan_overrides
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── Reconcile expired overrides ────────────────────────────────────────────
--
-- Reverts agencies.plan_tier / talent_seat_limit for every active override
-- whose expires_at has passed, and marks the override row 'expired'.
--
-- "Return to base plan UNLESS a live paid subscription exists" — a workspace
-- that pays for Studio and was comped to Agency drops back to Studio, not to
-- its (stale) base snapshot.
--
-- SECURITY DEFINER so it can be called from any context (the workspace's own
-- plan loader calls it for self-healing). Idempotent — a no-op when nothing
-- has expired. Pass a tenant id to scope it, or NULL to sweep all.
CREATE OR REPLACE FUNCTION public.reconcile_expired_plan_overrides(p_tenant_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           RECORD;
  reconciled    INTEGER := 0;
  restore_tier  TEXT;
  restore_seats INTEGER;
BEGIN
  FOR rec IN
    SELECT * FROM public.workspace_plan_overrides
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  LOOP
    -- Prefer a live paid subscription over the (possibly stale) base snapshot.
    SELECT plan_key INTO restore_tier
      FROM public.workspace_subscriptions
     WHERE tenant_id = rec.tenant_id
       AND status IN ('active','trialing','past_due')
     ORDER BY updated_at DESC
     LIMIT 1;

    IF restore_tier IS NULL THEN
      restore_tier := rec.base_plan_tier;
    END IF;

    IF restore_tier = rec.base_plan_tier THEN
      -- Returning to the exact base plan — restore the exact base seat
      -- limit (it may have been a custom non-standard value).
      restore_seats := rec.base_talent_seat_limit;
    ELSE
      restore_seats := CASE restore_tier
        WHEN 'free'   THEN 10
        WHEN 'studio' THEN 50
        WHEN 'agency' THEN 200
        ELSE NULL  -- network = unlimited
      END;
    END IF;

    UPDATE public.agencies
       SET plan_tier = restore_tier,
           talent_seat_limit = restore_seats,
           updated_at = now()
     WHERE id = rec.tenant_id;

    UPDATE public.workspace_plan_overrides
       SET status = 'expired',
           ended_at = now()
     WHERE id = rec.id;

    reconciled := reconciled + 1;
  END LOOP;

  RETURN reconciled;
END;
$$;

COMMENT ON FUNCTION public.reconcile_expired_plan_overrides(UUID) IS
  'Reverts workspaces whose plan override has expired (returns to base plan, or to a live paid subscription if one exists). Safe to call from any context — SECURITY DEFINER, idempotent. Returns the count reconciled.';

GRANT EXECUTE ON FUNCTION public.reconcile_expired_plan_overrides(UUID)
  TO authenticated, service_role;

COMMIT;
