import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClientOfferSummary } from "./client-thread-view";
import { deriveGuestNextStep, type GuestNextStepInput } from "./guest-next-step";

const now = new Date("2026-09-17T12:00:00Z");
const offer = (over: Partial<ClientOfferSummary> = {}): ClientOfferSummary => ({
  id: "o1", version: 2, status: "sent", totalCents: 150000, currency: "USD", depositPct: 20, depositCents: null, refundPolicy: null, validUntil: "2026-09-24T00:00:00Z", noteToClient: null, lines: [], ...over,
});
const base = (over: Partial<GuestNextStepInput> = {}): GuestNextStepInput => ({
  threadStatus: "open", offers: [], payCode: null, timesPayloads: [], records: [], now,
  money: (c, cur) => `${cur} ${(c / 100).toFixed(0)}`, date: (iso) => iso.slice(0, 10), ...over,
});

test("a guest card replaces Pay, and a missing card is not invented", () => {
  assert.equal(deriveGuestNextStep(base({ payCode: "abc", messageKinds: ["payment_paid"] }))?.kind, "paid");
  assert.equal(deriveGuestNextStep(base({ messageKinds: ["offer_declined"] }))?.kind, "declined");
  assert.equal(deriveGuestNextStep(base({ messageKinds: ["payment_failed"] }))?.kind, "pay_failed");
  assert.equal(deriveGuestNextStep(base({ messageKinds: ["refunded"] }))?.kind, "refunded");
  assert.equal(deriveGuestNextStep(base({ payCode: "abc" }))?.kind, "pay");
});

test("a draft or closed thread shows no step (the send bar owns the draft)", () => {
  assert.equal(deriveGuestNextStep(base({ threadStatus: "draft", offers: [offer()] })), null);
  assert.equal(deriveGuestNextStep(base({ threadStatus: "closed", payCode: "abc" })), null);
});

test("an open payment link wins, with the deposit when the offer has one", () => {
  const step = deriveGuestNextStep(base({ payCode: "abc", offers: [offer()] }));
  assert.equal(step?.kind, "pay");
  assert.equal(step?.payCode, "abc");
  assert.equal(step?.values.amount, "USD 300");
});

test("an open payment link on an accepted offer still names the amount", () => {
  const step = deriveGuestNextStep(base({ payCode: "abc", offers: [offer({ status: "accepted", depositPct: null })] }));
  assert.equal(step?.kind, "pay");
  assert.equal(step?.values.amount, "USD 1500");
});

test("a pending offer asks for acceptance, newest version first", () => {
  const step = deriveGuestNextStep(base({ offers: [offer({ id: "o0", version: 1 }), offer()] }));
  assert.equal(step?.kind, "accept_offer");
  assert.equal(step?.values.version, "2");
  assert.equal(step?.values.total, "USD 1500");
});

test("an accepted or expired offer no longer asks", () => {
  assert.equal(deriveGuestNextStep(base({ offers: [offer({ status: "accepted" })] })), null);
  assert.equal(deriveGuestNextStep(base({ offers: [offer({ validUntil: "2026-09-01T00:00:00Z" })] })), null);
});

test("a held time waits for the business; an expired hold does not", () => {
  const live = { pickedStartsAt: "2026-09-20T10:00:00Z", holdExpiresAt: "2026-09-17T12:10:00Z" };
  const dead = { pickedStartsAt: "2026-09-20T10:00:00Z", holdExpiresAt: "2026-09-17T11:00:00Z" };
  assert.equal(deriveGuestNextStep(base({ timesPayloads: [live] }))?.kind, "waiting_confirm");
  assert.equal(deriveGuestNextStep(base({ timesPayloads: [dead] })), null);
});

test("a confirmed record reads as booked with its date", () => {
  const step = deriveGuestNextStep(base({ records: [{ fulfilmentState: "confirmed", recordDate: "2026-11-21T20:00:00Z" }] }));
  assert.equal(step?.kind, "booked");
  assert.equal(step?.values.date, "2026-11-21");
});
