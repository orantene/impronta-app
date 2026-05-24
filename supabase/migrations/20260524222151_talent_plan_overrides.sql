-- Platform Admin — public.talent_plan_overrides.
--
-- Lets a Tulala super_admin grant a talent user a temporary, auditable,
-- reversible plan upgrade (comp / trial / promo) WITHOUT touching Stripe.
--
-- Design mirrors workspace_plan_overrides but is keyed on talent_profile_id.
-- The effective plan is mirrored onto talent_profiles.talent_plan_key so all
-- existing talent-page feature gates automatically see the override.
-- base_plan_key snapshots the talent's plan at override time for clean reversal.
--
-- Additive only — one new table. No changes to existing rows or policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_plan_overrides (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id     UUID        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  status                TEXT        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'expired', 'revoked')),
  -- Snapshot of the talent's plan at the moment the override was applied.
  base_plan_key         TEXT        NOT NULL
                                      CHECK (base_plan_key IN ('talent_basic', 'talent_pro', 'talent_portfolio')),
  -- The granted (effective-while-active) plan.
  override_plan_key     TEXT        NOT NULL
                                      CHECK (override_plan_key IN ('talent_basic', 'talent_pro', 'talent_portfolio')),
  starts_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = indefinite (no auto-expiry).
  expires_at            TIMESTAMPTZ,
  reason                TEXT,
  note                  TEXT,
  created_by            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,
  ended_by              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.talent_plan_overrides IS
  'Platform-admin-issued temporary talent-plan grants (comp/trial/promo). The effective plan is mirrored onto talent_profiles.talent_plan_key; this table is the audit + reversal record. At most one active row per talent profile.';

-- At most one active override per talent profile.
CREATE UNIQUE INDEX IF NOT EXISTS talent_plan_overrides_one_active
  ON public.talent_plan_overrides (talent_profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS talent_plan_overrides_talent_idx
  ON public.talent_plan_overrides (talent_profile_id);

-- RLS — platform admins use service-role; talent can read their own.
ALTER TABLE public.talent_plan_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_plan_overrides_self_read ON public.talent_plan_overrides;
CREATE POLICY talent_plan_overrides_self_read ON public.talent_plan_overrides
  FOR SELECT
  USING (
    talent_profile_id IN (
      SELECT id FROM public.talent_profiles WHERE user_id = auth.uid()
    )
  );

COMMIT;
