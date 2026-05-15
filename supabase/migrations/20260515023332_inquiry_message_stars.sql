-- inquiry_message_stars — per-user message stars (private flags).
--
-- Distinct from inquiry-level pinning (inquiry_user_flags) and message
-- reactions (message_reactions). A "star" is a personal bookmark — only
-- visible to the user who set it — used to mark "I want to find this
-- message again later." Common uses: starring a venue address, a call
-- time decision, an offer detail you want to refer back to.
--
-- Schema: composite primary key on (user_id, message_id). No tenant_id
-- because the message_id already pins to a single tenant via inquiry,
-- and the RLS policy enforces visibility through the user_id check.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_message_stars (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- Index for the "show me my starred messages on this inquiry" query.
CREATE INDEX IF NOT EXISTS inquiry_message_stars_user_inquiry_idx
  ON public.inquiry_message_stars (user_id, inquiry_id, created_at DESC);

-- RLS — users see/manage only their own stars.
ALTER TABLE public.inquiry_message_stars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_message_stars_select_self ON public.inquiry_message_stars;
CREATE POLICY inquiry_message_stars_select_self ON public.inquiry_message_stars
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS inquiry_message_stars_insert_self ON public.inquiry_message_stars;
CREATE POLICY inquiry_message_stars_insert_self ON public.inquiry_message_stars
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      -- User must be a participant on the inquiry the message belongs to.
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_message_stars.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS inquiry_message_stars_delete_self ON public.inquiry_message_stars;
CREATE POLICY inquiry_message_stars_delete_self ON public.inquiry_message_stars
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.inquiry_message_stars IS
  'Per-user message stars. Private bookmarks — only visible to the user who set them.';

COMMIT;
