-- ============================================================================
-- Inquiry engine data-layer enabler (Phase B-1)
-- ============================================================================
--
-- Spec: web/docs/inquiry-engine-spec-2026-05-14.md
-- Plan: web/docs/client-execution-plan-2026-05-14.md §21.2
-- Audit: web/docs/phase-a-audit-2026-05-14.md §A.3 + §A.8
--
-- WHY
-- ───
-- Today every inquiry-creation path emits a different payload shape into
-- `public.inquiries`. Plan §7 calls for one canonical `InquiryIntent` that
-- captures rich provenance (10 source kinds) + arbitrary source-specific
-- context (shortlist id, pitch token, rebook-of inquiry id, discovery search
-- params) that doesn't fit an enum.
--
-- Plan §21.2 also calls for first-class inquiry drafts that persist across
-- sessions and devices so the form is never destructive on close.
--
-- WHAT
-- ────
-- 1. Extend the `source_channel` column in `public.inquiries` — purely
--    additive via the application-layer z.enum allow-list. The column is
--    plain TEXT in the database; no Postgres enum to ALTER, no data
--    backfill needed. Application-side enum extension lands in the next
--    commit.
--
-- 2. Add `source_context jsonb` to `public.inquiries`. Captures the rich
--    provenance metadata that doesn't fit a flat column:
--      shortlist_id · pitch_token · referrer_page · discovery_search
--      rebook_of_inquiry_id · public_profile_code · campaign_id · ...
--
-- 3. Create `public.inquiry_drafts` table for autosaved partial inquiries
--    across sessions/devices. One row per draft; deleted (or marked
--    abandoned) when the inquiry submits. JSONB `intent` carries the full
--    InquiryIntent shape so the schema can evolve without migrations.
--
-- 4. RLS on `inquiry_drafts`:
--    - owner (`requester_user_id = auth.uid()`) has full access
--    - tenant staff can read all drafts in their tenant (for "draft cards
--      in Messages list" per spec §13)
--    - service role bypasses RLS (existing pattern)
--
-- 5. Indexes:
--    - on (requester_user_id) WHERE submitted_inquiry_id IS NULL — fast
--      "my open drafts" lookup
--    - on (tenant_id) for the staff path
--    - on (updated_at DESC) for "most recently edited" sort

BEGIN;

-- ─── 1 + 2.  inquiries — add source_context jsonb ────────────────────────────
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS source_context JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.inquiries.source_context IS
  'Provenance metadata that does not fit an enum: shortlist_id, pitch_token, referrer_page, discovery_search, rebook_of_inquiry_id, public_profile_code, campaign_id, etc. Paired with source_channel (the coarse-grain enum). Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11.';

-- (source_channel column itself is unchanged — it remains TEXT. The
-- application-layer allow-list extends in the next commit so legacy
-- values stay valid while new ones land.)

-- ─── 3.  inquiry_drafts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inquiry_drafts (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID         NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Who is composing the draft. NULL for guest/pre-auth drafts (rare;
  -- guests typically submit immediately).
  requester_user_id     UUID         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- For guest drafts that pre-bind to an email (used when we send a
  -- magic-link "resume your draft" flow).
  requester_email       TEXT         NULL,
  -- Full InquiryIntent payload as JSONB so the schema can evolve without
  -- a migration per field.
  intent                JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Coarse-grain source (mirrors inquiries.source_channel allow-list).
  source                TEXT         NOT NULL DEFAULT 'direct_client_dashboard',
  source_context        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Set when the draft converts into a real inquiry. NULL until submitted.
  submitted_inquiry_id  UUID         NULL REFERENCES public.inquiries(id) ON DELETE SET NULL,
  -- Cron-pruned: drafts older than 30 days with no activity get
  -- abandoned_at = now() and are excluded from the inbox.
  abandoned_at          TIMESTAMPTZ  NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inquiry_drafts IS
  'Autosaved partial inquiry intents. One row per draft; per-user, per-tenant. Deleted or abandoned when the matching inquiry row lands. Powers spec §13 (smart defaults), §15 (resume-draft), §16 (missing-info flags computed from intent).';

-- ─── 4.  RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.inquiry_drafts ENABLE ROW LEVEL SECURITY;

-- Owner can do anything with their own drafts.
DROP POLICY IF EXISTS inquiry_drafts_owner ON public.inquiry_drafts;
CREATE POLICY inquiry_drafts_owner ON public.inquiry_drafts
  FOR ALL
  USING       (requester_user_id = auth.uid())
  WITH CHECK  (requester_user_id = auth.uid());

-- Tenant staff can see drafts in their tenant (for "draft cards in
-- Messages list" + admin-side inquiry handoff). Uses the tenant-scoped
-- helper from 20260602100000_saas_p2_tenant_helpers.sql.
DROP POLICY IF EXISTS inquiry_drafts_tenant_staff ON public.inquiry_drafts;
CREATE POLICY inquiry_drafts_tenant_staff ON public.inquiry_drafts
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- ─── 5.  Indexes ─────────────────────────────────────────────────────────────

-- Fast "open drafts for this user" — only the not-yet-submitted ones.
CREATE INDEX IF NOT EXISTS inquiry_drafts_open_for_user_idx
  ON public.inquiry_drafts (requester_user_id, updated_at DESC)
  WHERE submitted_inquiry_id IS NULL AND abandoned_at IS NULL;

-- Tenant-scope staff queries.
CREATE INDEX IF NOT EXISTS inquiry_drafts_tenant_idx
  ON public.inquiry_drafts (tenant_id, updated_at DESC);

-- ─── 6.  updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inquiry_drafts_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inquiry_drafts_touch_updated_at_tg ON public.inquiry_drafts;
CREATE TRIGGER inquiry_drafts_touch_updated_at_tg
  BEFORE UPDATE ON public.inquiry_drafts
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_drafts_touch_updated_at();

-- ─── 7.  Assertions ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'inquiries'
       AND column_name  = 'source_context'
  ) THEN
    RAISE EXCEPTION 'Migration failed: inquiries.source_context not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'inquiry_drafts'
  ) THEN
    RAISE EXCEPTION 'Migration failed: inquiry_drafts table not created';
  END IF;
END$$;

COMMIT;
