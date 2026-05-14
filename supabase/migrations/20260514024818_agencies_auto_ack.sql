-- Step 13: add auto-acknowledgement columns to agencies
-- When auto_ack_enabled = true (default), the inquiry engine inserts a
-- system message into the Client thread on every new inquiry submission,
-- using the auto_ack_message text. Gives clients an instant acknowledgement
-- while the coordinator picks up the inquiry.

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS auto_ack_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_ack_message  text    NOT NULL
    DEFAULT 'Thanks — we''ll get back to you within 4 hours.';
