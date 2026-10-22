import assert from "node:assert/strict";
import { test } from "node:test";

import { assertTestKey, buildPortalConfiguration, SEED_TAG } from "./seed-stripe-portal-config.mjs";

test("refuses live keys and anything not sk_test_", () => {
  assert.throws(() => assertTestKey("K", "sk_live_abc"), /not a TEST key/);
  assert.throws(() => assertTestKey("K", "rk_live_abc"), /not a TEST key/);
  assert.equal(assertTestKey("K", "sk_test_abc"), "sk_test_abc");
  assert.equal(assertTestKey("K", undefined), null);
});

test("portal config sets every feature explicitly", () => {
  const cfg = buildPortalConfiguration([{ product: "prod_1", prices: ["price_1"] }]);
  assert.equal(cfg.metadata.tulala_seed, SEED_TAG);
  const f = cfg.features;
  assert.equal(f.invoice_history.enabled, true);
  assert.equal(f.payment_method_update.enabled, true);
  assert.equal(f.subscription_cancel.mode, "at_period_end");
  assert.equal(f.subscription_update.proration_behavior, "create_prorations");
  assert.deepEqual(f.subscription_update.products, [{ product: "prod_1", prices: ["price_1"] }]);
});

test("audience configurations carry their own seed tag and key set (P2)", async () => {
  const m = await import("./seed-stripe-portal-config.mjs");
  const cfg = m.buildPortalConfiguration([{ product: "prod_t", prices: ["price_t"] }], "talent");
  assert.equal(cfg.metadata.tulala_seed, m.audienceTag("talent"));
  assert.notEqual(cfg.metadata.tulala_seed, SEED_TAG);
  const talentKeys = m.audienceLookupKeys("talent");
  assert.ok(talentKeys.every((k: string) => k.includes("talent_")));
  const wsKeys = m.audienceLookupKeys("workspace");
  assert.ok(wsKeys.every((k: string) => !k.includes("talent_")));
  assert.equal(talentKeys.length + wsKeys.length, m.LOOKUP_KEYS.length);
});
