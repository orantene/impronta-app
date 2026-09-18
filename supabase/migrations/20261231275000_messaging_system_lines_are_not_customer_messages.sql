-- Messages v5 live QA (2026-09-17): an engine line (workspace auto-ack,
-- "inquiry_created", offer_sent, ...) has no sender and carried
-- metadata.system_event_type, and the touch trigger read "no sender" as "the
-- customer wrote", so every conversation a staff member opened flipped to
-- needs_reply + unread the moment the auto-ack landed. System lines now touch
-- nothing: they are neither the client's turn nor the staff's.
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
  IF NEW.sender_user_id IS NULL AND NEW.metadata IS NOT NULL AND (NEW.metadata ? 'system_event_type') THEN
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
