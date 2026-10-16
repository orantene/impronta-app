-- Promos widgets (TUL-1051 part B): count "Show code" taps on promo widgets.
-- `reveal` joins the allowed promo_events kinds. Additive: existing rows stay
-- valid, writes remain service_role only (RLS unchanged).
-- FILE ONLY in the PR: applied with the usual db:push before merge, never by hand.
-- The kind CHECK was declared inline in 20261231381500_promos_engine_v1.sql, so
-- Postgres named it promo_events_kind_check; dropped by name, IF EXISTS.

ALTER TABLE public.promo_events DROP CONSTRAINT IF EXISTS promo_events_kind_check;
ALTER TABLE public.promo_events ADD CONSTRAINT promo_events_kind_check
  CHECK (kind IN ('view','link_open','share','code_fail','reveal'));
