/**
 * model.test.ts — the ranking and the refusals.
 *
 * Two things here are worth more than the rest. First, that a claimed-but-
 * unexecuted refund produces NO button: that is the one classification whose
 * failure mode is a second refund, and it is a single `if` away from being
 * wrong. Second, that the queue sorts oldest-first inside a severity — the
 * newest-first default is the easy mistake and it buries the thing that has
 * been broken longest.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_STALE_MS,
  ENGINE_EFFECT_GIVING_UP_ATTEMPTS,
  EXCEPTION_SOURCES,
  REFUND_INTENT_STALE_MS,
  RESUME_VERBS,
  classifyEngineEffect,
  classifyMintShortfall,
  classifyOutboxDead,
  classifyRefundIntent,
  classifyUnresolvedCollection,
  sortExceptions,
  summariseExceptions,
  type ExceptionRow,
} from "./model";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

const refund = (over: Partial<Parameters<typeof classifyRefundIntent>[0]> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "order-1",
  reason: "seat_lost_after_payment",
  createdAt: minutesAgo(2),
  claimedAt: null,
  executedAt: null,
  result: null,
  attempts: 0,
  ...over,
});

test("the source set is closed and has no duplicates", () => {
  assert.equal(new Set(EXCEPTION_SOURCES).size, EXCEPTION_SOURCES.length);
  assert.equal(new Set(RESUME_VERBS).size, RESUME_VERBS.length);
});

test("a clean executed refund is not an exception at all", () => {
  const row = classifyRefundIntent(
    refund({ claimedAt: minutesAgo(5), executedAt: minutesAgo(4), result: "ok" }),
    NOW,
    null,
  );
  assert.equal(row, null);
});

test("a fresh unclaimed refund is normal and can be re-queued", () => {
  const row = classifyRefundIntent(refund(), NOW, "/x/admin/orders?q=order-1");
  assert.ok(row);
  assert.equal(row.severity, "normal");
  assert.equal(row.nextAction.kind, "resume");
  assert.equal(row.owner, "money");
});

test("a refund the cron has ignored past the stale window is escalated", () => {
  const stale = classifyRefundIntent(
    refund({ createdAt: new Date(NOW - REFUND_INTENT_STALE_MS - 1000).toISOString() }),
    NOW,
    null,
  );
  assert.ok(stale);
  assert.equal(stale.severity, "high");
});

test("a CLAIMED but unexecuted refund is critical and has NO button", () => {
  // The one that matters. `claimed_at` means the executor may already have
  // reached the provider; a resume verb here is one click from a second refund.
  const row = classifyRefundIntent(refund({ claimedAt: minutesAgo(30) }), NOW, null);
  assert.ok(row);
  assert.equal(row.severity, "critical");
  assert.equal(row.nextAction.kind, "inspect");
  assert.ok(!("verb" in row.nextAction), "a claimed refund was given a re-drive verb");
});

test("partial_failure stays an exception even though it executed, and has no button", () => {
  const row = classifyRefundIntent(
    refund({ claimedAt: minutesAgo(9), executedAt: minutesAgo(8), result: "partial_failure" }),
    NOW,
    null,
  );
  assert.ok(row);
  assert.equal(row.severity, "critical");
  assert.equal(row.nextAction.kind, "inspect");
});

test("an event-cancelled refund says so rather than talking about a lost seat", () => {
  const row = classifyRefundIntent(refund({ reason: "event_cancelled" }), NOW, null);
  assert.ok(row);
  assert.match(row.detail, /cancelled/i);
});

test("a mint shortfall is always critical, regardless of age", () => {
  const fresh = classifyMintShortfall(
    {
      orderLineId: "line-1",
      orderId: "order-1",
      expectedRows: 4,
      mintedRows: 1,
      missingRows: 3,
      orderUpdatedAt: minutesAgo(0),
    },
    null,
  );
  assert.equal(fresh.severity, "critical");
  assert.equal(fresh.owner, "door");
  assert.equal(fresh.nextAction.kind, "resume");
  assert.match(fresh.title, /3 tickets/);
});

test("one missing ticket is singular", () => {
  const one = classifyMintShortfall(
    {
      orderLineId: "line-1",
      orderId: "order-1",
      expectedRows: 1,
      mintedRows: 0,
      missingRows: 1,
      orderUpdatedAt: minutesAgo(0),
    },
    null,
  );
  assert.match(one.title, /1 ticket sold/);
});

test("engine attempts override the stored priority upward, never downward", () => {
  const low = classifyEngineEffect(
    {
      id: "e1",
      inquiryId: "i1",
      listenerName: "notify",
      engineAction: "offer_sent",
      priority: "low",
      attemptCount: ENGINE_EFFECT_GIVING_UP_ATTEMPTS,
      createdAt: minutesAgo(60),
      retriedAt: minutesAgo(5),
    },
    null,
  );
  assert.equal(low.severity, "critical", "an exhausted low-priority effect is still exhausted");

  const highFresh = classifyEngineEffect(
    {
      id: "e2",
      inquiryId: "i1",
      listenerName: "notify",
      engineAction: "offer_sent",
      priority: "high",
      attemptCount: 1,
      createdAt: minutesAgo(3),
      retriedAt: null,
    },
    null,
  );
  assert.equal(highFresh.severity, "high", "a retrying high-priority effect was over-escalated");
});

test("a recent card collection is not yet an exception", () => {
  const row = classifyUnresolvedCollection(
    {
      transactionId: "t1",
      orderId: "o1",
      grossAmountCents: 2500,
      currency: "eur",
      requestedAt: minutesAgo(2),
    },
    NOW,
    null,
  );
  assert.equal(row, null, "every in-progress card tap would be an exception");
});

test("a stalled card collection is high, and never resumable", () => {
  const row = classifyUnresolvedCollection(
    {
      transactionId: "t1",
      orderId: "o1",
      grossAmountCents: 2500,
      currency: "eur",
      requestedAt: new Date(NOW - COLLECTION_STALE_MS - 1000).toISOString(),
    },
    NOW,
    null,
  );
  assert.ok(row);
  assert.equal(row.severity, "high");
  assert.equal(row.nextAction.kind, "inspect");
  assert.match(row.detail, /25\.00 EUR/);
});

test("a dead outbox message is high, not critical", () => {
  // It must not outrank a missing ticket. See the note on classifyOutboxDead.
  const row = classifyOutboxDead({
    id: "m1",
    topic: "order.paid",
    attemptCount: 12,
    createdAt: minutesAgo(200),
    lastError: "smtp refused",
  });
  assert.equal(row.severity, "high");
  assert.equal(row.nextAction.kind, "resume");
  assert.match(row.detail, /smtp refused/);
});

test("severity leads the sort, and inside a severity the OLDEST is first", () => {
  const rows: ExceptionRow[] = [
    classifyOutboxDead({ id: "m-new", topic: "a", attemptCount: 1, createdAt: minutesAgo(1), lastError: null }),
    classifyMintShortfall(
      { orderLineId: "l1", orderId: "o1", expectedRows: 1, mintedRows: 0, missingRows: 1, orderUpdatedAt: minutesAgo(5) },
      null,
    ),
    classifyOutboxDead({ id: "m-old", topic: "b", attemptCount: 1, createdAt: minutesAgo(500), lastError: null }),
  ];
  const sorted = sortExceptions(rows);
  assert.equal(sorted[0].source, "mint_shortfall", "a critical row did not lead");
  assert.equal(sorted[1].sourceId, "m-old", "newest-first buried the longest-broken row");
  assert.equal(sorted[2].sourceId, "m-new");
});

test("an unparseable timestamp sorts last instead of winning the top", () => {
  const good = classifyOutboxDead({ id: "good", topic: "a", attemptCount: 1, createdAt: minutesAgo(10), lastError: null });
  const bad = classifyOutboxDead({ id: "bad", topic: "b", attemptCount: 1, createdAt: "not a date", lastError: null });
  const sorted = sortExceptions([bad, good]);
  assert.equal(sorted[0].sourceId, "good");
});

test("sorting does not mutate the caller's array", () => {
  const rows = [
    classifyOutboxDead({ id: "a", topic: "a", attemptCount: 1, createdAt: minutesAgo(1), lastError: null }),
    classifyMintShortfall(
      { orderLineId: "l1", orderId: "o1", expectedRows: 1, mintedRows: 0, missingRows: 1, orderUpdatedAt: minutesAgo(5) },
      null,
    ),
  ];
  const before = rows.map((r) => r.key);
  sortExceptions(rows);
  assert.deepEqual(rows.map((r) => r.key), before);
});

test("the summary counts what the screen shows, including how many have a button", () => {
  const claimed = classifyRefundIntent(refund({ claimedAt: minutesAgo(30) }), NOW, null);
  assert.ok(claimed);
  const rows: ExceptionRow[] = [
    claimed,
    classifyMintShortfall(
      { orderLineId: "l1", orderId: "o1", expectedRows: 2, mintedRows: 0, missingRows: 2, orderUpdatedAt: minutesAgo(5) },
      null,
    ),
    classifyOutboxDead({ id: "m1", topic: "a", attemptCount: 12, createdAt: minutesAgo(9), lastError: null }),
  ];
  const summary = summariseExceptions(rows);
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.critical, 2);
  assert.equal(summary.bySeverity.high, 1);
  assert.equal(summary.byOwner.money, 1);
  assert.equal(summary.byOwner.door, 1);
  assert.equal(summary.byOwner.operations, 1);
  assert.equal(summary.resumable, 2, "the claimed refund must not be counted as pressable");
});

test("every row key is unique per source row, so a list can key on it", () => {
  const a = classifyMintShortfall(
    { orderLineId: "l1", orderId: "o1", expectedRows: 1, mintedRows: 0, missingRows: 1, orderUpdatedAt: minutesAgo(1) },
    null,
  );
  const b = classifyMintShortfall(
    { orderLineId: "l2", orderId: "o1", expectedRows: 1, mintedRows: 0, missingRows: 1, orderUpdatedAt: minutesAgo(1) },
    null,
  );
  assert.notEqual(a.key, b.key);
  assert.match(a.key, /^mint_shortfall:/);
});
