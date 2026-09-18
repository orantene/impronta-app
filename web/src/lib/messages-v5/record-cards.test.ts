import assert from "node:assert/strict";
import { test } from "node:test";

import { cardPropsFromChip, cardPropsFromMessage, formatHoldCountdown, holdCountdown, ladderFor, ladderStepFor, tableChoicePayload } from "./record-cards";

const LADDER_COPY = {
  draft: "Draft",
  confirmed: "Confirmed",
  paid: "Paid",
  fulfilled: "Fulfilled",
  held: "Held",
  seated: "Seated",
  issued: "Issued",
  checkedIn: "Checked in",
  done: "Done",
};

test("ladderStepFor: order walks draft -> confirmed -> paid -> fulfilled from chip state", () => {
  assert.equal(ladderStepFor("order", {}), "draft");
  assert.equal(ladderStepFor("order", { fulfilmentState: "confirmed" }), "confirmed");
  assert.equal(ladderStepFor("order", { paymentState: "paid" }), "paid");
  assert.equal(ladderStepFor("order", { paymentState: "paid", fulfilmentState: "fulfilled" }), "fulfilled");
});

test("ladderStepFor: reservation walks held -> confirmed -> seated -> closed", () => {
  assert.equal(ladderStepFor("reservation", {}), "held");
  assert.equal(ladderStepFor("reservation", { paymentState: "paid" }), "confirmed");
  assert.equal(ladderStepFor("reservation", { fulfilmentState: "seated" }), "seated");
  assert.equal(ladderStepFor("reservation", { fulfilmentState: "cancelled" }), "closed");
});

test("ladderStepFor: tickets walks paid -> issued -> checked_in -> done", () => {
  assert.equal(ladderStepFor("tickets", {}), "paid");
  assert.equal(ladderStepFor("tickets", { paymentState: "paid" }), "issued");
  assert.equal(ladderStepFor("tickets", { fulfilmentState: "checked_in" }), "checked_in");
  assert.equal(ladderStepFor("tickets", { fulfilmentState: "done" }), "done");
});

test("ladderFor: done steps are cumulative up to the current step", () => {
  const steps = ladderFor("reservation", { fulfilmentState: "seated" }, LADDER_COPY);
  assert.deepEqual(steps.map((s) => s.done), [true, true, true, false]);
  assert.deepEqual(steps.map((s) => s.label), ["Held", "Confirmed", "Seated", "Fulfilled"]);
});

test("holdCountdown: minutes left, ended, and no-expiry are three distinct shapes", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(holdCountdown(null, now), null);
  assert.deepEqual(holdCountdown("2026-09-17T12:09:30.000Z", now), { ended: false, minutesLeft: 10 });
  assert.deepEqual(holdCountdown("2026-09-17T11:00:00.000Z", now), { ended: true });
});

test("formatHoldCountdown: renders the kit's two label shapes", () => {
  const labels = { minutesLeft: "{minutes} min left", ended: "The hold ended" };
  assert.equal(formatHoldCountdown(null, labels), null);
  assert.equal(formatHoldCountdown({ ended: false, minutesLeft: 7 }, labels), "7 min left");
  assert.equal(formatHoldCountdown({ ended: true }, labels), "The hold ended");
});

test("tableChoicePayload: reuses service_card shape with a table variant, no new kind", () => {
  const payload = tableChoicePayload([{ label: "Table for 4 · 7:30 PM", partySize: 4, startsAt: "2026-09-20T19:30:00.000Z" }]);
  assert.equal(payload.variant, "table");
  assert.deepEqual(payload.labels, ["Table for 4 · 7:30 PM"]);
  assert.equal((payload.tables as unknown[]).length, 1);
});

test("cardPropsFromMessage: service_card table variant reads the first table row", () => {
  const props = cardPropsFromMessage("service_card", { tables: [{ label: "T4", partySize: 4, startsAt: "2026-09-20T19:30:00.000Z" }], holdExpiresAt: "2026-09-20T19:45:00.000Z" });
  assert.deepEqual(props, { partySize: 4, startsAt: "2026-09-20T19:30:00.000Z", tableLabel: "T4", holdExpiresAt: "2026-09-20T19:45:00.000Z" });
});

test("cardPropsFromMessage: tickets_card reads tiers, capacity and checked-in count", () => {
  const props = cardPropsFromMessage("tickets_card", { title: "General", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], capacity: 2, checkedIn: 1 });
  assert.deepEqual(props, { title: "General", tiers: [{ id: "t1", label: "GA", priceCents: 5000 }], holdExpiresAt: null, capacity: 2, checkedIn: 1 });
});

test("cardPropsFromChip: same ladder the message card would compute, for order/reservation/tickets kinds", () => {
  const chip = { kind: "reservation" as const, recordId: "r1", label: "reservation", paymentState: null, fulfilmentState: "seated" };
  const result = cardPropsFromChip(chip, LADDER_COPY);
  assert.equal(result?.ladderKind, "reservation");
  assert.equal(result?.step, "seated");
});

test("cardPropsFromChip: null for a kind this lane's cards do not cover", () => {
  const chip = { kind: "offer" as const, recordId: "o1", label: "Offer v1", paymentState: null, fulfilmentState: null };
  assert.equal(cardPropsFromChip(chip, LADDER_COPY), null);
});
