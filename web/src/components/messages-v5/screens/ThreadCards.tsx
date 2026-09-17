/**
 * ThreadMessage.kind → one kit card (boards D01, D06, D07, D08, D09, D18).
 * Every engine CardKind maps to a category through `cardCategoryForKind`;
 * the seven typed cards read their own payloads, everything else (and any
 * unknown kind) falls back to the generic `Card` with the operator render
 * model's title and summary, so a new kind is visible, never blank.
 *
 * Card buttons dispatch shell action ids; the shell routes them (wired or
 * "coming"). One exception is fully local: "Copy link" on a payment card
 * copies the pay page URL the engine already minted.
 */

import { readCardState, renderCard, type BasketPayload, type ChangeRequestPayload, type ConfirmationPayload, type OfferReviewPayload, type OfferStatePayload, type PaymentRequestPayload, type ProfessionalTimesPayload } from "@/lib/messaging/cards";
import type { CardKind, ThreadMessage } from "@/lib/messaging/types";
import { formatOrderMoney } from "@/lib/orders/money-format";

import { AppointmentCard } from "../kit/AppointmentCard";
import { Card, cardCategoryForKind, cardCategoryLabel } from "../kit/Card";
import { ChangeRequestCard } from "../kit/ChangeRequestCard";
import { OfferCard, type OfferCardState } from "../kit/OfferCard";
import { OrderCard } from "../kit/OrderCard";
import { PaymentCard, type PaymentCardState } from "../kit/PaymentCard";
import { TimesCard } from "../kit/TimesCard";
import type { ScreenVariant, ShellActionId } from "./contracts";
import type { ScreenCopy } from "./copy";
import { formatTime } from "./thread-stream";

export type ThreadCardProps = {
  readonly message: ThreadMessage;
  readonly cardKind: CardKind;
  readonly clientName: string;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly locale?: string;
  readonly onAction: (id: ShellActionId, detail?: { readonly recordId?: string; readonly recordKind?: string }) => void;
  readonly onCopyText: (text: string) => void;
  readonly origin?: string;
};

function offerState(kind: CardKind, payload: Record<string, unknown> | null): OfferCardState {
  if (kind === "offer_state") {
    const status = String((payload as OfferStatePayload | null)?.offerStatus ?? "");
    if (status === "accepted") return "accepted";
    if (status === "declined") return "declined";
    if (status === "expired") return "expired";
    if (status === "draft") return "draft";
    return "sent";
  }
  const state = readCardState(payload);
  if (state === "selected" || state === "paid") return "accepted";
  if (state === "viewed") return "viewed";
  if (state === "expired") return "expired";
  if (state === "cancelled") return "declined";
  return "sent";
}

function paymentState(payload: Record<string, unknown> | null): PaymentCardState {
  const state = readCardState(payload);
  if (state === "paid") return "paid";
  if (state === "viewed") return "opened";
  if (state === "expired") return "expired";
  if (state === "cancelled") return "refunded";
  if (state === "unavailable") return "failed";
  if (state === "sent" || state === "selected") return "requested";
  return "unknown";
}

function money(cents: unknown, currency: unknown): string {
  return formatOrderMoney(typeof cents === "number" ? cents : 0, typeof currency === "string" ? currency : "USD");
}

export function ThreadCard({ message, cardKind, clientName, copy, variant, locale = "en", onAction, onCopyText, origin }: ThreadCardProps) {
  const kit = copy.kit;
  const model = renderCard(cardKind, message.payload, "operator");
  const p = message.payload ?? {};
  const mine = message.senderUserId !== null;

  switch (cardKind) {
    case "offer_review":
    case "offer_state": {
      const o = p as OfferReviewPayload;
      return (
        <OfferCard
          title={model.title}
          state={offerState(cardKind, message.payload)}
          version={typeof o.version === "number" ? o.version : 1}
          forName={clientName}
          lines={[]}
          total={money(o.totalCents, o.currency)}
          validUntil={o.validUntil ? formatTime(o.validUntil, locale) : null}
          copy={kit}
          mine={mine}
          variant={variant}
          onAction={(a) => onAction(a === "request_deposit" ? "request_payment" : a === "send" || a === "resend" ? "create_offer" : "revise_offer", { recordId: o.offerId, recordKind: "offer" })}
        />
      );
    }
    case "payment_request": {
      const pay = p as PaymentRequestPayload;
      const state = paymentState(message.payload);
      return (
        <PaymentCard
          state={state}
          label={model.title}
          amount={money(pay.amountCents, pay.currency)}
          payerName={clientName}
          copy={kit}
          mine={mine}
          variant={variant}
          onAction={(a) => {
            if (a === "copy_link" && pay.paymentLinkCode) {
              onCopyText(`${origin ?? ""}/pay/${encodeURIComponent(String(pay.paymentLinkCode))}`);
              return;
            }
            if (a === "new_link") onAction("request_payment");
            else onAction("open_record", { recordKind: "payment", recordId: String(pay.paymentLinkCode ?? "") });
          }}
        />
      );
    }
    case "basket":
    case "order_confirmation": {
      const b = p as BasketPayload;
      const lines = Array.isArray(b.lines) ? b.lines : [];
      const total = lines.reduce((sum, l) => sum + (typeof l.unitCents === "number" ? l.unitCents : 0) * (typeof l.units === "number" ? l.units : 1), 0);
      const draft = cardKind === "basket";
      const state = readCardState(message.payload);
      return (
        <OrderCard
          mode={draft ? "draft" : "order"}
          title={model.title}
          clientName={clientName}
          version={typeof b.version === "number" ? b.version : null}
          lines={lines.map((l) => ({ label: `${l.label}${l.units > 1 ? ` × ${l.units}` : ""}`, amount: money(l.unitCents * (l.units || 1), b.currency) }))}
          total={money(total, b.currency)}
          pickupLabel={b.promisedAt ? formatTime(b.promisedAt, locale) : null}
          step={draft ? "draft" : state === "paid" ? "paid" : "confirmed"}
          paymentState={draft ? null : state === "paid" ? "paid" : "unpaid"}
          copy={kit}
          mine={mine}
          variant={variant}
          onAction={(a) => onAction(a === "confirm" ? "confirm" : a === "edit" ? "add_items" : "open_record", { recordId: b.orderId, recordKind: "order" })}
        />
      );
    }
    case "professional_times": {
      const t = p as ProfessionalTimesPayload;
      const slots = Array.isArray(t.slots) ? t.slots : [];
      const state = readCardState(message.payload);
      return (
        <TimesCard
          withName={slots[0]?.professionalName ?? model.title}
          clientName={clientName}
          slots={slots.map((s, i) => ({ id: `${message.id}:${i}`, label: formatTime(s.startsAt, locale), picked: state === "selected" && i === 0 }))}
          state={state === "selected" ? "picked" : state === "expired" ? "hold_ended" : state === "paid" ? "confirmed" : "sent"}
          copy={kit}
          variant={variant}
          onAction={(a) => onAction(a === "confirm" ? "confirm" : "send_times")}
        />
      );
    }
    case "appointment_confirmation": {
      const c = p as ConfirmationPayload;
      return (
        <AppointmentCard
          title={model.title}
          clientName={clientName}
          state="confirmed"
          lines={c.when ? [{ label: formatTime(c.when, locale) }] : []}
          copy={kit}
          mine={mine}
          variant={variant}
          onAction={() => onAction("open_record", { recordId: c.recordId, recordKind: c.recordKind })}
        />
      );
    }
    case "change_request":
    case "change_result": {
      const c = p as ChangeRequestPayload;
      const rows = [
        c.oldWhen ? { label: kit.change.from, value: formatTime(c.oldWhen, locale) } : null,
        c.newWhen ? { label: kit.change.to, value: formatTime(c.newWhen, locale) } : null,
      ].filter((r): r is { label: string; value: string } => r !== null);
      return (
        <ChangeRequestCard
          title={model.title}
          mode={cardKind === "change_request" ? "requested" : readCardState(message.payload) === "cancelled" ? "declined" : "applied"}
          clientName={clientName}
          rows={rows.length ? rows : [{ label: model.title, value: model.summary, muted: true }]}
          copy={kit}
          variant={variant}
          onAction={() => onAction("open_record", { recordId: c.recordId, recordKind: c.recordKind })}
        />
      );
    }
    default:
      return (
        <Card category={cardCategoryForKind(cardKind)} label={cardCategoryLabel(cardKind, kit)} title={model.title} mine={mine} variant={variant} testId={cardKind}>
          {model.summary ? <div className="who">{model.summary}</div> : null}
        </Card>
      );
  }
}
