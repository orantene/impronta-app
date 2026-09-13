import { storeMedia, type StoredMedia } from "./media.js";
import { postWebhook } from "./webhook-client.js";

/**
 * One shape for both directions of travel: a message the phone just received,
 * a message the owner just sent from the phone, and a message the history
 * backfill walked past all POST the same `kind: "message"` body. The app
 * de-dupes on `providerRef` via message_delivery, so the same message
 * arriving twice (live event + backfill) is free.
 */
/** The name-bearing fields of a whatsapp-web.js `Contact`. */
export type RelayContact = {
  name?: string | null;
  pushname?: string | null;
  verifiedName?: string | null;
  shortName?: string | null;
};

export type RelayMessage = {
  id: { _serialized: string };
  from: string;
  to?: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  timestamp: number;
  getContact?: () => Promise<RelayContact | null>;
  downloadMedia?: () => Promise<unknown>;
};

export type MessageWebhookBody = {
  kind: "message";
  tenantId: string;
  chatId: string;
  from: string;
  pushName: string | null;
  providerRef: string;
  text: string;
  media: StoredMedia | null;
  fromMe: boolean;
  sentAt: string;
};

/** WhatsApp timestamps are unix seconds; a missing one means "now". */
export function sentAtIso(timestamp: number | null | undefined): string {
  const seconds = typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : Date.now() / 1000;
  return new Date(seconds * 1000).toISOString();
}

export function isRelayableChatId(chatId: string): boolean {
  return chatId.endsWith("@c.us");
}

/**
 * The owner's own address-book entry first, then whatever the customer set as
 * their WhatsApp name — the order WhatsApp itself displays.
 */
export function contactDisplayName(contact: RelayContact | null | undefined): string | null {
  const candidates = [contact?.name, contact?.pushname, contact?.verifiedName, contact?.shortName];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * A `Message` carries no name of its own — the sender's name lives on the
 * Contact, one round trip away. Only inbound needs it, because the app names
 * an inquiry when it opens one and only opens one for inbound. Backfill hands
 * the chat's name in instead, so a history walk never pays for this.
 */
export async function resolvePushName(
  message: RelayMessage,
  given: string | null | undefined,
): Promise<string | null> {
  const explicit = given?.trim();
  if (explicit) return explicit;
  if (message.fromMe || !message.getContact) return null;
  try {
    return contactDisplayName(await message.getContact());
  } catch (err) {
    // A display name is not worth losing the message over.
    console.warn("[channel-worker] contact lookup failed", message.id._serialized, err);
    return null;
  }
}

export function messageWebhookBody(input: {
  tenantId: string;
  chatId: string;
  message: RelayMessage;
  pushName?: string | null;
  media?: StoredMedia | null;
}): MessageWebhookBody {
  return {
    kind: "message",
    tenantId: input.tenantId,
    chatId: input.chatId,
    from: input.chatId,
    pushName: input.pushName?.trim() || null,
    providerRef: input.message.id._serialized,
    text: input.message.body ?? "",
    media: input.media ?? null,
    fromMe: input.message.fromMe === true,
    sentAt: sentAtIso(input.message.timestamp),
  };
}

/**
 * Relay one message to the app. `withMedia` is false for the older tail of a
 * backfill so a first sync doesn't pull hundreds of megabytes through the
 * phone's link.
 */
export async function relayMessage(input: {
  tenantId: string;
  chatId: string;
  message: RelayMessage;
  pushName?: string | null;
  withMedia: boolean;
}): Promise<boolean> {
  if (!isRelayableChatId(input.chatId)) return false;
  const pushName = await resolvePushName(input.message, input.pushName);
  let media: StoredMedia | null = null;
  if (input.withMedia && input.message.hasMedia && input.message.downloadMedia) {
    try {
      const downloaded = await input.message.downloadMedia();
      media = await storeMedia(
        input.tenantId,
        input.message.id._serialized,
        (downloaded ?? null) as { mimetype?: string | null; data?: string | null } | null,
      );
    } catch (err) {
      // An expired media key or a phone that went offline mid-download must
      // not cost us the text of the message.
      console.warn("[channel-worker] media download failed", input.message.id._serialized, err);
    }
  }
  return postWebhook(
    messageWebhookBody({
      tenantId: input.tenantId,
      chatId: input.chatId,
      message: input.message,
      pushName,
      media,
    }),
  );
}
