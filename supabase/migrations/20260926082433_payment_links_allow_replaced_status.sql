-- GAP-JOR-4: remint marks prior open payment_links as status='replaced'.
-- cancelPaymentLink(..., { asReplaced: true }) already writes that value;
-- the original CHECK only allowed open|paid|expired|cancelled (23514 on remint).

BEGIN;

ALTER TABLE public.payment_links
  DROP CONSTRAINT IF EXISTS payment_links_status_known;

ALTER TABLE public.payment_links
  ADD CONSTRAINT payment_links_status_known
  CHECK (status IN ('open', 'paid', 'expired', 'cancelled', 'replaced'));

COMMIT;
