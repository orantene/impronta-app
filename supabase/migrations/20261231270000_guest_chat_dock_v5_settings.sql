-- L13 (Messages v5 guest dock) · two tenant-wide switches on the existing
-- `tenant_guest_chat_settings` row (20260604184507), read by the public
-- launcher mounts and written by the admin "Guest chat" drawer.
--
--   items_tab  NULL/true = the dock shows its Items tab (Lineup renamed and
--              labelled per business). false hides it.
--   cards_v5   NULL/false = the dock keeps the legacy bubbles for card rows.
--              true draws the Messages v5 client cards (choices, times, offer,
--              payment, confirmed, change) in the dock. Opt-in per tenant
--              until QA passes (owner decision 10), then the default flips.
--
-- Additive only; the existing RLS (tenant staff write, public read through
-- the service-role readers) already covers these columns.
ALTER TABLE public.tenant_guest_chat_settings
  ADD COLUMN IF NOT EXISTS items_tab boolean,
  ADD COLUMN IF NOT EXISTS cards_v5 boolean;

COMMENT ON COLUMN public.tenant_guest_chat_settings.items_tab IS
  'Guest dock Items tab. NULL/true shows it; false hides it.';
COMMENT ON COLUMN public.tenant_guest_chat_settings.cards_v5 IS
  'Guest dock draws Messages v5 client cards. NULL/false = legacy bubbles; true = v5 cards.';
