/**
 * The claim table is keyed on one column and more than one route processes
 * Stripe events, so the lane prefix is the thing standing between us and a
 * webhook that silently never runs. These assert that shape directly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { laneScopedEventKey } from "./event-idempotency";

describe("laneScopedEventKey", () => {
  test("the platform lane keeps the bare event id", () => {
    // Rows already in stripe_processed_events were written with the bare id.
    // Prefixing the platform lane would orphan every one of them and let a
    // long-delayed retry of an old event be processed a second time.
    assert.equal(laneScopedEventKey("platform", "evt_123"), "evt_123");
  });

  test("a non-platform lane is namespaced", () => {
    assert.equal(
      laneScopedEventKey("discover_client_subscription", "evt_123"),
      "discover_client_subscription:evt_123",
    );
  });

  test("the same event id in two lanes produces two distinct keys", () => {
    // This is the whole point. Both endpoints subscribe to
    // customer.subscription.updated, so Stripe delivers the SAME event.id to
    // both URLs. With one shared key the first POST to land would win the claim
    // and the other handler would short-circuit as "already processed" without
    // ever running.
    const platform = laneScopedEventKey("platform", "evt_shared");
    const discover = laneScopedEventKey("discover_client_subscription", "evt_shared");
    assert.notEqual(platform, discover);
  });

  test("keys are stable across calls", () => {
    // A claim and its release must resolve to the same row.
    assert.equal(
      laneScopedEventKey("discover_client_subscription", "evt_abc"),
      laneScopedEventKey("discover_client_subscription", "evt_abc"),
    );
  });
});
