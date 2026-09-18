/**
 * The thread stream, pure: engine `ThreadMessage[]` → the ordered items the
 * screen draws (day separators, the unread divider, grouped bubbles, system
 * lines, cards). No React here so the grouping rules are testable on their
 * own and the same for desktop and mobile.
 *
 * Grouping: consecutive bubbles from the same sender within 3 minutes share
 * one group (first / middle / last); anything else (a card, a day, a system
 * line, a different sender) closes it. The unread divider sits before the
 * last `unreadCount` client messages, which is what `inquiry_message_reads`
 * counts as unread for the operator.
 */

import { CARD_KINDS, type CardKind, type ThreadMessage } from "@/lib/messaging/types";
import { offerCardMessageIds } from "@/lib/messages-v5/client-thread-view";

import type { BubblePosition, DeliveryState } from "../kit/MessageBubble";

export const GROUP_WINDOW_MS = 3 * 60 * 1000;

/** Kinds drawn as bubbles rather than cards. */
export const BUBBLE_KINDS: ReadonlySet<string> = new Set(["text", "internal_note", "voice", "attachment", "file"]);

export type StreamItem =
  | { readonly kind: "day"; readonly key: string; readonly date: Date }
  | { readonly kind: "unread"; readonly key: string; readonly count: number }
  | { readonly kind: "message"; readonly key: string; readonly message: ThreadMessage; readonly position: BubblePosition; readonly mine: boolean; readonly fromClient: boolean }
  | { readonly kind: "system"; readonly key: string; readonly message: ThreadMessage }
  | { readonly kind: "card"; readonly key: string; readonly message: ThreadMessage; readonly cardKind: CardKind };

const CARD_KIND_SET = new Set<string>(CARD_KINDS);

export function isCardKindString(kind: string): kind is CardKind {
  return CARD_KIND_SET.has(kind) && !BUBBLE_KINDS.has(kind);
}

/** A message from the client side: no staff sender (a guest session, or nothing at all). */
export function isFromClient(message: Pick<ThreadMessage, "senderUserId" | "internal" | "system">): boolean {
  return message.senderUserId === null && !message.internal && !message.system;
}

function senderKey(message: ThreadMessage): string {
  if (message.internal) return `note:${message.senderUserId ?? "staff"}`;
  if (message.senderUserId) return `staff:${message.senderUserId}`;
  return `client:${message.guestSessionId ?? "guest"}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export type BuildStreamInput = {
  readonly messages: readonly ThreadMessage[];
  readonly currentUserId: string | null;
  /** Unread client messages for the operator (the inbox row's `unreadCount`). */
  readonly unreadCount: number;
};

export function buildStream({ messages, currentUserId, unreadCount }: BuildStreamInput): StreamItem[] {
  // One offer card per offer (the newest sent event wins: the legacy
  // `offer_event` row the offer engine writes on every send, or the v5
  // `offer_review` card). The engine's "Offer sent to client." system line and
  // the talent-thread mirror are the same fact and stay out of the stream.
  const offerCards = offerCardMessageIds(messages.filter((m) => m.thread !== "group"));
  const live = messages.filter((m) => {
    if (m.kind === "offer_event" || m.kind === "offer_review") return offerCards.has(m.id);
    if (m.system && m.systemEvent === "offer_sent" && offerCards.size > 0) return false;
    return !m.deletedAt || BUBBLE_KINDS.has(m.kind);
  });
  const items: StreamItem[] = [];

  // Index of the first unread client message (counting from the end).
  let unreadAt = -1;
  if (unreadCount > 0) {
    let seen = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      if (isFromClient(live[i])) {
        seen++;
        if (seen === unreadCount) {
          unreadAt = i;
          break;
        }
      }
    }
    if (unreadAt === -1 && seen > 0) unreadAt = live.findIndex((m) => isFromClient(m));
  }

  let lastDay: Date | null = null;
  let prevBubble: { index: number; sender: string; at: number } | null = null;

  for (let i = 0; i < live.length; i++) {
    const m = live[i];
    const at = new Date(m.createdAt);
    if (!lastDay || !sameDay(lastDay, at)) {
      items.push({ kind: "day", key: `day:${m.id}`, date: at });
      lastDay = at;
      prevBubble = null;
    }
    if (i === unreadAt) {
      items.push({ kind: "unread", key: `unread:${m.id}`, count: unreadCount });
      prevBubble = null;
    }

    if (BUBBLE_KINDS.has(m.kind) && !m.system) {
      const sender = senderKey(m);
      const grouped = prevBubble !== null && prevBubble.sender === sender && at.getTime() - prevBubble.at <= GROUP_WINDOW_MS;
      if (grouped && prevBubble) {
        const prev = items[prevBubble.index];
        if (prev.kind === "message") {
          items[prevBubble.index] = { ...prev, position: prev.position === "single" ? "first" : "middle" };
        }
      }
      items.push({
        kind: "message",
        key: m.id,
        message: m,
        position: grouped ? "last" : "single",
        mine: m.internal || (currentUserId !== null && m.senderUserId === currentUserId) || (m.senderUserId !== null && currentUserId === null),
        fromClient: isFromClient(m),
      });
      prevBubble = { index: items.length - 1, sender, at: at.getTime() };
      continue;
    }

    prevBubble = null;
    if (m.kind === "offer_event") {
      items.push({ kind: "card", key: m.id, message: m, cardKind: "offer_review" });
    } else if (isCardKindString(m.kind)) {
      items.push({ kind: "card", key: m.id, message: m, cardKind: m.kind });
    } else {
      items.push({ kind: "system", key: m.id, message: m });
    }
  }
  return items;
}

/** Engine delivery states → the bubble's six words. Unknown → null (no meta word). */
export function deliveryStateFor(delivery: ThreadMessage["delivery"]): DeliveryState | null {
  if (!delivery) return null;
  switch (delivery.state) {
    case "queued":
    case "sending":
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return delivery.state;
    default:
      return null;
  }
}

export function formatTime(iso: string, locale = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
}

export function dayLabel(date: Date, copy: { today: string; yesterday: string }, now: Date, locale = "en"): string {
  if (sameDay(date, now)) return copy.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return copy.yesterday;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** The id of the message the stream should scroll to on open: the unread divider's message, else the last one. */
export function scrollTargetKey(items: readonly StreamItem[]): string | null {
  const unread = items.find((it) => it.kind === "unread");
  if (unread) return unread.key;
  const last = items[items.length - 1];
  return last ? last.key : null;
}
