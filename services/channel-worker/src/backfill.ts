import { isRelayableChatId, relayMessage, type RelayMessage } from "./relay.js";
import { webhookConfigured } from "./webhook-client.js";

/**
 * History import. `client.on("message")` only fires for what arrives after
 * pairing, so a freshly linked phone with years of chats produced an empty
 * inbox. On `ready` we walk the most recent 1:1 chats once and relay what we
 * find through the same webhook the live events use.
 *
 * Caps exist because this reads through the phone's own link: every message is
 * a round trip to the device, and an unbounded walk of a busy account would
 * hold the session hostage for an hour.
 */
export const BACKFILL_CHAT_LIMIT = 25;
export const BACKFILL_MESSAGE_LIMIT = 50;
/** Media is fetched only for this many newest messages per chat. */
export const BACKFILL_MEDIA_PER_CHAT = 20;
const POST_GAP_MS = 150;

export type BackfillChat = {
  id: { _serialized: string };
  isGroup: boolean;
  name?: string;
  timestamp: number;
  fetchMessages: (options: { limit: number }) => Promise<RelayMessage[]>;
};

export type BackfillClient = {
  getChats: () => Promise<BackfillChat[]>;
};

type ChatLike = { id: { _serialized: string }; isGroup: boolean; timestamp: number };

/** 1:1 chats only, newest activity first. No groups, no status broadcasts. */
export function selectBackfillChats<T extends ChatLike>(
  chats: readonly T[],
  limit: number = BACKFILL_CHAT_LIMIT,
): T[] {
  return chats
    .filter((chat) => !chat.isGroup && isRelayableChatId(chat.id._serialized))
    .slice()
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit);
}

/**
 * `fetchMessages` returns earliest-to-latest, so the newest slice is the tail.
 * Index 0 of a 50-message chat is the oldest and gets text only.
 */
export function shouldDownloadMedia(index: number, total: number): boolean {
  return total - index <= BACKFILL_MEDIA_PER_CHAT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const done = new Set<string>();

export function resetBackfillState(tenantId?: string): void {
  if (tenantId) done.delete(tenantId);
  else done.clear();
}

export async function backfillTenant(
  tenantId: string,
  client: BackfillClient,
  options?: { force?: boolean },
): Promise<number> {
  if (!webhookConfigured()) return 0;
  if (!options?.force && done.has(tenantId)) return 0;
  done.add(tenantId);

  let relayed = 0;
  try {
    // Selected newest-first, walked oldest-first. Each insert stamps the
    // inquiry's `updated_at` with now() via the touch trigger, and the inbox
    // orders on that column, so importing the busiest chat last is what puts
    // it at the top of the list instead of the bottom.
    const chats = selectBackfillChats(await client.getChats()).reverse();
    for (const chat of chats) {
      const chatId = chat.id._serialized;
      let messages: RelayMessage[] = [];
      try {
        messages = await chat.fetchMessages({ limit: BACKFILL_MESSAGE_LIMIT });
      } catch (err) {
        console.warn("[channel-worker] backfill fetchMessages failed", chatId, err);
        continue;
      }
      for (let index = 0; index < messages.length; index += 1) {
        const ok = await relayMessage({
          tenantId,
          chatId,
          message: messages[index]!,
          pushName: chat.name ?? null,
          withMedia: shouldDownloadMedia(index, messages.length),
        });
        if (ok) relayed += 1;
        await sleep(POST_GAP_MS);
      }
    }
  } catch (err) {
    // A failed walk must not leave the tenant marked as imported.
    done.delete(tenantId);
    console.error("[channel-worker] backfill failed", tenantId, err);
    throw err;
  }
  console.log(`[channel-worker] backfill relayed ${relayed} messages for ${tenantId}`);
  return relayed;
}
