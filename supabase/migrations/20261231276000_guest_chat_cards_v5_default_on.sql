-- L13 (Messages v5 guest dock) · cards_v5 fail-open default.
--
-- Owner decision 10 flipped after Front Door Chat v2 P1–P3: the dock draws
-- Messages v5 client cards unless a tenant has explicitly saved false.
-- Tenants with a NULL column (never configured) get true so a missing row
-- and a present-but-null row agree with GUEST_CHAT_DEFAULTS.cardsV5.
--
-- Additive data backfill only. Explicit false stays false.
UPDATE public.tenant_guest_chat_settings
   SET cards_v5 = true
 WHERE cards_v5 IS NULL;

COMMENT ON COLUMN public.tenant_guest_chat_settings.cards_v5 IS
  'Guest dock draws Messages v5 client cards. NULL/true = v5 cards; false = legacy bubbles.';
