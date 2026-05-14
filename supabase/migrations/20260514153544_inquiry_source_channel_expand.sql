-- ============================================================================
-- Inquiry source_channel enum — expand to plan §7 sources
-- ============================================================================
--
-- Spec: web/docs/inquiry-engine-spec-2026-05-14.md
-- Plan: web/docs/client-execution-plan-2026-05-14.md §7
--
-- The audit (phase-a-audit §A.3.1) noted that source_channel was a
-- 7-value generic enum. Probe revealed it's actually an 8-value Postgres
-- enum (`pitch` was added previously). The plan wants 10 values that
-- preserve real provenance. This migration adds the 9 missing values.
--
-- Postgres 12+ allows ALTER TYPE ADD VALUE outside of a transaction
-- block, but each ADD VALUE must be its own statement. IF NOT EXISTS
-- keeps the migration idempotent.

-- Existing values (kept): directory_guest, directory_client, phone,
-- whatsapp, email, admin, other, pitch.
-- New values per plan §7:

ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'direct_client_dashboard';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'discover_single_talent';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'discover_shortlist';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'saved_talent';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'public_talent_profile';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'agency_site';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'hub_site';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'admin_created';
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'book_again';

-- Comment as documentation.
COMMENT ON TYPE public.inquiry_source_channel IS
  '17-value enum capturing inquiry provenance. Plan §7 sources (10) +
   legacy operational channels (phone/whatsapp/email/admin/other/pitch/
   directory_guest/directory_client). Application-layer
   INQUIRY_SOURCE_CHANNEL_VALUES allow-list must match this set —
   see web/src/lib/admin/validation.ts.';
