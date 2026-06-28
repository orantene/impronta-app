/**
 * Phase D — Discover Pro gate decision tests.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      tsx --test src/lib/discover/pro-gate.test.ts
 * (the require hook stubs `server-only`, which client-subscription.ts imports.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideProGate } from "@/lib/discover/pro-gate";
import type { ClientSubscription } from "@/lib/discover/client-subscription";

const STANDARD: ClientSubscription = {
  tier: "standard",
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};
const PRO: ClientSubscription = {
  tier: "pro",
  status: "active",
  currentPeriodEnd: "2030-01-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
};
const ENTERPRISE: ClientSubscription = { ...PRO, tier: "enterprise" };

test("single-talent send is free for everyone (standard tier)", () => {
  assert.deepEqual(
    decideProGate({ routableTalentCount: 1, subscription: STANDARD }),
    { allowed: true },
  );
});

test("zero routable talents is allowed (nothing to gate; fan-out will 400 later)", () => {
  assert.deepEqual(
    decideProGate({ routableTalentCount: 0, subscription: STANDARD }),
    { allowed: true },
  );
});

test("multi-talent send requires Pro — standard tier is blocked", () => {
  assert.deepEqual(
    decideProGate({ routableTalentCount: 2, subscription: STANDARD }),
    { allowed: false, reason: "pro_required" },
  );
  assert.deepEqual(
    decideProGate({ routableTalentCount: 5, subscription: STANDARD }),
    { allowed: false, reason: "pro_required" },
  );
});

test("multi-talent send is allowed for Pro and Enterprise", () => {
  assert.deepEqual(
    decideProGate({ routableTalentCount: 3, subscription: PRO }),
    { allowed: true },
  );
  assert.deepEqual(
    decideProGate({ routableTalentCount: 3, subscription: ENTERPRISE }),
    { allowed: true },
  );
});

test("a non-active (downgraded) Pro subscription is treated as standard → blocked on multi", () => {
  // loadClientSubscription downgrades non-active tiers to 'standard' before this
  // point, so a stale/past_due row arrives here as standard and is blocked.
  const downgraded: ClientSubscription = { ...STANDARD, status: "past_due" };
  assert.deepEqual(
    decideProGate({ routableTalentCount: 2, subscription: downgraded }),
    { allowed: false, reason: "pro_required" },
  );
});
