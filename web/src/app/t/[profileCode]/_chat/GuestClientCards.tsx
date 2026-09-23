"use client";

/**
 * L13 · the Messages v5 client cards inside the guest dock.
 *
 * The dock keeps its own bubbles (`MiniChatMessageBubble`) for text; every
 * row whose kind is a v5 card kind (choices, times, offer, payment, confirmed,
 * change, basket) is drawn by the SAME `ClientCard` the secure link draws, and
 * acts through the same `useClientCardActions` (thread-token identity, minted
 * by the full thread load once the guest cookie has proven ownership).
 *
 * `GuestThreadMessage` → `ThreadMessage` is a shape change only: the reader
 * has already filtered to what the guest may see (D-MSG-2).
 */

import { useMemo } from "react";

import { translatorFor } from "@/i18n/use-t";
import type { GuestThreadMessage, GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import type { ThreadMessage } from "@/lib/messaging/types";
import { isClientCardKind, offerCardMessageIds } from "@/lib/messages-v5/client-thread-view";
import { ClientCard } from "@/components/messages-v5/client/ClientCard";
import { buildClientCopy } from "@/components/messages-v5/client/copy";
import { useClientCardActions } from "@/components/messages-v5/client/use-client-card-actions";
import { buildKitCopy } from "@/components/messages-v5/kit/copy";
import "@/components/messages-v5/kit/tokens.css";

export function isGuestClientCardRow(m: Pick<GuestThreadMessage, "kind" | "isDeleted">): boolean {
  return !m.isDeleted && isClientCardKind(m.kind);
}

export function toThreadMessage(m: GuestThreadMessage): ThreadMessage {
  return {
    id: m.id,
    inquiryId: m.inquiryId,
    kind: m.kind,
    body: m.body,
    payload: m.cardPayload && typeof m.cardPayload === "object" ? (m.cardPayload as Record<string, unknown>) : null,
    // The client side is "no staff sender" (`isMine`); the id itself is never
    // read by a card, only its null-ness, so a sentinel keeps staff rows staff.
    senderUserId: m.authorRole === "guest" ? null : "staff",
    guestSessionId: null,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.isDeleted ? m.createdAt : null,
    thread: "private",
    internal: false,
    delivery: null,
    system: m.authorRole === "system",
  };
}

export type GuestClientCardsModel = ReturnType<typeof useGuestClientCards>;

/**
 * One model per open thread: copy, actions and the offer-card set, shared by
 * every card row in the stream. `refresh` bumps the panel's full load.
 */
export function useGuestClientCards(input: {
  readonly rows: readonly GuestThreadMessage[];
  readonly v5: GuestThreadV5Extras | null;
  readonly locale: string;
  readonly businessName: string;
  readonly refresh: () => void;
  readonly onTick?: () => void;
  readonly onAsk?: (text: string) => void;
}) {
  const { rows, v5, locale, businessName, refresh, onTick, onAsk } = input;
  const t = useMemo(() => translatorFor(locale), [locale]);
  const kit = useMemo(() => buildKitCopy(t), [t]);
  const copy = useMemo(() => buildClientCopy(t), [t]);
  const messages = useMemo(() => rows.map(toThreadMessage), [rows]);
  const offerCards = useMemo(() => offerCardMessageIds(messages), [messages]);
  const actions = useClientCardActions({ token: v5?.threadToken ?? null, messages, refresh, onTick });
  return { kit, copy, messages, offerCards, actions, offers: v5?.offers ?? [], payCode: v5?.payCode ?? null, businessName, locale, onAsk };
}

export function GuestClientCardRow({ row, model, now }: { readonly row: GuestThreadMessage; readonly model: GuestClientCardsModel; readonly now: Date }) {
  const message = useMemo(() => toThreadMessage(row), [row]);
  if (!isClientCardKind(message.kind)) return null;
  return (
    <div className="msgv5" data-guest-client-card={message.kind}>
      <ClientCard
        message={message}
        kind={message.kind}
        copy={model.copy}
        kit={model.kit}
        locale={model.locale}
        business={model.businessName}
        now={now}
        offers={model.offers}
        payCode={model.payCode}
        offerCards={model.offerCards}
        actions={model.actions}
        onAsk={model.onAsk}
      />
    </div>
  );
}
