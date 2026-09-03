import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideOrderExpiry,
  IDLE_DRAFT_TTL_HOURS,
  type ExpiringOrder,
} from "@/lib/orders/expire-orders";

const NOW = new Date("2026-09-03T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function order(over: Partial<ExpiringOrder> = {}): ExpiringOrder {
  return {
    id: "o1",
    status: "pending_payment",
    holdExpiresAt: null,
    createdAt: ago(60_000),
    updatedAt: null,
    ...over,
  };
}

test("a lapsed hold is cancelled — it is denying a real seat", () => {
  const d = decideOrderExpiry(order({ holdExpiresAt: ago(1_000) }), NOW);
  assert.deepEqual(d, { action: "cancel", reason: "hold_lapsed" });
});

test("a live hold is kept", () => {
  const d = decideOrderExpiry(order({ holdExpiresAt: ahead(60_000) }), NOW);
  assert.equal(d.action, "keep");
});

test("pending_payment with NO hold is left alone", () => {
  // Nothing is being denied to anyone, and cancelling a payment someone may
  // still be completing is worse than a stale row.
  const d = decideOrderExpiry(order({ holdExpiresAt: null, createdAt: ago(30 * 86_400_000) }), NOW);
  assert.deepEqual(d, { action: "keep", reason: "not_expirable" });
});

test("a PAID order is never swept, even with a lapsed hold", () => {
  // commit_capacity refuses an expired hold, so "money landed, hold lapsed" is
  // a real branch. The answer is an alert for a human, never cancelling a paid
  // order.
  for (const status of ["paid", "fulfilled", "refunded", "partially_refunded", "cancelled"]) {
    const d = decideOrderExpiry(order({ status, holdExpiresAt: ago(86_400_000) }), NOW);
    assert.equal(d.action, "keep", `${status} must never be swept`);
  }
});

test("an idle draft is cancelled only after the long fuse", () => {
  const stale = decideOrderExpiry(
    order({ status: "draft", createdAt: ago((IDLE_DRAFT_TTL_HOURS + 1) * 3_600_000) }),
    NOW,
  );
  assert.deepEqual(stale, { action: "cancel", reason: "draft_abandoned" });

  const fresh = decideOrderExpiry(
    order({ status: "draft", createdAt: ago((IDLE_DRAFT_TTL_HOURS - 1) * 3_600_000) }),
    NOW,
  );
  assert.equal(fresh.action, "keep");
});

test("draft age is measured from the LAST TOUCH, not creation", () => {
  // A cart someone is still adding to is not abandoned, however long ago they
  // started it.
  const d = decideOrderExpiry(
    order({
      status: "draft",
      createdAt: ago(30 * 86_400_000),
      updatedAt: ago(60_000),
    }),
    NOW,
  );
  assert.equal(d.action, "keep", "a cart touched a minute ago is not abandoned");
});

test("the held fuse is much shorter than the idle fuse — the whole point", () => {
  const heldStale = decideOrderExpiry(order({ holdExpiresAt: ago(1_000) }), NOW);
  const draftSameAge = decideOrderExpiry(
    order({ status: "draft", createdAt: ago(16 * 60_000), updatedAt: ago(16 * 60_000) }),
    NOW,
  );
  assert.equal(heldStale.action, "cancel");
  assert.equal(draftSameAge.action, "keep");
});

test("an unparseable timestamp keeps the order rather than guessing", () => {
  assert.equal(decideOrderExpiry(order({ holdExpiresAt: "not-a-date" }), NOW).action, "keep");
  assert.equal(
    decideOrderExpiry(order({ status: "draft", createdAt: "nonsense", updatedAt: null }), NOW).action,
    "keep",
  );
});
