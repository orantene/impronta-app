import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { WhatsAppProvider } from "../whatsapp/provider";
import { createTwilioWhatsAppProvider, twilioWhatsAppConfigFromEnv } from "../whatsapp/twilio";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";

const sentThisInvocation = new Set<string>();

function ownerProvider(): { provider: WhatsAppProvider; to: string } | null {
  const config = twilioWhatsAppConfigFromEnv();
  const to = process.env.SUPPORT_OWNER_WHATSAPP_TO?.trim();
  if (!config || !to) return null;
  return { provider: createTwilioWhatsAppProvider(config), to };
}

/**
 * Owner WhatsApp alerts via Twilio. No-ops when env is unset.
 * Dedupes per eventId so a multi-admin audience does not fan out copies
 * to the same SUPPORT_OWNER_WHATSAPP_TO number.
 */
export async function sendWhatsAppNotification(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  _ctx: AudienceContext,
  deps: { owner?: { provider: WhatsAppProvider; to: string } | null } = {},
): Promise<string | null> {
  const owner = deps.owner !== undefined ? deps.owner : ownerProvider();
  if (!owner) return null;
  if (!entry.whatsapp) return null;
  if (sentThisInvocation.has(event.eventId)) return null;

  const body = entry.whatsapp.render(event, recipient).trim();
  if (!body) return null;

  try {
    const sent = await owner.provider.sendText({ to: owner.to, body });
    if (!sent.ok) return null;
    // Mark deduped only AFTER a successful send — adding before the call
    // would turn the dispatcher's failed-send retry into a silent no-op.
    if (sentThisInvocation.size > 500) sentThisInvocation.clear();
    sentThisInvocation.add(event.eventId);
    return sent.providerReference;
  } catch (err) {
    logServerError("notifications.whatsapp.send", err);
    throw err;
  }
}
