-- Additive: normalize auto-ack default copy to drop the em dash (product rule).
-- Existing rows updated in place; new installs get the corrected DEFAULT.
UPDATE public.agencies
  SET auto_ack_message = replace(auto_ack_message, E' — ', ', ')
  WHERE auto_ack_message LIKE E'% — %';

UPDATE public.agencies
  SET auto_ack_message = 'Thanks, we''ll get back to you within 4 hours.'
  WHERE auto_ack_message IN (
    'Thanks — we''ll get back to you within 4 hours.',
    'Thanks , we''ll get back to you within 4 hours.'
  );

ALTER TABLE public.agencies
  ALTER COLUMN auto_ack_message
  SET DEFAULT 'Thanks, we''ll get back to you within 4 hours.';
