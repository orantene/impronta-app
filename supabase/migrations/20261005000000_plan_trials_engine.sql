-- Plan Trials & Promotions Engine
-- =============================================================================
-- Turns the existing plan-override mechanism (workspace_plan_overrides +
-- talent_plan_overrides) into a first-class TRIALS system, and adds an
-- admin-editable trial-config catalog.
--
-- Two parts:
--   1. grant_kind on BOTH override tables — distinguishes a promotional TRIAL
--      (time-boxed; expiry should drive an upgrade nudge) from a courtesy COMP
--      and a PROMO. Existing rows were comps / QA grants → default 'comp'.
--   2. plan_trial_offers — per-(audience, plan_key) trial config: the default
--      trial length an admin's "Start trial" uses, plus the in-app self-serve
--      upgrade CTA copy. This is the DB home of the formerly-dead
--      plan-catalog.ts `trialDays` field, editable from /platform/admin/pricing.
--
-- Additive only. No changes to existing rows beyond the new default-filled
-- column. The effective plan still mirrors onto agencies.plan_tier /
-- talent plan, so every existing read keeps working unchanged.

BEGIN;

-- ─── 1) grant_kind on the two override tables ────────────────────────────────

ALTER TABLE public.workspace_plan_overrides
  ADD COLUMN IF NOT EXISTS grant_kind TEXT NOT NULL DEFAULT 'comp'
    CHECK (grant_kind IN ('comp', 'trial', 'promo'));

ALTER TABLE public.talent_plan_overrides
  ADD COLUMN IF NOT EXISTS grant_kind TEXT NOT NULL DEFAULT 'comp'
    CHECK (grant_kind IN ('comp', 'trial', 'promo'));

COMMENT ON COLUMN public.workspace_plan_overrides.grant_kind IS
  'trial = time-boxed promotional grant (expiry drives an upgrade nudge); comp = courtesy/grandfather; promo = discounted paid grant. Presentation differs per kind.';
COMMENT ON COLUMN public.talent_plan_overrides.grant_kind IS
  'trial = time-boxed promotional grant (expiry drives an upgrade nudge); comp = courtesy/grandfather; promo = discounted paid grant. Presentation differs per kind.';

-- ─── 2) plan_trial_offers — admin-editable trial config ──────────────────────

CREATE TABLE IF NOT EXISTS public.plan_trial_offers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'workspace' plans use agencies.plan_tier keys (studio/agency/network);
  -- 'talent' plans use plan-catalog talent keys (talent_pro/talent_portfolio).
  audience      TEXT        NOT NULL CHECK (audience IN ('workspace', 'talent')),
  plan_key      TEXT        NOT NULL,
  -- Default trial length applied by the admin "Start trial" action and the
  -- in-app self-serve CTA.
  trial_days    INTEGER     NOT NULL DEFAULT 14
                              CHECK (trial_days > 0 AND trial_days <= 365),
  -- Whether the in-app self-serve upgrade CTA for this plan is shown at all.
  is_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  -- In-app engagement CTA copy (shown in the plan badge popover etc.).
  cta_headline  TEXT,
  cta_subtext   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audience, plan_key)
);

COMMENT ON TABLE public.plan_trial_offers IS
  'Admin-editable trial config per plan (audience + plan_key): default trial length and self-serve upgrade CTA copy. Edited from /platform/admin/pricing; read by the plan badge engagement CTA and the admin "Start trial" action. DB home of the former plan-catalog.ts trialDays field.';

CREATE OR REPLACE FUNCTION public.touch_plan_trial_offers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_trial_offers_updated_at ON public.plan_trial_offers;
CREATE TRIGGER trg_plan_trial_offers_updated_at
  BEFORE UPDATE ON public.plan_trial_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_plan_trial_offers_updated_at();

-- RLS: trial config is non-sensitive marketing copy + lengths. Anyone may
-- READ (the in-app CTA needs it via the authenticated client); only platform
-- admins may WRITE. Server actions use the service-role client and bypass RLS.
ALTER TABLE public.plan_trial_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_trial_offers_read ON public.plan_trial_offers;
CREATE POLICY plan_trial_offers_read ON public.plan_trial_offers
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS plan_trial_offers_admin_write ON public.plan_trial_offers;
CREATE POLICY plan_trial_offers_admin_write ON public.plan_trial_offers
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed defaults (idempotent). Mirrors plan-catalog.ts trialDays as of 2026-05.
-- Network is "contact us" → trial CTA disabled by default.
INSERT INTO public.plan_trial_offers
  (audience, plan_key, trial_days, is_enabled, cta_headline, cta_subtext)
VALUES
  ('workspace', 'studio',  14, TRUE,
     'Try Studio free for 14 days',
     'Embed your roster anywhere, add widgets and API access.'),
  ('workspace', 'agency',  14, TRUE,
     'Try Agency free for 14 days',
     'Your domain, your pages, your brand — the full builder.'),
  ('workspace', 'network', 14, FALSE,
     'Talk to us about Network',
     'Operate multiple agencies and reach the discovery hub.'),
  ('talent', 'talent_pro',       14, TRUE,
     'Try Pro free for 14 days',
     'Richer layout, video and audio embeds, a stronger portfolio.'),
  ('talent', 'talent_portfolio', 14, TRUE,
     'Try Max free for 14 days',
     'Your branded talent page with a personal-site builder.')
ON CONFLICT (audience, plan_key) DO NOTHING;

COMMIT;
