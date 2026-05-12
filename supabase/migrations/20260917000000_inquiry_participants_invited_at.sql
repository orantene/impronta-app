-- ============================================================================
-- inquiry_participants.invited_at — schema/code reconciliation (2026-05-12)
-- ============================================================================
--
-- WHY
-- ───
-- The Phase 2 migration (20260520101000_phase2_inquiry_participants.sql)
-- created the table with `accepted_at`, `removed_at`, `created_at`, and
-- `updated_at`, but NOT `invited_at`. Application code in
-- `web/src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts` queries
-- `invited_at` (4 references — SELECT, ORDER BY, type, mapped value),
-- causing the admin Live Lineup panel to fail at runtime: "column
-- inquiry_participants.invited_at does not exist".
--
-- Symptom: the admin lineup panel does not render. Client-submitted
-- inquiries with selected talent silently succeed at the INSERT step but
-- can never be displayed because the SELECT-BACK query is broken.
--
-- This is the most damaging schema/code drift in the inquiry system right
-- now — it breaks the "selected talent appears in admin lineup" flow.
--
-- WHAT
-- ────
-- Add the missing column with semantic equality to `created_at`:
--
--   • For a participant row, the "invited" moment IS the insertion moment.
--     Every INSERT call site (inquiry-engine-submit.ts, inquiry-engine-
--     coordinator.ts, inquiry-engine-offers.ts, directory/actions.ts)
--     creates rows with status='invited' and never sets invited_at.
--
--   • Backfill existing rows: invited_at := created_at.
--
--   • Future re-invites of removed participants are NOT in scope for this
--     fix — current product behavior never re-inserts; it sets status
--     back to 'invited' on the same row, which keeps invited_at stable.
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS; backfill only when NULL.
-- ============================================================================

BEGIN;

ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Backfill: any pre-existing row was invited at the moment it was created.
UPDATE public.inquiry_participants
   SET invited_at = created_at
 WHERE invited_at IS NULL;

-- Now enforce NOT NULL + default for future inserts.
ALTER TABLE public.inquiry_participants
  ALTER COLUMN invited_at SET DEFAULT now();

ALTER TABLE public.inquiry_participants
  ALTER COLUMN invited_at SET NOT NULL;

COMMENT ON COLUMN public.inquiry_participants.invited_at IS
  'Timestamp of original invitation. For rows that have never been removed/re-invited, equals created_at. Used by the admin Live Lineup panel to order participants by invitation order.';

-- Index for the lineup ORDER BY.
CREATE INDEX IF NOT EXISTS idx_participants_inquiry_invited_at
  ON public.inquiry_participants (inquiry_id, invited_at);

COMMIT;
