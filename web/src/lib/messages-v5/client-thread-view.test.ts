import assert from "node:assert/strict";
import { test } from "node:test";

import type { ThreadMessage } from "@/lib/messaging/types";

import {
  buildClientStream,
  clientOfferForMessage,
  firstName,
  formatSlot,
  holdCountdown,
  holdSlotLabelFromMessages,
  offerCardMessageIds,
  offerCardState,
  offerDepositCents,
  readChange,
  readChoices,
  readConfirmation,
  readPayment,
  readTickets,
  readTimes,
  ticketsIssued,
  timesSlotOpen,
  timesState,
  type ClientOfferSummary,
} from "./client-thread-view";

function msg(over: Partial<ThreadMessage> & { id: string }): ThreadMessage {
  return {
    inquiryId: "inq",
    kind: "text",
    body: "hi",
    payload: null,
    senderUserId: null,
    guestSessionId: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    thread: "private",
    internal: false,
    delivery: null,
    ...over,
  };
}

test("stream: day separator, grouping by side within 3 minutes, cards, system lines; notes never appear", () => {
  const items = buildClientStream([
    msg({ id: "a", senderUserId: "staff", createdAt: "2026-09-17T10:00:00.000Z" }),
    msg({ id: "b", senderUserId: "staff", createdAt: "2026-09-17T10:01:00.000Z" }),
    msg({ id: "c", createdAt: "2026-09-17T10:02:00.000Z" }),
    msg({ id: "n", kind: "internal_note", internal: true, senderUserId: "staff", createdAt: "2026-09-17T10:02:30.000Z" }),
    msg({ id: "d", kind: "menu_options", payload: { offeringIds: ["o1"], labels: ["Taco"], pricesCents: [900] }, createdAt: "2026-09-17T10:03:00.000Z" }),
    msg({ id: "e", kind: "offer_event", senderUserId: "staff", payload: { status: "sent", offer_id: "of1" }, createdAt: "2026-09-18T09:00:00.000Z" }),
    msg({ id: "f", kind: "unknown_kind", senderUserId: "staff", createdAt: "2026-09-18T09:01:00.000Z" }),
  ]);
  assert.deepEqual(
    items.map((it) => `${it.kind}:${it.kind === "message" ? `${it.position}:${it.mine ? "me" : "them"}` : it.kind === "card" ? it.cardKind : it.key}`),
    ["day:day:a", "message:first:them", "message:last:them", "message:single:me", "card:menu_options", "day:day:e", "card:offer_event", "system:f"],
  );
});

test("choices reader: parallel arrays, tickets tiers, class single, chosenIds survive", () => {
  const menu = readChoices("menu_options", { offeringIds: ["a", "b"], labels: ["Taco", "Burrito"], pricesCents: [900, 1200], currency: "USD", chosenIds: ["a"] });
  assert.equal(menu.multiple, true);
  assert.deepEqual(menu.options.map((o) => [o.id, o.label, o.priceCents]), [["a", "Taco", 900], ["b", "Burrito", 1200]]);
  assert.deepEqual(menu.chosenIds, ["a"]);
  const tickets = readChoices("tickets_card", { offeringId: "off", sessionId: "11111111-1111-4111-8111-111111111111", title: "Lumina", tiers: [{ id: "t1", label: "GA", priceCents: 2500 }] });
  assert.equal(tickets.multiple, false);
  assert.deepEqual(tickets.options[0], { id: "t1", label: "GA", priceCents: 2500, sessionId: "11111111-1111-4111-8111-111111111111" });
  const cls = readChoices("class_card", { offeringId: "cls", title: "Yoga", sessionId: "s1" });
  assert.equal(cls.options.length, 1);
  assert.equal(cls.options[0].id, "cls");
  const service = readChoices("service_card", { offeringIds: ["s"], labels: ["Cut"], pricesCents: [4000] });
  assert.equal(service.multiple, false);
});

test("times reader and state: sent, picked with countdown, hold ended", () => {
  const now = new Date("2026-09-17T10:00:00.000Z");
  const sent = readTimes({ slots: [{ startsAt: "2026-09-20T15:00:00.000Z", professionalName: "Dani" }], timezone: "America/Cancun" });
  assert.equal(sent.professionalName, "Dani");
  assert.equal(timesState(sent, now), "sent");
  const picked = readTimes({ slots: [{ startsAt: "2026-09-20T15:00:00.000Z" }], pickedStartsAt: "2026-09-20T15:00:00.000Z", holdExpiresAt: "2026-09-17T10:12:41.000Z" });
  assert.equal(timesState(picked, now), "picked");
  assert.equal(holdCountdown(picked.holdExpiresAt, now), "12:41");
  const ended = readTimes({ slots: [], pickedStartsAt: "2026-09-20T15:00:00.000Z", holdExpiresAt: "2026-09-17T09:59:00.000Z" });
  assert.equal(timesState(ended, now), "hold_ended");
  assert.equal(holdCountdown(ended.holdExpiresAt, now), null);
  const future = "2026-09-20T15:00:00.000Z";
  const past = "2026-09-17T09:00:00.000Z";
  assert.equal(timesSlotOpen("sent", future, now, false), true);
  assert.equal(timesSlotOpen("sent", past, now, false), false);
  assert.equal(timesSlotOpen("picked", future, now, true), false);
  assert.equal(timesSlotOpen("hold_ended", future, now, false), false);
  assert.equal(timesSlotOpen("hold_ended", future, now, true), true);
  assert.equal(timesSlotOpen("hold_ended", past, now, true), false);
});

const offer: ClientOfferSummary = { id: "of1", version: 2, status: "sent", totalCents: 380000, currency: "USD", depositPct: 30, depositCents: null, refundPolicy: "flexible", validUntil: "2026-09-30T00:00:00.000Z", noteToClient: null, lines: [{ label: "Hostess", units: 2, amountCents: 140000 }] };

test("offer: state by status and validity, deposit from pct or explicit amount, card lookup by offer_id", () => {
  const now = new Date("2026-09-17T10:00:00.000Z");
  assert.equal(offerCardState(offer, now), "sent");
  assert.equal(offerCardState({ ...offer, status: "accepted" }, now), "accepted");
  assert.equal(offerCardState({ ...offer, status: "rejected" }, now), "declined");
  assert.equal(offerCardState({ ...offer, status: "superseded" }, now), "expired");
  assert.equal(offerCardState({ ...offer, validUntil: "2026-09-01T00:00:00.000Z" }, now), "expired");
  assert.equal(offerDepositCents(offer), 114000);
  assert.equal(offerDepositCents({ ...offer, depositCents: 50000 }), 50000);
  assert.equal(offerDepositCents({ ...offer, depositPct: null }), null);
  assert.equal(clientOfferForMessage({ offer_id: "of1", status: "sent" }, [offer])?.id, "of1");
  assert.equal(clientOfferForMessage({ offerId: "nope" }, [offer]), null);
  assert.equal(clientOfferForMessage(null, [offer]), null);
});

test("one offer card per offer: the LAST sent offer_event draws it; non-sent events and offer_state rows do not", () => {
  const ids = offerCardMessageIds([
    msg({ id: "e1", kind: "offer_event", payload: { status: "sent", offer_id: "of1" } }),
    msg({ id: "e2", kind: "offer_event", payload: { status: "sent", offer_id: "of1" } }),
    msg({ id: "e3", kind: "offer_event", payload: { status: "accepted", offer_id: "of1" } }),
    msg({ id: "s1", kind: "offer_state", payload: { offerId: "of1", offerStatus: "accepted" } }),
    msg({ id: "r1", kind: "offer_review", payload: { offerId: "of2" } }),
  ]);
  assert.deepEqual([...ids].sort(), ["e2", "r1"]);
});

test("payment, confirmation and change readers read client-safe fields only", () => {
  const pay = readPayment({ paymentLinkCode: "abc", amountCents: 114000, amountKind: "deposit", expiresAt: "2026-09-20T00:00:00.000Z", state: "sent" });
  assert.deepEqual(pay, { code: "abc", amountCents: 114000, currency: "USD", amountKind: "deposit", expiresAt: "2026-09-20T00:00:00.000Z", state: "sent", totalCents: null, paidCents: null, dueCents: null, method: null });
  const conf = readConfirmation({ recordKind: "appointment", recordId: "r1", when: "2026-09-20T15:00:00.000Z", lines: [{ label: "Cut", units: 2, unitCents: 4000 }], currency: "USD" });
  assert.equal(conf.lines[0].amountCents, 8000);
  assert.equal(conf.recordId, "r1");
  assert.equal(readChange("change_request", { state: "sent" }, "Start later").state, "sent");
  assert.equal(readChange("change_request", { state: "selected" }, "").state, "applied");
  assert.equal(readChange("change_result", { state: "cancelled" }, "").state, "declined");
  assert.equal(readChange("change_result", { state: "sent" }, "").state, "applied");
  const cancel = readChange("change_result", { state: "sent", summary: "Cancelled, refunded 18.00", refundedCents: 1800, currency: "USD" }, "");
  assert.equal(cancel.state, "cancelled");
  assert.equal(cancel.refundedCents, 1800);
  const refundOnly = readChange("change_result", { state: "sent", summary: "Refunded 18.00 USD", refundedCents: 1800 }, "");
  assert.equal(refundOnly.state, "cancelled");
});

test("tickets reader: chooser until paid/issued; code from /q/ path or short stamp", () => {
  const sent = readTickets({ title: "Friday night", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], currency: "USD" });
  assert.equal(ticketsIssued(sent), false);
  assert.equal(sent.state, "sent");
  assert.equal(sent.ticketCode, null);
  const paid = readTickets({ title: "Friday night", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], state: "paid", ticketCode: "abc12" });
  assert.equal(ticketsIssued(paid), true);
  assert.equal(paid.ticketCode, "abc12");
  const fromUrl = readTickets({ state: "issued", ticketUrl: "https://qa.example/q/door7?x=1" });
  assert.equal(ticketsIssued(fromUrl), true);
  assert.equal(fromUrl.ticketCode, "door7");
  const cancelled = readTickets({ state: "cancelled", title: "Friday night" });
  assert.equal(ticketsIssued(cancelled), false);
  assert.equal(cancelled.state, "cancelled");
});

test("formatSlot and the context hold chip use the payload timezone", () => {
  const iso = "2026-09-20T15:00:00.000Z";
  assert.match(formatSlot(iso, "en", "America/Mexico_City"), /9:00 AM/);
  const label = holdSlotLabelFromMessages(
    [
      { kind: "text", payload: null },
      { kind: "professional_times", payload: { slots: [{ startsAt: iso, professionalName: "Dani" }], timezone: "America/Mexico_City", state: "selected", pickedStartsAt: iso } },
    ],
    "en",
  );
  assert.match(label ?? "", /9:00 AM/);
});

test("firstName", () => {
  assert.equal(firstName("Sofía Herrera"), "Sofía");
  assert.equal(firstName("  "), null);
  assert.equal(firstName(null), null);
});

test("readPayment returns the paid money line", () => {
  const view = readPayment({
    paymentLinkCode: "abc",
    amountCents: 2000,
    currency: "MXN",
    state: "paid",
    totalCents: 5000,
    paidCents: 2000,
    dueCents: 3000,
    method: "card",
  });
  assert.equal(view.totalCents, 5000);
  assert.equal(view.paidCents, 2000);
  assert.equal(view.dueCents, 3000);
  assert.equal(view.method, "card");
});

test("a declined change_result stays declined", () => {
  const view = readChange("change_result", { state: "declined", summary: "Offer declined" }, "");
  assert.equal(view.state, "declined");
});
