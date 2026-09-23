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

import { readCardState, renderCard, type BasketPayload, type ChangeRequestPayload, type ConfirmationPayload, type OfferReviewPayload, type OfferStatePayload, type PaymentRequestPayload, type ProfessionalTimesPayload, type ServiceCardPayload, type TicketsCardPayload } from "@/lib/messaging/cards";
import type { CardKind, ThreadMessage } from "@/lib/messaging/types";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { formatSlot } from "@/lib/messages-v5/client-thread-view";
import { formatHoldCountdown, holdCountdown, ladderFor } from "@/lib/messages-v5/record-cards";

import { AppointmentCard } from "../kit/AppointmentCard";
import { Card, cardCategoryForKind, cardCategoryLabel } from "../kit/Card";
import { ChangeRequestCard } from "../kit/ChangeRequestCard";
import { OfferCard, type OfferCardState } from "../kit/OfferCard";
import { OrderCard } from "../kit/OrderCard";
import { PaymentCard, type PaymentCardState } from "../kit/PaymentCard";
import { TableCard } from "../kit/TableCard";
import { TicketsCard } from "../kit/TicketsCard";
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
  /** Injectable for tests; defaults to `new Date()` for hold countdowns. */
  readonly now?: Date;
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

function strTz(payload: Record<string, unknown> | null): string | null {
  const tz = payload && typeof payload.timezone === "string" ? payload.timezone.trim() : "";
  return tz || null;
}

export function ThreadCard({ message, cardKind, clientName, copy, variant, locale = "en", onAction, onCopyText, origin, now }: ThreadCardProps) {
  const kit = copy.kit;
  const model = renderCard(cardKind, message.payload, "operator");
  const p = message.payload ?? {};
  const mine = message.senderUserId !== null;
  const clock = now ?? new Date();

  switch (cardKind) {
    case "offer_review":
    case "offer_state": {
      const o = p as OfferReviewPayload & { offer_id?: string; total_label?: string; status?: string };
      const offerId = o.offerId ?? o.offer_id ?? "";
      const legacyCents = typeof o.total_label === "string" ? Math.round(Number.parseFloat(o.total_label) * 100) : Number.NaN;
      const totalCents = typeof o.totalCents === "number" ? o.totalCents : Number.isFinite(legacyCents) ? legacyCents : null;
      return (
        <OfferCard
          title={model.title}
          state={offerState(cardKind, message.kind === "offer_event" ? { ...p, state: o.status === "accepted" ? "selected" : o.status ?? "sent" } : message.payload)}
          version={typeof o.version === "number" ? o.version : 1}
          forName={clientName}
          lines={[]}
          total={totalCents === null ? "" : money(totalCents, o.currency ?? "USD")}
          validUntil={o.validUntil ? formatTime(o.validUntil, locale) : null}
          copy={kit}
          mine={mine}
          variant={variant}
          onAction={(a) => onAction(a === "request_deposit" ? "request_payment" : a === "send" || a === "resend" ? "create_offer" : "revise_offer", { recordId: offerId, recordKind: "offer" })}
        />
      );
    }
    case "payment_request": {
      const pay = p as PaymentRequestPayload;
      const state = paymentState(message.payload);
      const msLeft = pay.expiresAt ? new Date(pay.expiresAt).getTime() - clock.getTime() : Number.NaN;
      const hoursLeft = Number.isFinite(msLeft) ? Math.max(0, Math.ceil(msLeft / 3_600_000)) : null;
      return (
        <PaymentCard
          state={state}
          label={model.title}
          amount={money(pay.amountCents, pay.currency)}
          payerName={clientName}
          hoursLeft={hoursLeft}
          expiredOn={pay.expiresAt ? formatTime(pay.expiresAt, locale) : null}
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
      // `TimesCard`'s own "{name} picked {slot} · held {minutes} min · {left}
      // left" template supplies the trailing "left" word, so this slot takes
      // the bare minutes count, not `formatHoldCountdown`'s full sentence.
      const countdown = holdCountdown(t.holdExpiresAt, clock);
      const holdLeft = countdown ? (countdown.ended ? kit.times.holdEnded : String(countdown.minutesLeft)) : null;
      return (
        <TimesCard
          withName={slots[0]?.professionalName ?? model.title}
          clientName={clientName}
          slots={slots.map((s, i) => ({ id: `${message.id}:${i}`, label: formatSlot(s.startsAt, locale, t.timezone), picked: state === "selected" && i === 0 }))}
          state={state === "selected" ? "picked" : state === "expired" ? "hold_ended" : state === "paid" ? "confirmed" : "sent"}
          holdLeft={state === "selected" ? holdLeft : null}
          copy={{ ...kit, times: { ...kit.times, offerNew: kit.times.seeAlternatives } }}
          variant={variant}
          onAction={(a) => onAction(a === "confirm" ? "confirm" : "send_times")}
        />
      );
    }
    case "service_card": {
      const s = p as ServiceCardPayload;
      if (s.variant === "table") {
        const first = Array.isArray(s.tables) ? s.tables[0] : null;
        const state = readCardState(message.payload);
        const chip = { paymentState: state === "paid" ? "paid" : null, fulfilmentState: state === "selected" ? "confirmed" : state === "cancelled" ? "cancelled" : null };
        const step = state === "cancelled" ? "closed" : state === "selected" || state === "paid" ? "confirmed" : "held";
        const holdLeft = formatHoldCountdown(holdCountdown(s.holdExpiresAt, clock), { minutesLeft: kit.times.holdLeft, ended: kit.table.holdEnded });
        return (
          <TableCard
            clientName={clientName}
            partySize={first?.partySize ?? null}
            whenLabel={first ? formatSlot(first.startsAt, locale, strTz(p)) : null}
            tableLabel={first?.label ?? null}
            ladder={ladderFor("reservation", chip, kit.ladder)}
            step={step}
            holdLeftLabel={step === "held" ? holdLeft : null}
            copy={kit}
            variant={variant}
            onAction={(a) => onAction(a === "confirm" ? "confirm" : "open_record", { recordKind: "reservation" })}
          />
        );
      }
      return (
        <Card category={cardCategoryForKind(cardKind)} label={cardCategoryLabel(cardKind, kit)} title={model.title} mine={mine} variant={variant} testId={cardKind}>
          {model.summary ? <div className="who">{model.summary}</div> : null}
        </Card>
      );
    }
    case "tickets_card": {
      const tk = p as TicketsCardPayload;
      const tiers = Array.isArray(tk.tiers) ? tk.tiers : [];
      const state = readCardState(message.payload);
      const fulfilmentState = state === "selected" ? "checked_in" : state === "cancelled" ? null : state === "paid" ? "confirmed" : null;
      const chip = { paymentState: state === "paid" || state === "selected" ? "paid" : null, fulfilmentState };
      const step = fulfilmentState === "checked_in" ? "checked_in" : chip.paymentState === "paid" ? "issued" : "paid";
      const holdLeft = formatHoldCountdown(holdCountdown(tk.holdExpiresAt, clock), { minutesLeft: kit.times.holdLeft, ended: kit.table.holdEnded });
      return (
        <TicketsCard
          title={tk.title ?? model.title}
          clientName={clientName}
          tiers={tiers.map((t) => ({ label: t.label, quantity: 1, priceCents: t.priceCents }))}
          ladder={ladderFor("tickets", chip, kit.ladder)}
          step={step}
          holdLeftLabel={step === "paid" ? holdLeft : null}
          checkedIn={tk.checkedIn ?? null}
          total={tk.capacity ?? null}
          copy={kit}
          variant={variant}
          onAction={(a) => onAction(a === "request_payment" ? "request_payment" : "open_record", { recordKind: "tickets" })}
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
          lines={c.when ? [{ label: formatSlot(c.when, locale, strTz(p)) }] : []}
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
        c.oldWhen ? { label: kit.change.from, value: formatSlot(c.oldWhen, locale, strTz(p)) } : null,
        c.newWhen ? { label: kit.change.to, value: formatSlot(c.newWhen, locale, strTz(p)) } : null,
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
