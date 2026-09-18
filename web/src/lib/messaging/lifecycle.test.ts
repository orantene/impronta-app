import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveAutoResolve, type LifecycleRecord } from "./lifecycle";

const NOW = "2026-09-17T12:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();

function record(overrides: Partial<LifecycleRecord>): LifecycleRecord {
  return {
    kind: "order",
    paymentState: "paid",
    fulfilmentState: "fulfilled",
    recordDate: null,
    updatedAt: daysAgo(3),
    ...overrides,
  };
}

test("no records: never auto-resolves (the 30-day chat-only rule lives in the cron)", () => {
  assert.deepEqual(deriveAutoResolve([], NOW), { resolve: false, reason: "no_records" });
});

test("an open order keeps the conversation open", () => {
  const verdict = deriveAutoResolve([record({ fulfilmentState: "preparing", updatedAt: daysAgo(10) })], NOW);
  assert.deepEqual(verdict, { resolve: false, reason: "record_open" });
});

test("a record with unknown state is treated as open, never as closed", () => {
  const verdict = deriveAutoResolve([record({ paymentState: null, fulfilmentState: null })], NOW);
  assert.equal(verdict.resolve, false);
  assert.equal(verdict.reason, "record_open");
});

test("a fulfilled order inside the 2-day grace is in_grace with the moment it becomes ready", () => {
  const verdict = deriveAutoResolve([record({ updatedAt: daysAgo(1) })], NOW);
  assert.equal(verdict.resolve, false);
  assert.equal(verdict.reason, "in_grace");
  if (verdict.reason !== "in_grace") return;
  assert.equal(verdict.readyAt, new Date(Date.parse(daysAgo(1)) + 2 * 24 * 60 * 60 * 1000).toISOString());
});

test("a fulfilled, paid order past the grace resolves", () => {
  const verdict = deriveAutoResolve([record({ updatedAt: daysAgo(3) })], NOW);
  assert.equal(verdict.resolve, true);
  assert.equal(verdict.reason, "all_records_closed");
});

test("money still owed on a fulfilled record blocks, but a cancelled record owes nothing", () => {
  assert.deepEqual(deriveAutoResolve([record({ paymentState: "requested", updatedAt: daysAgo(9) })], NOW), {
    resolve: false,
    reason: "money_owed",
  });
  const cancelled = deriveAutoResolve(
    [record({ paymentState: "requested", fulfilmentState: "cancelled", updatedAt: daysAgo(9) })],
    NOW,
  );
  assert.equal(cancelled.resolve, true);
});

test("tickets wait 7 days after the event date; the last record to close sets the clock", () => {
  const tickets = record({
    kind: "tickets",
    fulfilmentState: "checked_in",
    recordDate: daysAgo(3),
    updatedAt: daysAgo(3),
  });
  assert.equal(deriveAutoResolve([tickets], NOW).reason, "in_grace");
  const older = { ...tickets, recordDate: daysAgo(8), updatedAt: daysAgo(8) };
  assert.equal(deriveAutoResolve([older], NOW).resolve, true);
  // Mixed: the order closed 5 days ago (ready), the tickets 3 days ago (not yet).
  const mixed = deriveAutoResolve([record({ updatedAt: daysAgo(5) }), tickets], NOW);
  assert.equal(mixed.reason, "in_grace");
});

test("a confirmed appointment whose date has not arrived is open; once it has passed, the 2-day grace runs", () => {
  const future = record({ kind: "appointment", fulfilmentState: "confirmed", recordDate: daysAgo(-2), updatedAt: daysAgo(5) });
  assert.equal(deriveAutoResolve([future], NOW).reason, "record_open");
  const past = { ...future, recordDate: daysAgo(3) };
  assert.equal(deriveAutoResolve([past], NOW).resolve, true);
});
