"use client";

/**
 * L13 · one v5 client card from one engine row, the dispatch `ClientThreadView`
 * uses, as a component so the guest dock draws the SAME card the secure link
 * draws (one client surface, D-MSG-200). `activity` and the handlers come
 * from `useClientCardActions`.
 */

import type { ThreadMessage } from "@/lib/messaging/types";
import {
  clientOfferForMessage,
  readChange,
  readChoices,
  readConfirmation,
  readPayment,
  readTickets,
  readTimes,
  ticketsIssued,
  type ClientCardKind,
  type ClientOfferSummary,
} from "@/lib/messages-v5/client-thread-view";

import { Card, CardLine } from "../kit/Card";
import type { KitCopy } from "../kit/copy";
import { SystemLine } from "../kit/MessageBubble";
import { ChoicesCard, ClientChangeCard, ClientConfirmedCard, ClientDraftCard, ClientOfferCard, ClientPaymentCard, ClientTicketsCard, ClientTimesCard } from "./ClientCards";
import type { CardActivity } from "./ClientThreadView";
import type { ClientCopy } from "./copy";
import type { ClientCardActions } from "./use-client-card-actions";

export type ClientCardProps = {
  readonly message: ThreadMessage;
  readonly kind: ClientCardKind;
  readonly copy: ClientCopy;
  readonly kit: KitCopy;
  readonly locale: string;
  readonly business: string;
  readonly now: Date;
  readonly offers: readonly ClientOfferSummary[];
  readonly payCode: string | null;
  /** Ids of the offer rows that draw the live offer card (`offerCardMessageIds`). */
  readonly offerCards: ReadonlySet<string>;
  readonly actions: ClientCardActions;
};

/** The activity key a card reads: its message id, or the offer / record it is about. */
export function clientCardActivityKey(message: Pick<ThreadMessage, "id" | "payload">): string {
  const p = message.payload;
  const offerId = typeof p?.offer_id === "string" ? p.offer_id : typeof p?.offerId === "string" ? p.offerId : null;
  const recordId = typeof p?.recordId === "string" ? p.recordId : null;
  return offerId ?? recordId ?? message.id;
}

export function ClientCard({ message, kind, copy, kit, locale, business, now, offers, payCode, offerCards, actions }: ClientCardProps) {
  const act = (key: string): CardActivity => actions.activity[key] ?? { phase: "idle" };
  const payload = message.payload;
  switch (kind) {
    case "tickets_card": {
      const tickets = readTickets(payload);
      if (ticketsIssued(tickets) || tickets.state === "cancelled") {
        return (
          <ClientTicketsCard
            view={tickets}
            copy={copy}
            business={business}
            onOpen={(code) => {
              window.location.assign(`/q/${encodeURIComponent(code)}`);
            }}
          />
        );
      }
      const a = act(message.id);
      return <ChoicesCard view={readChoices(kind, payload)} copy={copy} kit={kit} business={business} locale={locale} phase={a.phase} refusal={a.refusal} onSend={(ids) => void actions.onChoose(message.id, ids)} />;
    }
    case "menu_options":
    case "service_card":
    case "class_card": {
      const a = act(message.id);
      return <ChoicesCard view={readChoices(kind, payload)} copy={copy} kit={kit} business={business} locale={locale} phase={a.phase} refusal={a.refusal} onSend={(ids) => void actions.onChoose(message.id, ids)} />;
    }
    case "professional_times": {
      const a = act(message.id);
      return <ClientTimesCard view={readTimes(payload)} copy={copy} kit={kit} business={business} locale={locale} now={now} phase={a.phase} refusal={a.refusal} onPick={(startsAt) => void actions.onPickTime(message.id, startsAt)} />;
    }
    case "offer_event":
    case "offer_review":
    case "offer_state": {
      const offer = clientOfferForMessage(payload, offers);
      // Only the last "sent" event per offer draws the live offer; every other offer row reads as one line.
      if (!offer || !offerCards.has(message.id)) {
        return <SystemLine text={message.body || copy.generic.message} variant="mobile" />;
      }
      const a = act(offer.id);
      return <ClientOfferCard offer={offer} copy={copy} kit={kit} business={business} locale={locale} now={now} phase={a.phase} refusal={a.refusal} payCode={payCode} onAccept={actions.onAcceptOffer} onDecline={actions.onDeclineOffer} onChange={(o, text) => actions.onChangeRecord("offer", o.id, text, o.id)} onPay={actions.onPay} />;
    }
    case "payment_request":
      return <ClientPaymentCard view={readPayment(payload)} copy={copy} business={business} locale={locale} now={now} onPay={actions.onPay} />;
    case "order_confirmation":
    case "appointment_confirmation": {
      const view = readConfirmation(payload);
      const a = act(view.recordId ?? message.id);
      return <ClientConfirmedCard view={view} kind={kind} copy={copy} business={business} locale={locale} phase={a.phase} onChange={view.recordId ? (text) => void actions.onChangeRecord(view.recordKind ?? kind, view.recordId as string, text) : undefined} />;
    }
    case "change_request":
    case "change_result":
      return <ClientChangeCard view={readChange(kind, payload, message.body)} copy={copy} business={business} />;
    case "basket": {
      const lines = Array.isArray(payload?.lines) ? (payload?.lines as Array<Record<string, unknown>>) : [];
      return <ClientDraftCard lines={lines.map((l) => ({ label: String(l.label ?? ""), units: typeof l.units === "number" ? l.units : 1, unitCents: typeof l.unitCents === "number" ? l.unitCents : 0 }))} currency={typeof payload?.currency === "string" ? payload.currency : "USD"} copy={copy} business={business} />;
    }
    default:
      return (
        <Card category="id" label={copy.generic.message} title={message.body || copy.generic.message} variant="mobile" testId="client-generic">
          <CardLine muted label={message.body} />
        </Card>
      );
  }
}
