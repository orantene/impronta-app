-- Migration Phase 3.7 — client trust ladder + talent contact preferences.
--
-- Per the locked architecture in docs/client-trust-and-contact-controls.md:
--
--   client_trust_state        — derived trust level per (client, tenant), with
--                               the raw signals (verified_at, funded_balance)
--                               that the application re-evaluates when signals
--                               change. Trust level: basic → verified → silver →
--                               gold, derived by the evaluator in application
--                               code, written back here. Manual overrides by
--                               super_admin beat the auto result.
--
--   talent_contact_preferences — per-talent allow/deny toggles for each trust
--                               tier. Four boolean columns; all default TRUE
--                               (open, receive all contacts) per the spec.
--
-- In addition: a snapshot column on `inquiries` captures the client's trust
-- level at submission time so the pipeline can carry trust signals even after
-- the client's live level changes.
--
-- Thresholds for silver/gold (funded_balance) live in application constants
-- for now; a platform-config table will expose them as admin-configurable in
-- Phase 8.

-- ─── Enum ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.client_trust_level AS ENUM ('basic', 'verified', 'silver', 'gold');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── client_trust_state ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_trust_state (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Derived result — written by application evaluator, not directly by UI.
  trust_level     public.client_trust_level NOT NULL DEFAULT 'basic',

  -- Raw signals the evaluator reads.
  verified_at     TIMESTAMPTZ,                    -- card / identity verified
  funded_balance_cents BIGINT NOT NULL DEFAULT 0, -- prepaid balance on account

  -- Admin override — beats all auto-evaluation when set.
  manual_override public.client_trust_level,

  -- Bookkeeping
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_client_trust_state_tenant
  ON public.client_trust_state(tenant_id);

-- ─── Row-level security ───────────────────────────────────────────────────────

ALTER TABLE public.client_trust_state ENABLE ROW LEVEL SECURITY;

-- Agency staff can read all trust state for their tenant.
CREATE POLICY client_trust_state_staff_read
  ON public.client_trust_state
  FOR SELECT
  USING (is_staff_of_tenant(tenant_id));

-- Agency staff can insert/update trust state (verified_at, funded_balance,
-- manual_override) for their tenant.
CREATE POLICY client_trust_state_staff_write
  ON public.client_trust_state
  FOR ALL
  USING (is_staff_of_tenant(tenant_id));

-- Clients can read their own trust state.
CREATE POLICY client_trust_state_own_read
  ON public.client_trust_state
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── talent_contact_preferences ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_contact_preferences (
  talent_profile_id UUID NOT NULL PRIMARY KEY
    REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL
    REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Per-tier allow toggles. All default TRUE (open).
  allow_basic    BOOLEAN NOT NULL DEFAULT TRUE,
  allow_verified BOOLEAN NOT NULL DEFAULT TRUE,
  allow_silver   BOOLEAN NOT NULL DEFAULT TRUE,
  allow_gold     BOOLEAN NOT NULL DEFAULT TRUE,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_contact_prefs_tenant
  ON public.talent_contact_preferences(tenant_id);

-- ─── RLS for talent_contact_preferences ──────────────────────────────────────

ALTER TABLE public.talent_contact_preferences ENABLE ROW LEVEL SECURITY;

-- Agency staff can see and manage all contact preferences for their tenant.
CREATE POLICY talent_contact_prefs_staff
  ON public.talent_contact_preferences
  FOR ALL
  USING (is_staff_of_tenant(tenant_id));

-- The talent themselves can manage their own preferences.
CREATE POLICY talent_contact_prefs_own
  ON public.talent_contact_preferences
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = talent_contact_preferences.talent_profile_id
      AND tp.user_id = auth.uid()
  ));

-- ─── Inquiries: snapshot trust level at submission ────────────────────────────

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS trust_level_at_submission TEXT;
