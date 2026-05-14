-- Inquiry-funnel sprint — Step 7
-- Adds 'admin_suggested_talent' to the inquiry_messages.message_kind
-- CHECK constraint so the admin can attach a typed Suggested-Talent
-- card to a Client-thread message.
--
-- Card payload shape (validated at the server-action layer):
--   {
--     talent_profile_id: uuid,
--     talent_name:       text,
--     rate_label:        text | null,   -- e.g. "€800/day"
--     requirement_group_id: uuid | null, -- which slot to fill
--     status:            'pending' | 'added' | 'dismissed'
--   }
--
-- On click of "Add to lineup" the admin server action
-- (adminAddSuggestedTalent) calls addTalentToRoster() and flips the
-- card's status from 'pending' to 'added'.

BEGIN;

-- Drop the existing CHECK constraint (re-add with the new value below).
ALTER TABLE public.inquiry_messages
  DROP CONSTRAINT IF EXISTS inquiry_messages_message_kind_check;

ALTER TABLE public.inquiry_messages
  ADD CONSTRAINT inquiry_messages_message_kind_check
  CHECK (message_kind IN (
    'text',
    'offer_event',
    'payment_request',
    'payment_paid',
    'coordinator_request',
    'talent_rate',
    'call_sheet_update',
    'booking_status',
    'system_event',
    'admin_suggested_talent'
  ));

COMMENT ON COLUMN public.inquiry_messages.message_kind IS
  'Render discriminator for the conversation stream. text = plain bubble; everything else triggers a typed ChatCard render (see web/src/components/chat-cards/).';

COMMIT;
