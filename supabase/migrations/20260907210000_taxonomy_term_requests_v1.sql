-- ============================================================================
-- Taxonomy Term Requests V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- When an agency admin or talent is adding skills to a profile, sometimes
-- the right talent_type isn't in the catalog. Today they just give up.
-- This table captures their suggestion so platform staff can:
--   - Review and add genuinely missing types to the master catalog
--   - Spot patterns (e.g., 5 different agencies asking for "Doula")
--   - Politely decline duplicates / off-brand suggestions
--   - Later: route as a support ticket / admin notification
--
-- WHAT
-- ────
-- A simple request log. Each request:
--   - is scoped to a (tenant, optional talent_profile) context
--   - proposes a new term under a specific parent_category
--   - includes optional "why we need this" copy
--   - has a status (pending / approved / denied / duplicate)
--   - records resolution attribution + (when approved) the created_term_id
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.taxonomy_term_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID,
  requested_by_tenant_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  -- Optional: talent context this request was triggered from.
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  -- The parent_category they think their proposed term belongs in.
  parent_category_id UUID REFERENCES public.taxonomy_terms(id) ON DELETE SET NULL,
  proposed_name TEXT NOT NULL CHECK (length(proposed_name) BETWEEN 2 AND 120),
  -- Why they need this — optional but encouraged in UI ("we book a lot of doulas").
  context_note TEXT CHECK (context_note IS NULL OR length(context_note) <= 500),
  -- Where in the workflow it was triggered (UI hint for support routing).
  source TEXT CHECK (source IS NULL OR source IN ('skill_picker', 'registration', 'inquiry_form', 'admin_settings')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'duplicate')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  -- When approved, link to the new taxonomy term created.
  created_term_id UUID REFERENCES public.taxonomy_terms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.taxonomy_term_requests IS
  'User-submitted suggestions for new taxonomy terms (typically talent_types). Platform staff review + approve/deny. Forms the input queue for catalog growth.';

-- Index by tenant + status for the support inbox view ("show me Impronta's pending requests").
CREATE INDEX IF NOT EXISTS idx_term_requests_tenant_status
  ON public.taxonomy_term_requests (requested_by_tenant_id, status);

-- Index by status alone for platform-wide review.
CREATE INDEX IF NOT EXISTS idx_term_requests_status_created
  ON public.taxonomy_term_requests (status, created_at DESC);

-- ─── Final assertion ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_table_exists BOOL;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'taxonomy_term_requests'
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'taxonomy_term_requests_v1: table not created.';
  END IF;
  RAISE NOTICE 'taxonomy_term_requests_v1: table installed.';
END $$;

COMMIT;
