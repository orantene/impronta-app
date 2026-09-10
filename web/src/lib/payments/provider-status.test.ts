import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProviderStatuses } from "./provider-status";

test("cash needs no setup", () => {
  const [cash] = computeProviderStatuses({});
  assert.equal(cash!.id, "cash");
  assert.equal(cash!.configured, true);
  assert.equal(cash!.reason, "no_setup_needed");
});

test("stripe checkout is unconfigured with no secret key, and blank strings do not count", () => {
  const noKey = computeProviderStatuses({});
  const checkout1 = noKey.find((p) => p.id === "stripe_checkout")!;
  assert.equal(checkout1.configured, false);
  assert.equal(checkout1.reason, "missing_secret_key");

  const blankKey = computeProviderStatuses({ stripeSecretKey: "   " });
  const checkout2 = blankKey.find((p) => p.id === "stripe_checkout")!;
  assert.equal(checkout2.configured, false);
  assert.equal(checkout2.reason, "missing_secret_key");
});

test("stripe checkout is ready once a secret key is present", () => {
  const statuses = computeProviderStatuses({ stripeSecretKey: "sk_test_x" });
  const checkout = statuses.find((p) => p.id === "stripe_checkout")!;
  assert.equal(checkout.configured, true);
  assert.equal(checkout.reason, "ready");
});

test("stripe terminal needs BOTH a key and a reader, and names which is missing", () => {
  const neitherStatus = computeProviderStatuses({});
  assert.equal(neitherStatus.find((p) => p.id === "stripe_terminal")!.reason, "missing_secret_key");

  const keyOnlyStatus = computeProviderStatuses({ stripeSecretKey: "sk_test_x" });
  const keyOnly = keyOnlyStatus.find((p) => p.id === "stripe_terminal")!;
  assert.equal(keyOnly.configured, false);
  assert.equal(keyOnly.reason, "missing_reader");

  const bothStatus = computeProviderStatuses({
    stripeSecretKey: "sk_test_x",
    stripeTerminalReaderId: "tmr_1",
  });
  const both = bothStatus.find((p) => p.id === "stripe_terminal")!;
  assert.equal(both.configured, true);
  assert.equal(both.reason, "ready");
});

// The honest-gap case this file exists for: Mercado Pago Point has an
// adapter but nothing wires a merchant token to it anywhere in this
// codebase. Reporting "ready" here — or even "missing_secret_key", which
// implies a place to put one — would be exactly the invented control the
// settings panel must never show. Breaking this by hand (flipping
// `configured` to `true` in provider-status.ts) turns this test red, which
// is the proof the guard is real.
test("mercado pago point is never reported configured — no key can make it so", () => {
  const statuses = computeProviderStatuses({
    stripeSecretKey: "sk_test_x",
    stripeTerminalReaderId: "tmr_1",
  });
  const mp = statuses.find((p) => p.id === "mercado_pago_point")!;
  assert.equal(mp.configured, false);
  assert.equal(mp.reason, "not_integrated");
});

test("every provider id appears exactly once", () => {
  const statuses = computeProviderStatuses({ stripeSecretKey: "sk_test_x", stripeTerminalReaderId: "tmr_1" });
  const ids = statuses.map((p) => p.id);
  assert.deepEqual([...ids].sort(), ["cash", "mercado_pago_point", "stripe_checkout", "stripe_terminal"].sort());
  assert.equal(new Set(ids).size, ids.length);
});
