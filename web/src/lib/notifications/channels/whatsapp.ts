import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";

const sentThisInvocation = new Set<string>();

function whatsappConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim() &&
      process.env.SUPPORT_OWNER_WHATSAPP_TO?.trim(),
  );
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
): Promise<string | null> {
  if (!whatsappConfigured()) return null;
  if (!entry.whatsapp) return null;
  if (sentThisInvocation.has(event.eventId)) return null;
  sentThisInvocation.add(event.eventId);

  const body = entry.whatsapp.render(event, recipient).trim();
  if (!body) return null;

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!.trim(),
      process.env.TWILIO_AUTH_TOKEN!.trim(),
    );
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM!.trim(),
      to: process.env.SUPPORT_OWNER_WHATSAPP_TO!.trim(),
      body,
    });
    return msg.sid ?? "sent";
  } catch (err) {
    logServerError("notifications.whatsapp.send", err);
    throw err;
  }
}
