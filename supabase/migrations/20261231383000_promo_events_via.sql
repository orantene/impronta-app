-- Promos PR4 (TUL-938): source tag on promo_events (design L4).
-- `via` is the short channel tag of the link that was opened or shared
-- (ig_story, ig_post, tiktok, wa, qr, qr_print, link, email, code, site).
-- Additive and nullable: old rows and callers without a tag stay valid.
-- The Share kit writes it from the service role only (RLS unchanged).

ALTER TABLE public.promo_events ADD COLUMN IF NOT EXISTS via text;

ALTER TABLE public.promo_events DROP CONSTRAINT IF EXISTS promo_events_via_check;
ALTER TABLE public.promo_events ADD CONSTRAINT promo_events_via_check
  CHECK (via IS NULL OR via IN ('ig_story','ig_post','tiktok','wa','qr','qr_print','link','email','code','site'));

CREATE INDEX IF NOT EXISTS promo_events_promo_via_idx ON public.promo_events (promo_id, via);

COMMENT ON COLUMN public.promo_events.via IS
  'Source tag of the promo link (L4 attribution). Null when the link carried none.';
