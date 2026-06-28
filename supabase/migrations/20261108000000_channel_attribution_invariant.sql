-- Phase A — CHANNEL ATTRIBUTION INVARIANT.
--
-- Owner's hard rule (2026-06-28): no inquiry — and downstream, no booking —
-- may exist without a known CHANNEL: the workspace/hub the lead entered
-- through, kept DISTINCT from the managing tenant (tenant_id). This is also
-- money-critical: the Phase C hub-referral lane cannot pay a hub for a lead it
-- cannot attribute, so source_workspace_id MUST always be present.
--
-- Today source_workspace_id differs from tenant_id in 0 of 48 inquiries (it is
-- almost always null) because no submit surface stamped it. This migration makes
-- the channel a hard invariant, belt-and-suspenders:
--   1. submitInquiry stamps source_workspace_id := tenant_id when a caller omits
--      it (the host IS the channel at submit time, BEFORE any Phase-B re-home).
--   2. A BEFORE INSERT trigger defaults source_workspace_id := tenant_id and
--      source_channel := 'other' for ANY inserter that still leaves them null,
--      so the NOT NULL constraints below can never break a write.
--   3. NOT NULL makes a channel-less inquiry impossible at the data layer.

BEGIN;

-- 1. Backfill legacy rows (pre-invariant): the channel defaults to the home
--    tenant (the inquiry was filed on the host that received it).
UPDATE public.inquiries SET source_workspace_id = tenant_id WHERE source_workspace_id IS NULL;
UPDATE public.inquiries SET source_channel = 'other' WHERE source_channel IS NULL;

-- 2. Safety net — default the channel fields on insert if a caller omits them.
--    Touches only NEW; runs in the inserter's context (no table access).
CREATE OR REPLACE FUNCTION public.inquiries_default_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_workspace_id IS NULL THEN
    NEW.source_workspace_id := NEW.tenant_id;
  END IF;
  IF NEW.source_channel IS NULL THEN
    NEW.source_channel := 'other';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_default_channel ON public.inquiries;
CREATE TRIGGER trg_inquiries_default_channel
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.inquiries_default_channel();

-- 3. Enforce the invariant.
ALTER TABLE public.inquiries ALTER COLUMN source_workspace_id SET NOT NULL;
ALTER TABLE public.inquiries ALTER COLUMN source_channel SET NOT NULL;

COMMENT ON COLUMN public.inquiries.source_workspace_id IS
  'Channel invariant (Phase A 2026-06-28): the workspace/hub the lead entered through (the originating CHANNEL), kept distinct from tenant_id (the managing tenant after a Phase-B re-home). NOT NULL — defaulted to tenant_id by submitInquiry + the inquiries_default_channel trigger so it is never absent (the hub-referral lane depends on it).';

COMMIT;
