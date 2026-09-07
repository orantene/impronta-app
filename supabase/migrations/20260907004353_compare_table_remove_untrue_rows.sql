-- Two rows leave the comparison. One is a straightforward untruth; the other is
-- built and dark.
--
-- PRIORITY EMAIL ROUTING: DELETED. There is no implementation anywhere in the
-- tree. Not a gate that grants everyone, not a half-built channel: nothing. It
-- was moved to "included on every plan" earlier tonight on my own reasoning
-- that these features exist and every plan has them, and that reasoning was
-- measured with a broken shell glob that returned zero readers for everything
-- I asked it. So it has been sitting on the live pricing page claiming a
-- feature that does not exist, to a paying stranger. It goes first.
--
-- WHATSAPP INQUIRY NOTIFICATIONS: DELETED FROM THE COMPARISON, and not
-- replaced with a roadmap line.
--
-- The channel is REAL: src/lib/notifications/channels/whatsapp.ts, a prefs
-- entry, a catalog entry with whatsapp in defaultChannels. It sends nothing.
-- `whatsappConfigured()` requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
-- TWILIO_WHATSAPP_FROM and SUPPORT_OWNER_WHATSAPP_TO, and the sender returns
-- null when any is missing. They are unset, and the Twilio account is the
-- owner's to open.
--
-- The CEO offered a dated roadmap line or nothing, my choice. I choose nothing.
-- An undated "coming soon" on a pricing page is a promise with no one behind
-- it, and the honest version of this row is the one that appears the day the
-- four values are set, because on that day it becomes true with no further
-- work. A row that can become true by configuration should wait to be true
-- rather than be sold early.
--
-- Data-only. No schema change.

begin;

delete from public.product_features f
using public.product_tiers t
where f.tier_id = t.id
  and f.label in ('Priority email routing', 'WhatsApp inquiry notifications');

do $$
declare untrue int;
begin
  select count(*) into untrue from public.product_features
   where label in ('Priority email routing', 'WhatsApp inquiry notifications');
  if untrue > 0 then
    raise exception 'rows remain: %. A label was renamed.', untrue;
  end if;
end $$;

commit;
