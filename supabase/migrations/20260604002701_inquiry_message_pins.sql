-- inquiry_message_pins — INQUIRY-WIDE message pins (shared flags).
--
-- Distinct from inquiry_message_stars (per-user PRIVATE bookmark,
-- migration 20260515023332). A "pin" is shared across the whole
-- inquiry thread: when anyone pins a message, EVERYONE on the thread
-- sees it in the "Pinned" strip. Used for "this is the agreed call
-- time / venue / decision everyone should be able to find."
--
-- Schema: primary key on message_id alone (a message is pinned ONCE
-- for everyone, not once per user). tenant_id + inquiry_id are denorm
-- columns so the visibility/insert policies can authorize without a
-- join back through inquiry_messages, mirroring how stars carries
-- inquiry_id.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_message_pins (
  message_id UUID NOT NULL REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id)
);

-- Index for the "show me the pins on this inquiry" query.
CREATE INDEX IF NOT EXISTS inquiry_message_pins_inquiry_idx
  ON public.inquiry_message_pins (inquiry_id, pinned_at DESC);

-- RLS — pins are inquiry-wide. SELECT mirrors message-read visibility
-- (tenant staff OR an inquiry participant); INSERT/DELETE allowed to
-- tenant staff OR an inquiry participant (mirrors how stars authorizes
-- the acting user against the inquiry, but pins are not user-scoped).
ALTER TABLE public.inquiry_message_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_message_pins_select ON public.inquiry_message_pins;
CREATE POLICY inquiry_message_pins_select ON public.inquiry_message_pins
  FOR SELECT USING (
    public.is_staff_of_tenant(tenant_id)
    OR EXISTS (
      -- Anyone who participates in the inquiry may read its pins.
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_message_pins.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS inquiry_message_pins_insert ON public.inquiry_message_pins;
CREATE POLICY inquiry_message_pins_insert ON public.inquiry_message_pins
  FOR INSERT WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_message_pins.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS inquiry_message_pins_delete ON public.inquiry_message_pins;
CREATE POLICY inquiry_message_pins_delete ON public.inquiry_message_pins
  FOR DELETE USING (
    public.is_staff_of_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_message_pins.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('invited', 'active')
    )
  );

COMMENT ON TABLE public.inquiry_message_pins IS
  'Inquiry-wide message pins (shared). PK is message_id alone — a message is pinned once for everyone on the thread.';

COMMIT;
