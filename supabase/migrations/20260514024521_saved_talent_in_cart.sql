BEGIN;

ALTER TABLE public.saved_talent
  ADD COLUMN IF NOT EXISTS in_cart boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.saved_talent.in_cart IS
  'true = queued for an inquiry-in-progress cart; false = saved for later (favorites). Cart UI filters WHERE in_cart=true.';

CREATE INDEX IF NOT EXISTS saved_talent_in_cart_idx
  ON public.saved_talent (client_user_id, in_cart)
  WHERE in_cart = true;

COMMIT;
