-- TUL-1646 · The owner records a month's rent paid in cash or by bank transfer (no Tulala fee). HELD in _pending_pm.
-- A NEW migration: 20261231420700 is already on staging. Depends on 20261231423000 (TUL-1601, the `source` column).
-- Additive, plus the `source` check now also allows 'outside'. A month paid outside is never also charged by link or
-- card: the plan keeps the months whose automatic invoice must be voided (autopay_skip_periods).
--
-- ROLLBACK (no 'outside' row may exist): ALTER TABLE public.studio_rent_invoices DROP COLUMN IF EXISTS paid_outside_method,
--   DROP COLUMN IF EXISTS paid_outside_note, DROP COLUMN IF EXISTS marked_by; ALTER TABLE public.studio_rent_plans
--   DROP COLUMN IF EXISTS autopay_skip_periods; and restore the source check to ('link','autopay').

BEGIN;

ALTER TABLE public.studio_rent_plans
  ADD COLUMN IF NOT EXISTS autopay_skip_periods text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.studio_rent_invoices
  ADD COLUMN IF NOT EXISTS paid_outside_method text NULL CHECK (paid_outside_method IS NULL OR paid_outside_method IN ('cash','transfer')),
  ADD COLUMN IF NOT EXISTS paid_outside_note text NULL CHECK (paid_outside_note IS NULL OR char_length(paid_outside_note) <= 300),
  ADD COLUMN IF NOT EXISTS marked_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.studio_rent_invoices DROP CONSTRAINT IF EXISTS studio_rent_invoices_source_check;
ALTER TABLE public.studio_rent_invoices
  ADD CONSTRAINT studio_rent_invoices_source_check CHECK (source IN ('link','autopay','outside'));

COMMIT;
