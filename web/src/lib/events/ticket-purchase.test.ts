import assert from "node:assert/strict";
import test from "node:test";

import { buildTicketPurchase, doorOfferState, seatLostLines, seatLostMessage } from "./ticket-purchase";

const now = new Date("2026-09-06T12:00:00Z");
const day = 86_400_000;

test("pay-at-the-door is offered only before doors and within the 7-day hold cap", () => {
  const soon = { sessionStartsAt: new Date(now.getTime() + 2 * day).toISOString(), sessionEndsAt: new Date(now.getTime() + 2 * day + 3 * 3_600_000).toISOString() };
  assert.deepEqual(doorOfferState({ allowPayInPerson: true, now, ...soon }), { offered: true });
  const far = { sessionStartsAt: new Date(now.getTime() + 20 * day).toISOString(), sessionEndsAt: new Date(now.getTime() + 20 * day + 3_600_000).toISOString() };
  assert.deepEqual(doorOfferState({ allowPayInPerson: true, now, ...far }), { offered: false, reason: "opens_closer_to_date" });
  // Exactly at the cap edge: the END decides, not the start.
  const edge = { sessionStartsAt: new Date(now.getTime() + 6 * day).toISOString(), sessionEndsAt: new Date(now.getTime() + 7 * day + 1000).toISOString() };
  assert.deepEqual(doorOfferState({ allowPayInPerson: true, now, ...edge }), { offered: false, reason: "opens_closer_to_date" });
});

test("a purchase once doors are open is the door's sale, not an online hold", () => {
  const started = { sessionStartsAt: new Date(now.getTime() - 60_000).toISOString(), sessionEndsAt: new Date(now.getTime() + 3_600_000).toISOString() };
  assert.deepEqual(doorOfferState({ allowPayInPerson: true, now, ...started }), { offered: false, reason: "doors_open" });
});

test("a venue that never allows pay-at-the-door gets no sentence about dates", () => {
  const far = { sessionStartsAt: new Date(now.getTime() + 20 * day).toISOString(), sessionEndsAt: new Date(now.getTime() + 20 * day + 3_600_000).toISOString() };
  assert.deepEqual(doorOfferState({ allowPayInPerson: false, now, ...far }), { offered: false, reason: "not_allowed" });
  assert.deepEqual(doorOfferState({ allowPayInPerson: true, now, sessionStartsAt: "nope", sessionEndsAt: "nope" }), { offered: false, reason: "not_allowed" });
});

test("a ticket purchase declares perUnitDomainRow and binds the line to its session and variant", () => {
  const input = buildTicketPurchase({
    tenantId: "t", clientOrderKey: "k", offeringId: "o", variantId: "v", sessionId: "s", poolId: "p",
    sessionStartsAt: "2026-09-08T20:00:00Z", sessionEndsAt: "2026-09-08T23:00:00Z", units: 2, email: "a@b.c",
  });
  assert.equal(input.paymentChoice, "full");
  assert.equal(input.sourceChannel, "ticket_picker");
  assert.deepEqual(input.lines, [{ offeringId: "o", variantId: "v", sessionId: "s", units: 2 }]);
  assert.equal(input.capacity?.[0]?.perUnitDomainRow, true);
  assert.equal(input.capacity?.[0]?.units, 2);
  assert.equal(input.capacity?.[0]?.endsAt, "2026-09-08T23:00:00Z");
  assert.equal(input.actorUserId, null);
});

test("a paid ticket line with no committed seat is a refund intent, never a ticket", () => {
  const lines = [
    { id: "l1", sessionId: "s" },
    { id: "l2", sessionId: "s" },
    { id: "l3", sessionId: null }, // a product line: not a ticket, never an intent
  ];
  const committed = new Map<string, string[]>([["l1", ["a1", "a2"]]]);
  assert.deepEqual(seatLostLines(lines, committed), ["l2"]);
});

test("the seat-lost message says what happened, that it is refunded in full, and what to do", () => {
  const m = seatLostMessage({ eventTitle: "Noche de prueba", amountLabel: "$150.00" });
  assert.match(m, /Noche de prueba/);
  assert.match(m, /refunded \$150\.00 in full/);
  assert.match(m, /buy again|contact the venue/);
});

test("a pay-at-the-door purchase passes in_person and NO hold TTL: the pipeline derives it from the line's session", () => {
  const input = buildTicketPurchase({
    paymentChoice: "in_person",
    tenantId: "t", clientOrderKey: "k", offeringId: "o", variantId: "v", sessionId: "s", poolId: "p",
    sessionStartsAt: "2026-09-08T20:00:00Z", sessionEndsAt: "2026-09-08T23:00:00Z", units: 1, email: "a@b.c",
  });
  assert.equal(input.paymentChoice, "in_person");
  assert.equal(input.lines[0]?.sessionId, "s");
  assert.ok(!("holdTtlSeconds" in input) && !("holdTtlSecondsOverride" in input));
});
