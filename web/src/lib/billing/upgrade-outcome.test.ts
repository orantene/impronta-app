import { test } from "node:test";
import assert from "node:assert/strict";

import { upgradeOutcome } from "./upgrade-outcome";

test("new subscriber goes to Stripe Checkout", () => {
  assert.deepEqual(upgradeOutcome({ ok: true, redirectUrl: "https://checkout.stripe.com/c/x" }), {
    kind: "checkout",
    url: "https://checkout.stripe.com/c/x",
  });
});

test("existing subscriber opens the in-app plan change, never a 2nd checkout", () => {
  const target = { planKey: "talent_portfolio", interval: "year" } as const;
  const out = upgradeOutcome({ ok: true, redirectUrl: "https://billing.stripe.com/p/x", planChange: target });
  assert.equal(out.kind, "plan_change");
});

test("errors stay in the modal", () => {
  assert.deepEqual(upgradeOutcome({ ok: false, error: "nope" }), { kind: "error", message: "nope" });
});
