import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import { readChange, readChoices, readConfirmation, readPayment, readTickets, readTimes } from "@/lib/messages-v5/client-thread-view";

import { ChoicesCard, ClientChangeCard, ClientConfirmedCard, ClientDraftCard, ClientOfferCard, ClientPaymentCard, ClientTicketsCard, ClientTimesCard } from "./ClientCards";
import { EN_CLIENT, EN_KIT, ES_CLIENT } from "./test-copy";

const now = new Date("2026-09-17T10:00:00.000Z");
const base = { copy: EN_CLIENT, kit: EN_KIT, business: "Impronta", locale: "en" };

/* ---------- choices ---------- */

const menu = readChoices("menu_options", { title: "Tonight's menu", offeringIds: ["a", "b"], labels: ["Taco al pastor", "Burrito"], pricesCents: [900, 1200], currency: "USD" });

test("choices: idle lists options with prices, Send my choice disabled until a pick, hint names the business", () => {
  const html = renderToStaticMarkup(<ChoicesCard {...base} view={menu} onSend={() => {}} />);
  assert.match(html, /class="cat">Choose</);
  assert.match(html, /Tonight&#x27;s menu/);
  assert.match(html, /data-choice="a"[^>]*>/);
  assert.match(html, /Taco al pastor/);
  assert.match(html, /\$9\.00/);
  assert.match(html, /role="checkbox"/);
  assert.match(html, /Impronta confirms price and availability before anything is booked/);
  assert.match(html, /disabled=""[^>]*data-client-action="send_choice"/);
  assert.match(html, /0 chosen/);
});

test("choices: busy shows Sending; already sent shows the chosen option on, others off, no button; refused shows the sentence", () => {
  const busy = renderToStaticMarkup(<ChoicesCard {...base} view={menu} phase="busy" onSend={() => {}} />);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, />Sending</);
  const sent = renderToStaticMarkup(<ChoicesCard {...base} view={{ ...menu, chosenIds: ["b"] }} onSend={() => {}} />);
  assert.match(sent, /Choice sent/);
  assert.match(sent, /cx-pick on"[^>]*aria-checked="true"[^>]*data-choice="b"/);
  assert.match(sent, /cx-pick off"[^>]*data-choice="a"/);
  assert.doesNotMatch(sent, /data-client-action="send_choice"/);
  assert.match(sent, /Impronta will confirm before anything is booked/);
  const refused = renderToStaticMarkup(<ChoicesCard {...base} view={menu} phase="refused" refusal="expired" onSend={() => {}} />);
  assert.match(refused, /data-refusal="expired"/);
  assert.match(refused, /This link or offer has expired\./);
  const empty = renderToStaticMarkup(<ChoicesCard {...base} view={{ ...menu, options: [] }} onSend={() => {}} />);
  assert.match(empty, /No options to pick from\./);
});

test("choices: single-pick kinds render radios; ES copy", () => {
  const service = readChoices("service_card", { offeringIds: ["s"], labels: ["Balayage"], pricesCents: [12000] });
  const html = renderToStaticMarkup(<ChoicesCard {...base} copy={ES_CLIENT} view={service} onSend={() => {}} />);
  assert.match(html, /role="radio"/);
  assert.match(html, /Enviar mi elección/);
});

/* ---------- times ---------- */

const times = readTimes({ slots: [{ startsAt: "2026-09-20T15:00:00.000Z", professionalName: "Dani" }, { startsAt: "2026-09-20T17:00:00.000Z", professionalName: "Dani" }], timezone: "UTC" });

test("times: sent lets the client pick; picked shows the hold countdown and blocks other slots; hold ended reads the sentence; refused slot_taken adds the alternatives line", () => {
  const sent = renderToStaticMarkup(<ClientTimesCard {...base} view={times} now={now} onPick={() => {}} />);
  assert.match(sent, /Pick a time with Dani/);
  assert.match(sent, /data-slot="2026-09-20T15:00:00.000Z"/);
  assert.match(sent, /holds the time for 15 minutes while Impronta confirms/);
  const picked = renderToStaticMarkup(<ClientTimesCard {...base} view={{ ...times, pickedStartsAt: "2026-09-20T15:00:00.000Z", holdExpiresAt: "2026-09-17T10:12:41.000Z" }} now={now} onPick={() => {}} />);
  assert.match(picked, />Holding</);
  assert.match(picked, /is held for you · 12:41 left/);
  assert.match(picked, /cx-pick rad on"[^>]*aria-checked="true"[^>]*disabled/);
  assert.match(picked, /cx-pick rad off"[^>]*disabled/);
  const endedView = { ...times, slots: [...times.slots, { startsAt: "2026-09-17T09:00:00.000Z" }], pickedStartsAt: "2026-09-20T15:00:00.000Z", holdExpiresAt: "2026-09-17T09:00:00.000Z" };
  const ended = renderToStaticMarkup(<ClientTimesCard {...base} view={endedView} now={now} onPick={() => {}} onAsk={() => {}} />);
  assert.match(ended, /The hold ended\. Pick another time, or write to Impronta\./);
  assert.match(ended, />Expired</);
  assert.match(ended, /data-client-action="pick_another_time"/);
  assert.match(ended, /data-client-action="ask_hold"/);
  assert.match(ended, /Pick another time/);
  const slotTag = (html: string, iso: string) => {
    const tag = html.match(new RegExp(`<button[^>]*data-slot="${iso}"[^>]*>`));
    assert.ok(tag, iso);
    return tag[1] ? tag[0] : tag[0];
  };
  assert.match(slotTag(ended, "2026-09-20T15:00:00.000Z"), /disabled/);
  const reopened = renderToStaticMarkup(<ClientTimesCard {...base} view={endedView} now={now} onPick={() => {}} onAsk={() => {}} startReopened />);
  assert.doesNotMatch(slotTag(reopened, "2026-09-20T15:00:00.000Z"), /disabled/);
  assert.match(slotTag(reopened, "2026-09-17T09:00:00.000Z"), /disabled/);
  const refused = renderToStaticMarkup(<ClientTimesCard {...base} view={times} now={now} phase="refused" refusal="unavailable" onPick={() => {}} />);
  assert.match(refused, /data-refusal="unavailable"/);
  assert.match(refused, /That time was just taken\. Pick another, or write to Impronta\./);
  assert.doesNotMatch(refused, /data-next-free=/);
  const refusedWithFree = renderToStaticMarkup(
    <ClientTimesCard
      {...base}
      view={times}
      now={now}
      phase="refused"
      refusal="unavailable"
      nextFreeTimes={["2026-09-20T16:30:00.000Z", "2026-09-20T18:00:00.000Z"]}
      onPick={() => {}}
    />,
  );
  assert.match(refusedWithFree, /data-slot-taken="1"/);
  assert.match(refusedWithFree, /data-next-free-times=/);
  assert.match(refusedWithFree, /data-next-free="2026-09-20T16:30:00.000Z"/);
  assert.match(refusedWithFree, /data-next-free="2026-09-20T18:00:00.000Z"/);
  assert.match(refusedWithFree, /Next free times/);
  // Empty engine list must not invent a clock time button.
  const refusedEmptyFree = renderToStaticMarkup(
    <ClientTimesCard {...base} view={times} now={now} phase="refused" refusal="unavailable" nextFreeTimes={[]} onPick={() => {}} />,
  );
  assert.doesNotMatch(refusedEmptyFree, /data-next-free=/);
  const empty = renderToStaticMarkup(<ClientTimesCard {...base} view={{ ...times, slots: [] }} now={now} onPick={() => {}} />);
  assert.match(empty, /No times to pick yet\./);
});

/* ---------- offer ---------- */

const offer: ClientOfferSummary = {
  id: "of1",
  version: 3,
  status: "sent",
  totalCents: 380000,
  currency: "USD",
  depositPct: 30,
  depositCents: null,
  refundPolicy: "flexible",
  validUntil: "2026-09-30T00:00:00.000Z",
  noteToClient: "Travel included.",
  lines: [
    { label: "Sofía Herrera · hostess", units: 2, amountCents: 140000 },
    { label: "Gala Duo package", units: 1, amountCents: 100000 },
  ],
};

test("offer sent: lines, total, deposit and refund rule, validity, version pill, Accept and pay deposit · $1,140.00, Ask for a change, Decline; never a net or commission word", () => {
  const html = renderToStaticMarkup(<ClientOfferCard {...base} offer={offer} now={now} onAccept={() => {}} onDecline={() => {}} onChange={() => {}} />);
  assert.match(html, /class="cat">Offer</);
  assert.match(html, />v3</);
  assert.match(html, /Sofía Herrera · hostess × 2/);
  assert.match(html, /\$1,400\.00/);
  assert.match(html, /Total<\/span><span>\$3,800\.00/);
  assert.match(html, /Deposit 30% to confirm · balance on the day · fully refundable until close to the date/);
  assert.match(html, /\$1,140\.00/);
  assert.match(html, /Valid until/);
  assert.match(html, /Note from Impronta: Travel included\./);
  assert.match(html, /data-client-action="accept_offer"[^>]*>Accept and pay deposit · \$1,140\.00/);
  assert.match(html, /data-client-action="ask_change"/);
  assert.match(html, /data-client-action="decline_offer"/);
  assert.doesNotMatch(html, /net|commission|payout|talent cost|discount|tax/i);
});

test("offer: no deposit rule reads Accept this offer; busy reads Accepting; refused shows the sentence", () => {
  const plain = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, depositPct: null }} now={now} onAccept={() => {}} />);
  assert.match(plain, />Accept this offer</);
  assert.doesNotMatch(plain, /Deposit/);
  const busy = renderToStaticMarkup(<ClientOfferCard {...base} offer={offer} now={now} phase="busy" onAccept={() => {}} />);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, />Accepting</);
  const stale = renderToStaticMarkup(<ClientOfferCard {...base} offer={offer} now={now} phase="refused" refusal="version_stale" onAccept={() => {}} />);
  assert.match(stale, /data-refusal="version_stale"/);
});

test("offer accepted: Accepted pill, next step names the deposit, Pay button when a link exists, otherwise the business sends one; declined and expired read their lines with no buttons", () => {
  const withLink = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, status: "accepted" }} now={now} payCode="abc" onPay={() => {}} onAccept={() => {}} />);
  assert.match(withLink, />Accepted</);
  assert.match(withLink, /Accepted\. Next: pay the deposit to confirm\./);
  assert.match(withLink, /data-client-action="pay"[^>]*>Pay \$1,140\.00/);
  assert.doesNotMatch(withLink, /accept_offer/);
  const noLink = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, status: "accepted" }} now={now} payCode={null} onAccept={() => {}} />);
  assert.match(noLink, /Impronta will send you a payment link to confirm\./);
  assert.doesNotMatch(noLink, /data-client-action/);
  const declined = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, status: "rejected" }} now={now} onAccept={() => {}} />);
  assert.match(declined, />Declined</);
  assert.doesNotMatch(declined, /data-client-action/);
  const expired = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, validUntil: "2026-09-01T00:00:00.000Z" }} now={now} onAccept={() => {}} />);
  assert.match(expired, /This offer has expired\. Ask Impronta for a new one\./);
  assert.doesNotMatch(expired, /data-client-action/);
  const superseded = renderToStaticMarkup(<ClientOfferCard {...base} offer={{ ...offer, status: "superseded" }} now={now} onAccept={() => {}} />);
  assert.match(superseded, /A newer version replaced this offer\./);
});

/* ---------- payment ---------- */

test("payment: open link shows Pay with the amount and the expiry; paid shows the pill and no button; expired reads the sentence", () => {
  const open = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ paymentLinkCode: "abc", amountCents: 114000, amountKind: "deposit", expiresAt: "2026-09-20T00:00:00.000Z", state: "sent" })} onPay={() => {}} />);
  assert.match(open, /class="cat">Payment</);
  assert.match(open, /Deposit<\/span><span>\$1,140\.00/);
  assert.match(open, /data-client-action="pay"[^>]*>Pay \$1,140\.00/);
  assert.match(open, /Link valid until/);
  const paid = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ paymentLinkCode: "abc", amountCents: 114000, amountKind: "deposit", state: "paid" })} onPay={() => {}} />);
  assert.match(paid, />Paid</);
  assert.doesNotMatch(paid, /data-client-action/);
  const paidMoney = renderToStaticMarkup(
    <ClientPaymentCard
      {...base}
      now={now}
      view={readPayment({
        paymentLinkCode: "abc",
        amountCents: 20000,
        amountKind: "deposit",
        state: "paid",
        totalCents: 50000,
        paidCents: 20000,
        dueCents: 30000,
        currency: "MXN",
        method: "card",
      })}
      onPay={() => {}}
    />,
  );
  assert.match(paidMoney, /Deposit by card/);
  assert.match(paidMoney, />Total</);
  assert.match(paidMoney, /200\.00 MXN/);
  assert.match(paidMoney, /500\.00 MXN/);
  assert.match(paidMoney, /Balance due/);
  assert.match(paidMoney, /300\.00 MXN/);
  assert.match(paidMoney, /200\.00 MXN paid\. Balance 300\.00 MXN still due\./);
  assert.doesNotMatch(paidMoney, /data-client-action/);
  const expired = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ paymentLinkCode: "abc", amountCents: 114000, amountKind: "full", expiresAt: "2026-09-01T00:00:00.000Z", state: "sent" })} onPay={() => {}} />);
  assert.match(expired, /This payment link has expired\. Ask Impronta for a new one\./);
  assert.doesNotMatch(expired, /data-client-action/);
});

/* ---------- confirmation, change, draft ---------- */

test("confirmation: Confirmed pill, when line, Ask for a change and a greyed Receipt", () => {
  const view = readConfirmation({ recordKind: "appointment", recordId: "r1", when: "2026-09-20T15:00:00.000Z", title: "Balayage with Dani", lines: [{ label: "Balayage", units: 1, unitCents: 12000 }], currency: "USD" });
  const html = renderToStaticMarkup(<ClientConfirmedCard {...base} view={view} kind="appointment_confirmation" onChange={() => {}} />);
  assert.match(html, /class="cat">Booked</);
  assert.match(html, />Confirmed</);
  assert.match(html, /Balayage with Dani/);
  assert.match(html, /When</);
  assert.match(html, /data-client-action="ask_change"/);
  assert.match(html, /data-client-action="receipt"[^>]*disabled|disabled[^>]*data-client-action="receipt"/);
  const order = renderToStaticMarkup(<ClientConfirmedCard {...base} view={view} kind="order_confirmation" />);
  assert.match(order, /class="cat">Order</);
});

test("change request and result are read-only with the state", () => {
  const sent = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_request", { state: "sent" }, "Remove one hostess")} />);
  assert.match(sent, /class="cat">Change request</);
  assert.match(sent, /Remove one hostess/);
  assert.match(sent, />Sent</);
  assert.match(sent, /Nothing changes until you confirm\./);
  assert.doesNotMatch(sent, /data-client-action/);
  const applied = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_result", { state: "sent" }, "Start an hour later")} />);
  assert.match(applied, />Applied</);
  const declined = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_result", { state: "cancelled" }, "")} />);
  assert.match(declined, />Not possible</);
  assert.match(declined, /Impronta could not make this change\./);
  const cancelled = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_result", { state: "sent", summary: "Cancelled, refunded 18.00", refundedCents: 1800, currency: "USD" }, "")} />);
  assert.match(cancelled, /data-card="client-cancel"/);
  assert.match(cancelled, />Cancelled</);
  assert.match(cancelled, /Cancelled\. \$18\.00 will be refunded\./);
  const noRefund = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_result", { state: "sent", summary: "Cancelled, no refund", refundedCents: 0 }, "")} />);
  assert.match(noRefund, /Cancelled\. No refund\./);
  const refundOnly = renderToStaticMarkup(<ClientChangeCard copy={EN_CLIENT} business="Impronta" view={readChange("change_result", { state: "sent", summary: "Refunded 18.00 USD", refundedCents: 1800, currency: "USD" }, "")} />);
  assert.match(refundOnly, /\$18\.00 was refunded\./);
});

test("tickets paid: Issued pill, Open ticket when the engine stamped a /q/ code; waiting sentence when it did not; cancelled leaves the chooser", () => {
  const issued = renderToStaticMarkup(<ClientTicketsCard copy={EN_CLIENT} business="Impronta" view={readTickets({ title: "Friday night", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], state: "paid", ticketCode: "abc12" })} onOpen={() => {}} />);
  assert.match(issued, /data-card="client-tickets"/);
  assert.match(issued, />Issued</);
  assert.match(issued, /Friday night/);
  assert.match(issued, /GA/);
  assert.match(issued, /data-client-action="open_ticket"/);
  assert.match(issued, />Open ticket</);
  const waiting = renderToStaticMarkup(<ClientTicketsCard copy={EN_CLIENT} business="Impronta" view={readTickets({ title: "Friday night", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], state: "issued" })} />);
  assert.match(waiting, /Your tickets are ready\. Impronta will send the door link\./);
  assert.doesNotMatch(waiting, /data-client-action="open_ticket"/);
  const cancelled = renderToStaticMarkup(<ClientTicketsCard copy={EN_CLIENT} business="Impronta" view={readTickets({ title: "Friday night", state: "cancelled" })} />);
  assert.match(cancelled, /These tickets were cancelled\./);
  assert.doesNotMatch(cancelled, /data-client-action/);
});

test("payment cancelled is its own sentence, not the expired line", () => {
  const html = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ paymentLinkCode: "abc", amountCents: 1800, amountKind: "full", state: "cancelled" })} onPay={() => {}} />);
  assert.match(html, />Cancelled</);
  assert.match(html, /This payment was cancelled\. Ask Impronta if you still want to pay\./);
  assert.doesNotMatch(html, /data-client-action/);
});

test("draft card: what the client picked so far, with a total", () => {
  const html = renderToStaticMarkup(<ClientDraftCard copy={EN_CLIENT} business="Impronta" currency="USD" lines={[{ label: "Taco", units: 2, unitCents: 900 }]} />);
  assert.match(html, /Taco × 2/);
  assert.match(html, /\$18\.00/);
  assert.match(html, /Impronta confirms before anything is charged\./);
});
