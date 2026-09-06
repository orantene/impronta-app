-- Record WHAT a bounce actually said, not just that one happened.
--
-- Hard-bounce suppression has never written a row in production. The write path
-- was fixed (guest bounces used to be dropped for having no user_id), but a
-- bounce on 2026-09-03 with a perfectly good user_id still suppressed nothing —
-- so the remaining blocker is the CLASSIFIER, which only suppresses when Resend
-- says the bounce type is Permanent.
--
-- We cannot tell whether that condition is too strict or simply never met,
-- because the payload is read once and thrown away. These columns keep it. The
-- classifier stays exactly as conservative as it is; this only makes its input
-- observable, so the next real bounce answers the question with evidence
-- instead of another guess.
--
-- Nullable and free-text on purpose: this is provider vocabulary (Permanent /
-- Transient / Undetermined, and sub-types like Suppressed, NoEmail,
-- MailboxFull) and it changes without asking us. A CHECK here would reject the
-- very payload we are trying to observe.
alter table public.notification_dispatch_log
  add column if not exists bounce_type text,
  add column if not exists bounce_subtype text,
  add column if not exists bounce_message text;

comment on column public.notification_dispatch_log.bounce_type is
  'Resend bounce classification (Permanent / Transient / Undetermined). Drives hard-bounce suppression.';
comment on column public.notification_dispatch_log.bounce_subtype is
  'Resend bounce sub-type, e.g. Suppressed, NoEmail, MailboxFull, General.';
comment on column public.notification_dispatch_log.bounce_message is
  'Provider-supplied bounce reason, for diagnosing why an address stopped receiving mail.';
