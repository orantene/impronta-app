-- Roster ordering for inquiry_participants (new engine)

BEGIN;

ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_participants_inquiry_sort
  ON public.inquiry_participants (inquiry_id, sort_order)
  WHERE role = 'talent';

COMMIT;
