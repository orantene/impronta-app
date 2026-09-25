/**
 * L9: the client-side cards (boards C01/C02), pure and props-driven so the
 * render tests cover every state without a server action in scope.
 *
 *   ChoicesCard        menu_options / service_card / class_card / unpaid tickets_card
 *   ClientTicketsCard  tickets_card once paid/issued (opens /q/<code> when the engine stamped one)
 *   ClientTimesCard    professional_times (pick holds the time, countdown, hold ended)
 *   ClientOfferCard    offer_event / offer_review (accept exact version, ask for a change, decline)
 *   ClientPaymentCard  payment_request (Pay opens /pay/<code>)
 *   ClientConfirmedCard order_confirmation / appointment_confirmation (Ask for a change, Receipt)
 *   ClientChangeCard   change_request / change_result, including cancel + refund sentences
 *   ClientDraftCard    basket (read-only: what the client picked so far)
 *
 * Nothing here reads net, commission, payout, discount or tax: the payload
 * readers in `lib/messages-v5/client-thread-view.ts` never expose them.
 */

import { useState } from "react";

import type { MessagingRefusal } from "@/lib/messaging/types";
import {
  formatClientDate,
  formatSlot,
  holdCountdown,
  money,
  offerCardState,
  offerDepositCents,
  timesSlotOpen,
  timesState,
  type ChangeView,
  type ChoicesView,
  type ClientOfferSummary,
  type ConfirmationView,
  type PaymentView,
  type TicketsView,
  type TimesView,
} from "@/lib/messages-v5/client-thread-view";

import { Card, CardLine, CardTotal } from "../kit/Card";
import { fill, type KitCopy } from "../kit/copy";
import { Btn, Icon, Pill } from "../kit/primitives";
import { OkLine, RefusalLine } from "../kit/RefusalLine";
import type { ClientCopy } from "./copy";

export type CardPhase = "idle" | "busy" | "done" | "refused";

type Common = {
  readonly copy: ClientCopy;
  readonly kit: KitCopy;
  readonly business: string;
  readonly locale: string;
  readonly phase?: CardPhase;
  readonly refusal?: MessagingRefusal | null;
};

/* ---------- choices ---------- */

export function ChoicesCard({ view, copy, kit, business, phase = "idle", refusal, onSend }: Common & { readonly view: ChoicesView; readonly onSend?: (ids: readonly string[]) => void }) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const alreadySent = view.chosenIds.length > 0;
  const closed = phase === "done" || alreadySent;
  const toggle = (id: string) => {
    if (closed || phase === "busy") return;
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : view.multiple ? [...prev, id] : [id]));
  };
  const foot = closed ? fill(copy.choices.sentBody, { business }) : view.options.length === 0 ? copy.choices.noOptions : fill(copy.choices.chosenCount, { count: picked.length });
  return (
    <Card category="offer" label={copy.choices.cat} title={view.title ?? copy.choices.title} variant="mobile" testId="choices" busy={phase === "busy"}
      pills={closed ? <Pill tone="won">{copy.choices.sentTitle}</Pill> : null}
      foot={foot}
      actions={!closed && onSend ? (
        <Btn size="sm" variant="primary" busy={phase === "busy"} disabled={picked.length === 0} onClick={() => onSend(picked)} data-client-action="send_choice">
          {phase === "busy" ? copy.choices.sending : copy.choices.send}
        </Btn>
      ) : null}
    >
      {view.options.map((o) => {
        const on = closed ? view.chosenIds.includes(o.id) : picked.includes(o.id);
        return (
          <button key={o.id} type="button" className={`cx-pick${on ? " on" : ""}${!view.multiple ? " rad" : ""}${closed && !on ? " off" : ""}`} role={view.multiple ? "checkbox" : "radio"} aria-checked={on} disabled={closed || phase === "busy"} onClick={() => toggle(o.id)} data-choice={o.id}>
            <span className="tx">
              <b>{o.label}</b>
            </span>
            {o.priceCents != null ? <span className="amt">{money(o.priceCents, view.currency)}</span> : null}
            <span className="chk" aria-hidden="true">{on ? <Icon name="check" size={14} /> : null}</span>
          </button>
        );
      })}
      {!closed ? <CardLine muted label={fill(copy.choices.hint, { business })} /> : null}
      {phase === "refused" && refusal ? <div className="cx-inline"><RefusalLine code={refusal} copy={kit} variant="mobile" /></div> : null}
    </Card>
  );
}

/* ---------- tickets (paid / issued) ---------- */

export function ClientTicketsCard({ view, copy, business, onOpen }: Omit<Common, "kit" | "locale"> & { readonly view: TicketsView; readonly onOpen?: (code: string) => void }) {
  const cancelled = view.state === "cancelled";
  const pill = cancelled ? <Pill tone="lost">{copy.tickets.cancelledPill}</Pill> : <Pill tone="money">{copy.tickets.issued}</Pill>;
  const foot = cancelled
    ? copy.tickets.cancelled
    : view.ticketCode
      ? copy.tickets.openHint
      : fill(copy.tickets.waitingCode, { business });
  return (
    <Card category="ticket" label={copy.tickets.cat} title={view.title ?? copy.tickets.title} variant="mobile" testId="client-tickets"
      pills={pill}
      foot={foot}
      actions={!cancelled && view.ticketCode && onOpen ? (
        <Btn size="sm" variant="primary" onClick={() => onOpen(view.ticketCode as string)} data-client-action="open_ticket">
          {copy.tickets.open}
        </Btn>
      ) : null}
    >
      {view.tiers.map((t) => (
        <CardLine key={t.id} label={t.label} amount={t.priceCents != null ? money(t.priceCents, view.currency) : undefined} />
      ))}
    </Card>
  );
}

/* ---------- times ---------- */

export function ClientTimesCard({ view, copy, kit, business, locale, now, phase = "idle", refusal, onPick, onAsk, startReopened = false }: Common & { readonly view: TimesView; readonly now: Date; readonly onPick?: (startsAt: string) => void; readonly onAsk?: (text: string) => void; readonly startReopened?: boolean }) {
  const state = timesState(view, now);
  const [reopened, setReopened] = useState(startReopened);
  const left = holdCountdown(view.holdExpiresAt, now);
  const pickedLabel = view.pickedStartsAt ? formatSlot(view.pickedStartsAt, locale, view.timezone) : "";
  const pill = state === "picked" ? <Pill tone="opp">{copy.times.holding}</Pill> : state === "hold_ended" ? <Pill tone="lost">{kit.card.state.expired}</Pill> : null;
  const foot =
    state === "picked"
      ? left
        ? fill(copy.times.held, { slot: pickedLabel, left })
        : fill(copy.times.heldNoClock, { slot: pickedLabel })
      : state === "hold_ended"
        ? fill(copy.times.holdEnded, { business })
        : view.slots.length === 0
          ? copy.times.noSlots
          : fill(copy.times.hint, { business });
  const hasFree = view.slots.some((s) => timesSlotOpen("hold_ended", s.startsAt, now, true));
  const endedActions = state === "hold_ended" ? (
    <>
      <Btn size="sm" variant="primary" disabled={!hasFree} onClick={() => setReopened(true)} data-client-action="pick_another_time">{copy.times.pickAnother}</Btn>
      {onAsk ? <Btn size="sm" onClick={() => onAsk(copy.times.askPrefill)} data-client-action="ask_hold">{copy.times.ask}</Btn> : null}
    </>
  ) : null;
  return (
    <Card category="appt" label={copy.times.cat} title={view.professionalName ? fill(copy.times.titleWith, { name: view.professionalName }) : copy.times.title} variant="mobile" testId="client-times" busy={phase === "busy"} pills={pill} foot={foot} actions={endedActions}>
      {view.slots.map((s) => {
        const on = view.pickedStartsAt === s.startsAt && state === "picked";
        const open = phase !== "busy" && !!onPick && timesSlotOpen(state, s.startsAt, now, reopened);
        return (
          <button key={s.startsAt} type="button" className={`cx-pick rad${on ? " on" : ""}${!open && !on ? " off" : ""}`} role="radio" aria-checked={on} disabled={!open} onClick={() => onPick?.(s.startsAt)} data-slot={s.startsAt}>
            <span className="tx">
              <b>{formatSlot(s.startsAt, locale, view.timezone)}</b>
            </span>
            <span className="chk" aria-hidden="true">{on ? <Icon name="check" size={14} /> : null}</span>
          </button>
        );
      })}
      {phase === "refused" && refusal ? (
        <div className="cx-inline">
          <RefusalLine code={refusal} copy={kit} variant="mobile" />
          {refusal === "unavailable" || refusal === "hold_ended" ? <CardLine muted label={fill(copy.times.taken, { business })} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

/* ---------- offer ---------- */

export type OfferMode = "view" | "change" | "decline";

export function ClientOfferCard({ offer, copy, kit, business, locale, now, phase = "idle", refusal, payCode, onAccept, onDecline, onChange, onPay }: Common & {
  readonly offer: ClientOfferSummary;
  readonly now: Date;
  readonly payCode?: string | null;
  readonly onAccept?: (offer: ClientOfferSummary) => void;
  readonly onDecline?: (offer: ClientOfferSummary, reason: string) => void;
  readonly onChange?: (offer: ClientOfferSummary, text: string) => void;
  readonly onPay?: (code: string) => void;
}) {
  const [mode, setMode] = useState<OfferMode>("view");
  const [text, setText] = useState("");
  const state = offerCardState(offer, now);
  const deposit = offerDepositCents(offer);
  const busy = phase === "busy";
  const pill =
    state === "accepted" ? <Pill tone="won">{copy.offer.accepted}</Pill> : state === "declined" ? <Pill tone="lost">{copy.offer.declined}</Pill> : state === "expired" ? <Pill tone="lost">{kit.card.state.expired}</Pill> : <Pill tone="opp">{fill(copy.offer.version, { version: offer.version })}</Pill>;
  const refundLine = offer.refundPolicy && offer.refundPolicy in copy.offer.refund ? fill(copy.offer.refund[offer.refundPolicy as keyof typeof copy.offer.refund], { business }) : null;
  const depositLabel = [offer.depositPct != null && offer.depositPct > 0 ? fill(copy.offer.depositPct, { pct: offer.depositPct }) : copy.offer.depositLine, refundLine].filter(Boolean).join(" · ");

  const foot =
    state === "accepted"
      ? payCode
        ? copy.offer.acceptedPayNext
        : fill(copy.offer.acceptedPayLater, { business })
      : state === "expired"
        ? offer.status === "superseded"
          ? copy.offer.superseded
          : fill(copy.offer.expired, { business })
        : offer.validUntil
          ? fill(copy.offer.validUntil, { date: formatClientDate(offer.validUntil, locale) })
          : null;

  let actions: React.ReactNode = null;
  if (state === "sent" && mode === "view") {
    actions = (
      <>
        {onAccept ? (
          <Btn size="xl" variant="primary" fill busy={busy} onClick={() => onAccept(offer)} data-client-action="accept_offer">
            {busy ? copy.offer.accepting : deposit != null ? fill(copy.offer.acceptPay, { amount: money(deposit, offer.currency) }) : copy.offer.accept}
          </Btn>
        ) : null}
        <div className="cx-row">
          <Btn size="sm" disabled={busy} onClick={() => setMode("change")} data-client-action="ask_change">{copy.offer.askChange}</Btn>
          <Btn size="sm" disabled={busy} onClick={() => setMode("decline")} data-client-action="decline_offer">{copy.offer.decline}</Btn>
        </div>
      </>
    );
  } else if (state === "sent" && mode === "change") {
    actions = (
      <div className="cx-form" data-client-form="change">
        <label htmlFor={`cx-change-${offer.id}`}>{fill(copy.change.prompt, { business })}</label>
        <textarea id={`cx-change-${offer.id}`} value={text} placeholder={copy.change.placeholder} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <div className="cx-row">
          <Btn size="sm" disabled={busy} onClick={() => { setMode("view"); setText(""); }}>{copy.change.cancel}</Btn>
          <Btn size="sm" variant="primary" busy={busy} disabled={text.trim().length === 0} onClick={() => onChange?.(offer, text.trim())} data-client-action="send_change">{busy ? copy.change.sending : copy.change.send}</Btn>
        </div>
      </div>
    );
  } else if (state === "sent" && mode === "decline") {
    actions = (
      <div className="cx-form" data-client-form="decline">
        <label htmlFor={`cx-decline-${offer.id}`}>{fill(copy.decline.prompt, { business })}</label>
        <textarea id={`cx-decline-${offer.id}`} value={text} placeholder={copy.decline.placeholder} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <div className="cx-row">
          <Btn size="sm" disabled={busy} onClick={() => { setMode("view"); setText(""); }}>{copy.decline.cancel}</Btn>
          <Btn size="sm" variant="danger" busy={busy} onClick={() => onDecline?.(offer, text.trim())} data-client-action="confirm_decline">{busy ? copy.decline.declining : copy.decline.confirm}</Btn>
        </div>
      </div>
    );
  } else if (state === "accepted" && payCode && onPay) {
    actions = (
      <Btn size="xl" variant="primary" fill onClick={() => onPay(payCode)} data-client-action="pay">
        {fill(copy.pay.pay, { amount: deposit != null ? money(deposit, offer.currency) : money(offer.totalCents, offer.currency) })}
      </Btn>
    );
  }

  return (
    <Card category="offer" label={copy.offer.cat} title={copy.offer.title} variant="mobile" testId="client-offer" busy={busy} pills={pill} foot={foot} actions={actions ? <div className="cx-stack">{actions}</div> : null}>
      {offer.lines.map((l, i) => (
        <CardLine key={i} label={l.units > 1 ? `${l.label} ${fill(copy.offer.unitsSuffix, { units: l.units })}` : l.label} amount={money(l.amountCents, offer.currency)} />
      ))}
      <CardTotal label={copy.offer.total} amount={money(offer.totalCents, offer.currency)} />
      {deposit != null ? <CardLine muted label={depositLabel} amount={money(deposit, offer.currency)} /> : null}
      {offer.noteToClient ? <CardLine muted label={`${fill(copy.offer.note, { business })}: ${offer.noteToClient}`} /> : null}
      {phase === "refused" && refusal ? <div className="cx-inline"><RefusalLine code={refusal} copy={kit} variant="mobile" /></div> : null}
      {phase === "done" && state === "accepted" ? <div className="cx-inline"><OkLine text={copy.offer.accepted} variant="mobile" /></div> : null}
    </Card>
  );
}

/* ---------- payment ---------- */

export function ClientPaymentCard({ view, copy, business, locale, now, onPay }: Omit<Common, "kit"> & { readonly view: PaymentView; readonly now: Date; readonly onPay?: (code: string) => void }) {
  const paid = view.state === "paid";
  const cancelled = view.state === "cancelled";
  const expired = view.state === "expired" || (view.expiresAt ? Date.parse(view.expiresAt) < now.getTime() : false);
  const closed = cancelled || expired;
  const kind = view.amountKind === "deposit" ? copy.pay.deposit : copy.pay.full;
  const amount = view.amountCents != null ? money(view.amountCents, view.currency) : "";
  // Front-door v27 Paid: total / paid / due / method only when the shell stamped
  // them. Never invent amounts.
  const hasMoney =
    paid &&
    typeof view.totalCents === "number" &&
    typeof view.paidCents === "number" &&
    typeof view.dueCents === "number";
  const methodLabel =
    view.method === "cash"
      ? copy.pay.methodCash
      : view.method === "transfer" || view.method === "wire"
        ? copy.pay.methodTransfer
        : view.method === "card" || view.method === "stripe" || view.method === "link"
          ? view.amountKind === "deposit"
            ? copy.pay.methodCardDeposit
            : copy.pay.methodCard
          : null;
  const paidFoot =
    hasMoney && view.dueCents! > 0
      ? fill(copy.pay.paidBalanceDue, {
          paid: money(view.paidCents, view.currency),
          due: money(view.dueCents, view.currency),
        })
      : hasMoney
        ? fill(copy.pay.paidInFull, { paid: money(view.paidCents, view.currency) })
        : null;
  return (
    <Card category="pay" label={copy.pay.cat} title={copy.pay.title} variant="mobile" testId="client-pay"
      pills={
        paid ? (
          <>
            <Pill tone="won">{copy.pay.paid}</Pill>
            {methodLabel ? <Pill tone="money">{methodLabel}</Pill> : null}
          </>
        ) : cancelled ? (
          <Pill tone="lost">{copy.pay.cancelledPill}</Pill>
        ) : expired ? (
          <Pill tone="lost">{copy.pay.expired.split(".")[0]}</Pill>
        ) : null
      }
      foot={
        paid
          ? paidFoot
          : cancelled
            ? fill(copy.pay.cancelled, { business })
            : expired
              ? fill(copy.pay.expired, { business })
              : view.expiresAt
                ? fill(copy.pay.expiresAt, { date: formatClientDate(view.expiresAt, locale) })
                : copy.pay.keepSlot
      }
      actions={!paid && !closed && view.code && onPay ? (
        <Btn size="sm" variant="primary" onClick={() => onPay(view.code as string)} data-client-action="pay">{fill(copy.pay.pay, { amount })}</Btn>
      ) : null}
    >
      {hasMoney ? (
        <>
          <CardLine label={copy.pay.total} amount={money(view.totalCents, view.currency)} />
          <CardLine label={copy.pay.paidAmount} amount={money(view.paidCents, view.currency)} />
          {view.dueCents! > 0 ? <CardLine label={copy.pay.balanceDue} amount={money(view.dueCents, view.currency)} /> : null}
        </>
      ) : (
        <CardLine label={kind} amount={amount} />
      )}
    </Card>
  );
}

/* ---------- confirmation ---------- */

export function ClientConfirmedCard({ view, kind, copy, business, locale, phase = "idle", onChange }: Omit<Common, "kit"> & { readonly view: ConfirmationView; readonly kind: "order_confirmation" | "appointment_confirmation"; readonly onChange?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const busy = phase === "busy";
  const order = kind === "order_confirmation";
  return (
    <Card category={order ? "order" : "appt"} label={order ? copy.confirmed.catOrder : copy.confirmed.catBooking} title={view.title ?? view.summary ?? (order ? copy.confirmed.catOrder : copy.confirmed.catBooking)} variant="mobile" testId="client-confirmed"
      pills={<Pill tone="money">{copy.confirmed.pill}</Pill>}
      actions={
        <div className="cx-stack">
          {open ? (
            <div className="cx-form" data-client-form="change">
              <label htmlFor={`cx-cchange-${view.recordId ?? "r"}`}>{fill(copy.change.prompt, { business })}</label>
              <textarea id={`cx-cchange-${view.recordId ?? "r"}`} value={text} placeholder={copy.change.placeholder} onChange={(e) => setText(e.target.value)} disabled={busy} />
              <div className="cx-row">
                <Btn size="sm" disabled={busy} onClick={() => { setOpen(false); setText(""); }}>{copy.change.cancel}</Btn>
                <Btn size="sm" variant="primary" busy={busy} disabled={text.trim().length === 0} onClick={() => onChange?.(text.trim())} data-client-action="send_change">{busy ? copy.change.sending : copy.change.send}</Btn>
              </div>
            </div>
          ) : (
            <div className="cx-row">
              {onChange ? <Btn size="sm" icon="refresh" onClick={() => setOpen(true)} data-client-action="ask_change">{copy.confirmed.askChange}</Btn> : null}
              <Btn size="sm" icon="file" disabled title={copy.confirmed.receiptSoon} data-client-action="receipt">{copy.confirmed.receipt}</Btn>
            </div>
          )}
        </div>
      }
    >
      {view.when ? <CardLine label={copy.confirmed.when} amount={formatSlot(view.when, locale)} /> : null}
      {view.lines.map((l, i) => (
        <CardLine key={i} label={l.units > 1 ? `${l.label} × ${l.units}` : l.label} amount={money(l.amountCents, view.currency)} />
      ))}
      {view.summary && view.title ? <CardLine muted label={view.summary} /> : null}
    </Card>
  );
}

/* ---------- change request / result (read-only) ---------- */

export function ClientChangeCard({ view, copy, business }: { readonly view: ChangeView; readonly copy: ClientCopy; readonly business: string }) {
  const cancelled = view.state === "cancelled";
  const refunded = cancelled && view.refundedCents != null && view.refundedCents > 0;
  const refundOnly = cancelled && !/cancelled/i.test(view.body ?? "") && refunded;
  const pill = cancelled
    ? <Pill tone="lost">{copy.cancel.pill}</Pill>
    : view.state === "applied"
      ? <Pill tone="won">{copy.change.applied}</Pill>
      : view.state === "failed"
        ? <Pill tone="lost">{view.body || copy.pay.cancelled}</Pill>
        : view.state === "declined"
          ? <Pill tone="lost">{copy.change.declined}</Pill>
          : <Pill tone="due">{copy.change.sent}</Pill>;
  const body = cancelled
    ? refundOnly
      ? fill(copy.cancel.refundOnly, { amount: money(view.refundedCents, view.currency) })
      : refunded
        ? fill(copy.cancel.refunded, { amount: money(view.refundedCents, view.currency) })
        : copy.cancel.noRefund
    : view.state === "applied"
      ? copy.change.appliedBody
      : view.state === "failed"
        ? view.body || copy.pay.cancelled
        : view.state === "declined"
          ? fill(copy.change.declinedBody, { business })
          : fill(copy.change.sentBody, { business });
  return (
    <Card category="change" label={cancelled ? copy.cancel.cat : copy.change.cat} title={view.title ?? view.body ?? (cancelled ? copy.cancel.title : copy.change.title)} variant="mobile" testId={cancelled ? "client-cancel" : "client-change"} pills={pill}>
      {view.title && view.body && !cancelled ? <CardLine label={view.body} /> : null}
      <CardLine muted label={body} />
    </Card>
  );
}

/* ---------- shared draft (read-only) ---------- */

export function ClientDraftCard({ lines, currency, copy, business }: { readonly lines: readonly { readonly label: string; readonly units: number; readonly unitCents: number }[]; readonly currency: string; readonly copy: ClientCopy; readonly business: string }) {
  const total = lines.reduce((sum, l) => sum + l.unitCents * (l.units || 1), 0);
  return (
    <Card category="order" label={copy.draft.cat} title={copy.draft.title} variant="mobile" testId="client-draft" foot={fill(copy.draft.hint, { business })}>
      {lines.map((l, i) => (
        <CardLine key={i} label={l.units > 1 ? `${l.label} × ${l.units}` : l.label} amount={money(l.unitCents * (l.units || 1), currency)} />
      ))}
      <CardTotal label={copy.offer.total} amount={money(total, currency)} />
    </Card>
  );
}
