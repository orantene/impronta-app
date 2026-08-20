-- Inquiry email loop (2026-08-20): per-conversation email-mirroring opt-out.
--
-- When a coordinator replies in the private thread, the inquirer gets the
-- reply mirrored to their inbox (the `inquiry.guest_reply.guest` catalog
-- entry). The email carries a signed "stop email notifications for this
-- conversation" link (/unsubscribe/conversation); honoring it stamps this
-- column. Null = mirroring on (the default). Written only by the service
-- role; read by the nudge orchestrator before every dispatch.
alter table public.inquiries
  add column if not exists email_mirror_muted_at timestamptz;

comment on column public.inquiries.email_mirror_muted_at is
  'When set, the inquirer opted out of email mirroring for this conversation (reply emails to their inbox). Null = mirroring on. Set via the signed /unsubscribe/conversation link; cleared never (v1).';
