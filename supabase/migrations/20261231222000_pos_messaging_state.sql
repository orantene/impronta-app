-- POS Messages & Inquiries: conversation / opportunity / record state.
-- Additive. Production is not applied by this file's author; isolated first.

BEGIN;

-- ── inquiries: three-state model (conversation ≠ opportunity ≠ record) ──

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS conversation_state text,
  ADD COLUMN IF NOT EXISTS opportunity_state text,
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_staff_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS location_slug text NOT NULL DEFAULT 'default';

UPDATE public.inquiries
   SET channel = COALESCE(channel, CASE
         WHEN source_channel IN ('web_chat', 'whatsapp', 'sms', 'email', 'counter') THEN source_channel
         ELSE 'web_chat'
       END)
 WHERE channel IS NULL;

ALTER TABLE public.inquiries
  DROP CONSTRAINT IF EXISTS inquiries_conversation_state_known;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_conversation_state_known
  CHECK (conversation_state IS NULL OR conversation_state IN ('needs_reply', 'awaiting_customer', 'resolved'));

ALTER TABLE public.inquiries
  DROP CONSTRAINT IF EXISTS inquiries_opportunity_state_known;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_opportunity_state_known
  CHECK (opportunity_state IS NULL OR opportunity_state IN (
    'gathering', 'offer_sent', 'awaiting_acceptance', 'accepted_awaiting_deposit', 'won', 'lost'
  ));

ALTER TABLE public.inquiries
  DROP CONSTRAINT IF EXISTS inquiries_channel_known;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_channel_known
  CHECK (channel IS NULL OR channel IN ('web_chat', 'whatsapp', 'sms', 'email', 'counter'));

CREATE INDEX IF NOT EXISTS inquiries_messaging_inbox_idx
  ON public.inquiries (tenant_id, location_slug, conversation_state, owner_user_id);

-- ── conversation_records (MS11: several records on one conversation) ──

CREATE TABLE IF NOT EXISTS public.conversation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  record_kind text NOT NULL,
  record_id uuid NOT NULL,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT conversation_records_kind_known CHECK (record_kind IN (
    'order', 'appointment', 'reservation', 'class_enrolment', 'tickets', 'project', 'offer'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_records_one_live
  ON public.conversation_records (tenant_id, inquiry_id, record_kind, record_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS conversation_records_inquiry_idx
  ON public.conversation_records (inquiry_id) WHERE unlinked_at IS NULL;

ALTER TABLE public.conversation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_records_select_staff ON public.conversation_records;
CREATE POLICY conversation_records_select_staff ON public.conversation_records
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.conversation_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversation_records TO authenticated;
GRANT ALL ON public.conversation_records TO service_role;

-- ── conversation_identity (MS04/MS05: link ≠ confirm ≠ grant) ──

CREATE TABLE IF NOT EXISTS public.conversation_identity (
  inquiry_id uuid PRIMARY KEY REFERENCES public.inquiries(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'none',
  method text,
  confirmed_at timestamptz,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT conversation_identity_level_known CHECK (level IN ('none', 'linked', 'confirmed', 'granted')),
  CONSTRAINT conversation_identity_method_known CHECK (method IS NULL OR method IN (
    'phone', 'email', 'sms_code', 'name_only', 'staff'
  ))
);

ALTER TABLE public.conversation_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_identity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_identity_select_staff ON public.conversation_identity;
CREATE POLICY conversation_identity_select_staff ON public.conversation_identity
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.conversation_identity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversation_identity TO authenticated;
GRANT ALL ON public.conversation_identity TO service_role;

-- ── message_delivery (MS23) ──

CREATE TABLE IF NOT EXISTS public.message_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  channel text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  provider_ref text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_delivery_channel_known CHECK (channel IN ('web_chat', 'whatsapp', 'sms', 'email')),
  CONSTRAINT message_delivery_state_known CHECK (state IN ('queued', 'sent', 'delivered', 'read', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS message_delivery_one_per_channel
  ON public.message_delivery (message_id, channel);

ALTER TABLE public.message_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_delivery FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_delivery_select_staff ON public.message_delivery;
CREATE POLICY message_delivery_select_staff ON public.message_delivery
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.message_delivery FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.message_delivery TO authenticated;
GRANT ALL ON public.message_delivery TO service_role;

-- ── checkout_snapshots (MS19B: written BEFORE the link is minted) ──

CREATE TABLE IF NOT EXISTS public.checkout_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  payment_link_id uuid REFERENCES public.payment_links(id) ON DELETE SET NULL,
  basket jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  promised_at timestamptz,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  basket_version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS checkout_snapshots_inquiry_idx
  ON public.checkout_snapshots (tenant_id, inquiry_id, created_at DESC);

ALTER TABLE public.checkout_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checkout_snapshots_select_staff ON public.checkout_snapshots;
CREATE POLICY checkout_snapshots_select_staff ON public.checkout_snapshots
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.checkout_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.checkout_snapshots TO authenticated;
GRANT ALL ON public.checkout_snapshots TO service_role;

-- ── scheduled_messages (MS26: one live reminder per record) ──

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  record_kind text,
  record_id uuid,
  send_at timestamptz NOT NULL,
  body text NOT NULL DEFAULT '',
  card_kind text,
  state text NOT NULL DEFAULT 'scheduled',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT scheduled_messages_state_known CHECK (state IN (
    'scheduled', 'sent', 'cancelled', 'failed', 'auto_cancelled'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_messages_one_live_per_record
  ON public.scheduled_messages (tenant_id, record_kind, record_id)
  WHERE state = 'scheduled' AND record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
  ON public.scheduled_messages (send_at) WHERE state = 'scheduled';

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_messages_select_staff ON public.scheduled_messages;
CREATE POLICY scheduled_messages_select_staff ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.scheduled_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;

-- ── payment_links: lock to a basket version; optional inquiry ──

ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basket_version integer;

-- ── widen inquiry_messages.message_kind (keep every existing value) ──

ALTER TABLE public.inquiry_messages
  DROP CONSTRAINT IF EXISTS inquiry_messages_message_kind_check;

ALTER TABLE public.inquiry_messages
  ADD CONSTRAINT inquiry_messages_message_kind_check
  CHECK (message_kind = ANY (ARRAY[
    'text',
    'offer_event',
    'payment_request',
    'payment_paid',
    'booking_confirmed',
    'talent_rate_confirmed',
    'coordinator_request',
    'talent_rate',
    'call_sheet_update',
    'booking_status',
    'system_event',
    'admin_suggested_talent',
    'balance_due',
    'reservation',
    'order',
    'menu_options',
    'item_config',
    'basket',
    'service_card',
    'professional_times',
    'class_card',
    'tickets_card',
    'offer_review',
    'offer_state',
    'order_confirmation',
    'appointment_confirmation',
    'change_request',
    'change_result',
    'reminder',
    'internal_note'
  ]));

-- ── derive conversation_state from last delivered message + resolve/reopen ──

CREATE OR REPLACE FUNCTION public.messaging_touch_inquiry_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_customer boolean;
BEGIN
  IF NEW.message_kind = 'internal_note' THEN
    RETURN NEW;
  END IF;
  v_is_customer := (NEW.sender_user_id IS NULL) OR (NEW.guest_session_id IS NOT NULL AND NEW.sender_user_id IS NULL);
  IF NEW.sender_user_id IS NOT NULL THEN
    v_is_customer := false;
  END IF;
  IF v_is_customer THEN
    UPDATE public.inquiries
       SET last_customer_message_at = NEW.created_at,
           conversation_state = CASE
             WHEN conversation_state = 'resolved' THEN conversation_state
             ELSE 'needs_reply'
           END,
           updated_at = now()
     WHERE id = NEW.inquiry_id;
  ELSE
    UPDATE public.inquiries
       SET last_staff_message_at = NEW.created_at,
           conversation_state = CASE
             WHEN conversation_state = 'resolved' THEN conversation_state
             ELSE 'awaiting_customer'
           END,
           updated_at = now()
     WHERE id = NEW.inquiry_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inquiry_messages_touch_conversation ON public.inquiry_messages;
CREATE TRIGGER inquiry_messages_touch_conversation
  AFTER INSERT ON public.inquiry_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_touch_inquiry_from_message();

CREATE OR REPLACE FUNCTION public.messaging_derive_opportunity_state(p_inquiry public.inquiries)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_offer public.inquiry_offers%ROWTYPE;
BEGIN
  IF p_inquiry.lost_reason IS NOT NULL
     OR p_inquiry.status::text IN ('rejected', 'expired', 'closed_lost', 'closed') THEN
    RETURN 'lost';
  END IF;
  IF p_inquiry.status::text IN ('booked', 'converted', 'approved') THEN
    RETURN 'won';
  END IF;
  IF p_inquiry.current_offer_id IS NULL THEN
    IF p_inquiry.status::text IN ('submitted', 'new', 'qualified', 'reviewing', 'in_progress', 'coordination', 'waiting_for_client') THEN
      RETURN 'gathering';
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO v_offer FROM public.inquiry_offers WHERE id = p_inquiry.current_offer_id;
  IF NOT FOUND THEN
    RETURN 'gathering';
  END IF;
  IF v_offer.status IN ('accepted', 'approved') AND v_offer.accepted_at IS NOT NULL THEN
    RETURN 'accepted_awaiting_deposit';
  END IF;
  IF v_offer.status IN ('sent', 'pending') AND v_offer.sent_at IS NOT NULL THEN
    RETURN 'awaiting_acceptance';
  END IF;
  IF v_offer.status IN ('draft') THEN
    RETURN 'gathering';
  END IF;
  IF v_offer.sent_at IS NOT NULL THEN
    RETURN 'offer_sent';
  END IF;
  RETURN 'gathering';
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_touch_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.opportunity_state := public.messaging_derive_opportunity_state(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inquiries_touch_opportunity ON public.inquiries;
CREATE TRIGGER inquiries_touch_opportunity
  BEFORE UPDATE OF status, current_offer_id, lost_reason ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_touch_opportunity();

-- Backfill conversation + opportunity from existing rows (nullable, additive).
UPDATE public.inquiries i
   SET conversation_state = CASE
         WHEN i.resolved_at IS NOT NULL THEN 'resolved'
         WHEN i.last_customer_message_at IS NOT NULL
              AND (i.last_staff_message_at IS NULL OR i.last_customer_message_at >= i.last_staff_message_at)
           THEN 'needs_reply'
         WHEN i.last_staff_message_at IS NOT NULL THEN 'awaiting_customer'
         ELSE COALESCE(i.conversation_state, 'needs_reply')
       END,
       opportunity_state = public.messaging_derive_opportunity_state(i)
 WHERE i.conversation_state IS NULL OR i.opportunity_state IS NULL;

-- ── version-locked writers ──

CREATE OR REPLACE FUNCTION public.messaging_assign_owner(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_owner_user_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_inquiry_id IS NULL OR p_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  UPDATE public.inquiries
     SET owner_user_id = p_owner_user_id, version = v.version + 1, updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'inquiry_id', p_inquiry_id, 'version', v.version + 1, 'owner_user_id', p_owner_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_set_conversation_state(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_state text,
  p_actor uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
BEGIN
  IF p_state NOT IN ('needs_reply', 'awaiting_customer', 'resolved') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  UPDATE public.inquiries
     SET conversation_state = p_state,
         resolved_at = CASE WHEN p_state = 'resolved' THEN now() ELSE NULL END,
         resolved_by_user_id = CASE WHEN p_state = 'resolved' THEN p_actor ELSE NULL END,
         version = v.version + 1,
         updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'inquiry_id', p_inquiry_id, 'version', v.version + 1, 'conversation_state', p_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_close_lost(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_reason text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  UPDATE public.inquiries
     SET lost_reason = btrim(p_reason),
         opportunity_state = 'lost',
         version = v.version + 1,
         updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'inquiry_id', p_inquiry_id, 'version', v.version + 1, 'opportunity_state', 'lost');
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_link_record(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_record_kind text,
  p_record_id uuid,
  p_linked_by uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_record_kind NOT IN ('order', 'appointment', 'reservation', 'class_enrolment', 'tickets', 'project', 'offer') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_records
     WHERE tenant_id = p_tenant_id AND inquiry_id = p_inquiry_id
       AND record_kind = p_record_kind AND record_id = p_record_id AND unlinked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked');
  END IF;
  INSERT INTO public.conversation_records (tenant_id, inquiry_id, record_kind, record_id, linked_by)
  VALUES (p_tenant_id, p_inquiry_id, p_record_kind, p_record_id, p_linked_by)
  RETURNING id INTO v_id;
  UPDATE public.inquiries SET version = v.version + 1, updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'link_id', v_id, 'version', v.version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_unlink_record(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_link_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
  v_link public.conversation_records%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  SELECT * INTO v_link FROM public.conversation_records WHERE id = p_link_id FOR UPDATE;
  IF NOT FOUND OR v_link.inquiry_id IS DISTINCT FROM p_inquiry_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_link.unlinked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'version', v.version);
  END IF;
  UPDATE public.conversation_records
     SET unlinked_at = now(), version = v_link.version + 1
   WHERE id = p_link_id;
  UPDATE public.inquiries SET version = v.version + 1, updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'link_id', p_link_id, 'version', v.version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_set_identity(
  p_tenant_id uuid,
  p_inquiry_id uuid,
  p_level text,
  p_method text,
  p_customer_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.inquiries%ROWTYPE;
  v_id public.conversation_identity%ROWTYPE;
BEGIN
  IF p_level NOT IN ('none', 'linked', 'confirmed', 'granted') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v.version);
  END IF;
  INSERT INTO public.conversation_identity (inquiry_id, tenant_id, level, method, customer_id, confirmed_at)
  VALUES (
    p_inquiry_id, p_tenant_id, p_level, p_method, p_customer_id,
    CASE WHEN p_level IN ('confirmed', 'granted') THEN now() ELSE NULL END
  )
  ON CONFLICT (inquiry_id) DO UPDATE
    SET level = EXCLUDED.level,
        method = EXCLUDED.method,
        customer_id = EXCLUDED.customer_id,
        confirmed_at = EXCLUDED.confirmed_at,
        version = public.conversation_identity.version + 1
  RETURNING * INTO v_id;
  UPDATE public.inquiries SET version = v.version + 1, updated_at = now()
   WHERE id = p_inquiry_id AND version = v.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'level', p_level, 'version', v.version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_recover_from_snapshot(
  p_tenant_id uuid,
  p_snapshot_id uuid,
  p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.checkout_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.checkout_snapshots WHERE id = p_snapshot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v.recovered_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'order_id', v.recovered_order_id);
  END IF;
  UPDATE public.checkout_snapshots
     SET recovered_order_id = p_order_id
   WHERE id = p_snapshot_id AND recovered_order_id IS NULL;
  IF NOT FOUND THEN
    SELECT recovered_order_id INTO p_order_id FROM public.checkout_snapshots WHERE id = p_snapshot_id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'order_id', p_order_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'snapshot_id', p_snapshot_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_auto_cancel_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('paid', 'cancelled', 'refunded') THEN
    UPDATE public.scheduled_messages
       SET state = 'auto_cancelled'
     WHERE tenant_id = NEW.tenant_id
       AND record_kind = 'order'
       AND record_id = NEW.id
       AND state = 'scheduled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_auto_cancel_reminders ON public.orders;
CREATE TRIGGER orders_auto_cancel_reminders
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_auto_cancel_reminders();

-- Grants: service_role only; never anon / authenticated / PUBLIC.

DO $grants$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.messaging_assign_owner(uuid,uuid,uuid,integer)',
    'public.messaging_set_conversation_state(uuid,uuid,text,uuid,integer)',
    'public.messaging_close_lost(uuid,uuid,text,integer)',
    'public.messaging_link_record(uuid,uuid,text,uuid,uuid,integer)',
    'public.messaging_unlink_record(uuid,uuid,uuid,integer)',
    'public.messaging_set_identity(uuid,uuid,text,text,uuid,integer)',
    'public.messaging_recover_from_snapshot(uuid,uuid,uuid)',
    'public.messaging_derive_opportunity_state(public.inquiries)',
    'public.messaging_touch_inquiry_from_message()',
    'public.messaging_touch_opportunity()',
    'public.messaging_auto_cancel_reminders()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    IF has_function_privilege('anon', fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by service_role', fn;
    END IF;
  END LOOP;
END
$grants$;

-- Proof: a stale expected_version is a refusal, never a write. Rolled back.

DO $proof$
DECLARE
  v_tenant uuid;
  v_inq uuid;
  v_ver integer;
  v_res jsonb;
BEGIN
  SELECT tenant_id, id, version INTO v_tenant, v_inq, v_ver
    FROM public.inquiries
   LIMIT 1;
  IF v_inq IS NULL THEN
    RAISE NOTICE 'no inquiry to probe — privilege proofs already asserted';
    RETURN;
  END IF;

  v_res := public.messaging_assign_owner(v_tenant, v_inq, NULL, v_ver + 99);
  IF COALESCE(v_res->>'ok', 'true') = 'true' THEN
    RAISE EXCEPTION 'stale assign_owner wrote; expected conflict';
  END IF;
  IF v_res->>'reason' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'stale assign_owner reason=% expected conflict', v_res->>'reason';
  END IF;
  IF (SELECT version FROM public.inquiries WHERE id = v_inq) IS DISTINCT FROM v_ver THEN
    RAISE EXCEPTION 'stale assign_owner mutated version';
  END IF;

  BEGIN
    INSERT INTO public.inquiry_messages
      (inquiry_id, tenant_id, thread_type, message_kind, body)
    VALUES
      (v_inq, v_tenant, 'private', 'not_a_real_kind', '');
    RAISE EXCEPTION 'junk message_kind was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$proof$;

COMMIT;
