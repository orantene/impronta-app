-- HELD MIGRATION (TUL-1607): each person's own answer on THEIR line of a
-- multi-person offer.
--
-- One row per offer line (inquiry_offer_line_items.id): the person on that line
-- confirmed or declined. The answer records WHO answered (talent_profile_id) so
-- a replaced person's answer never carries over to their successor: the code
-- only counts a row whose talent_profile_id equals the line's CURRENT person.
--
-- ADDITIVE and IDEMPOTENT: one new table, IF NOT EXISTS everywhere. No existing
-- table or column changes; prices and totals are untouched. The code reads
-- fail-closed: a missing table or column (42P01 / 42703 / PGRST205) means "no
-- state" and nobody shows as confirmed; any other read error is unknown, also
-- not confirmed. So the code is safe to ship BEFORE this runs.
--
-- Writes go through the service role only (RLS on, no write policy). Staff of
-- the tenant can read.
--
-- NEEDS Production Migration Manager + Oran's OK. NOT APPLIED.
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.offer_line_confirmations;
-- (No other object depends on it.)

CREATE TABLE IF NOT EXISTS public.offer_line_confirmations (
  offer_line_id      uuid        PRIMARY KEY REFERENCES public.inquiry_offer_line_items(id) ON DELETE CASCADE,
  offer_id           uuid        NOT NULL REFERENCES public.inquiry_offers(id) ON DELETE CASCADE,
  tenant_id          uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id  uuid        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  status             text        NOT NULL CHECK (status IN ('confirmed','declined')),
  responded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_line_confirmations_offer
  ON public.offer_line_confirmations (tenant_id, offer_id);

ALTER TABLE public.offer_line_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offer_line_confirmations_staff_read ON public.offer_line_confirmations;
CREATE POLICY offer_line_confirmations_staff_read ON public.offer_line_confirmations
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.offer_line_confirmations FROM anon;
