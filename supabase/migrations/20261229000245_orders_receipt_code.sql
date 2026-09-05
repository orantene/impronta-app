-- A public receipt code on `orders`, so `/r/<code>` has something to resolve.
--
-- Requested by Events & Ticketing: a QR has to live somewhere a buyer can open
-- on a phone at a door, and the route is registered but points at nothing.
--
-- TWO THINGS IT IS DELIBERATELY NOT:
--
--   Not the order id. A receipt link goes into an email and onto paper, and the
--   id is internal. Enumerating receipts would be enumerating every sale on the
--   platform.
--
--   Not an admission token. One code identifies one ORDER; each admission on it
--   carries its own token. Six seats on one receipt is ONE code and SIX tokens.
--   Conflating them would mean forwarding a receipt link hands over every ticket
--   on it, irrevocably.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_code TEXT;

-- Partial unique: nullable because orders created before this migration have no
-- code, and backfilling them would mint public identifiers for sales nobody
-- asked to publish. New orders get one at creation.
CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_code_uniq
  ON public.orders (receipt_code) WHERE receipt_code IS NOT NULL;

-- Length floor, not a format. The generator is
-- `lib/links/code.ts:generateOpaqueCode` — 20 chars from a 33-symbol alphabet
-- with every confusable pair already removed, which is ~100 bits. This CHECK
-- exists so a future caller cannot quietly assign something short and
-- guessable; it deliberately does NOT pin the alphabet, because that belongs to
-- the generator and pinning it in two places is how the two drift apart.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_receipt_code_len;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_receipt_code_len
  CHECK (receipt_code IS NULL OR char_length(receipt_code) >= 16);

COMMENT ON COLUMN public.orders.receipt_code IS
  'Unguessable public identifier for /r/<code>. NOT the order id (a receipt goes '
  'on paper) and NOT an admission token (one code per ORDER; each admission '
  'carries its own token, so forwarding a receipt does not hand over the '
  'tickets). Assigned by createPurchase via lib/links/code.ts.';
