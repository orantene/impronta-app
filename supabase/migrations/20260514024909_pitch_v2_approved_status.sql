-- Inquiry-funnel sprint Step 8 — Pitch v2: 3-outcome lifecycle.
--
-- The pre-existing pitch lifecycle is binary at the recipient end:
-- accept-and-convert (→ inquiry) or decline. The PO-locked v2 splits
-- "accept" into two stages so the recipient can signal intent before
-- committing to the inquiry-creation step:
--
--     sent  ──▶  declined        (terminal — recipient says no)
--           ──▶  approved        (NEW — recipient says yes, hasn't converted yet)
--                approved ──▶  converted   (existing — inquiry created)
--                approved ──▶  declined    (recipient changed their mind)
--
-- This migration adds the new enum value + an `approved_at` timestamp.
-- It does NOT migrate existing rows — `approved` is forward-only.
--
-- Source spec:
--   web/docs/inquiry-funnel-execution-plan-2026-05-13.md Step 8
--   web/docs/inquiry-funnel-audit-2026-05-13.md §9a Q4

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Extend pitch_status enum with 'approved'.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Insert BEFORE 'converted' so the enum ordering matches the natural
-- lifecycle flow (...edited → approved → converted → declined → ...).
-- ALTER TYPE ... ADD VALUE is not transactional in PG <14 outside of a
-- top-level statement, but `BEGIN` + DO block works because the value is
-- committed at COMMIT time. IF NOT EXISTS guards re-runs.

ALTER TYPE public.pitch_status ADD VALUE IF NOT EXISTS 'approved' BEFORE 'converted';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. approved_at timestamp on pitches.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.pitches.approved_at IS
  'Stamp when the recipient hit Approve on the public pitch landing. NULL until approved. After approval the recipient can convert the pitch to an inquiry; before approval they cannot (sent → approved → converted). Set by approvePitch in pitch-engine.ts.';

COMMIT;
