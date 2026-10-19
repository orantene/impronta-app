import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { checkoutSessionKey, stableParamsJson } from "./checkout-session-key";
import { checkoutIdempotencyKey } from "./checkout-interval";
import { trialParams } from "./trial-eligibility";
import { singleOpenTrialSession, TRIAL_SESSION_MARKER, type SessionStripe } from "./trial-checkout-session";

/**
 * TUL-1280 retest FAIL: cancel then re-checkout within 24h reused the
 * `cs_talent_<profile>_<plan>` key with different params (no trial now), and
 * Stripe refused: "Keys for idempotent requests can only be used with the same
 * parameters". The key must follow the params; identical params still dedupe.
 */

const STRIPE_REUSE_ERROR =
  "Keys for idempotent requests can only be used with the same parameters they were first used with.";

/** Records every create and behaves like Stripe's idempotency layer. */
function fakeStripe() {
  const byKey = new Map<string, { json: string; id: string }>();
  const creates: { key: string; params: unknown }[] = [];
  let n = 0;
  return {
    creates,
    create(params: Record<string, unknown>, opts: { idempotencyKey: string }) {
      const json = stableParamsJson(params);
      const seen = byKey.get(opts.idempotencyKey);
      if (seen) {
        if (seen.json !== json) throw new Error(STRIPE_REUSE_ERROR);
        return { id: seen.id, replayed: true };
      }
      const id = `cs_test_${++n}`;
      byKey.set(opts.idempotencyKey, { json, id });
      creates.push({ key: opts.idempotencyKey, params });
      return { id, replayed: false };
    },
  };
}

const PROFILE = "11111111-1111-4111-8111-111111111111";

/** The talent session shape (subset that varies), as talent-billing builds it. */
function talentParams(o: { plan?: string; interval?: "month" | "year"; trialDays: number | null; promo?: string | null; price?: string }) {
  return {
    customer: "cus_test_1",
    mode: "subscription",
    line_items: [{ price: o.price ?? "price_test_pro_month", quantity: 1 }],
    success_url: "https://app.test/t/talent/settings?billing=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://app.test/t/talent/settings?billing=cancelled",
    metadata: { talent_profile_id: PROFILE, plan_key: o.plan ?? "talent_pro", billing_interval: o.interval ?? "month" },
    subscription_data: { metadata: { plan_key: o.plan ?? "talent_pro" }, ...trialParams(o.trialDays) },
    ...(o.promo ? { discounts: [{ promotion_code: o.promo }] } : { allow_promotion_codes: true }),
    adaptive_pricing: { enabled: true },
  };
}

function keyFor(params: ReturnType<typeof talentParams>, plan = "talent_pro", interval: "month" | "year" = "month") {
  const base = checkoutIdempotencyKey({ prefix: "cs_talent", subjectId: PROFILE, planKey: plan, interval, suffix: "" });
  return checkoutSessionKey(base, params);
}

test("(a) trial checkout, then (after a cancel) no-trial checkout: different keys, no Stripe reuse error", () => {
  const stripe = fakeStripe();
  const first = talentParams({ trialDays: 14 });
  const again = talentParams({ trialDays: null });
  const k1 = keyFor(first);
  const k2 = keyFor(again);
  assert.notEqual(k1, k2);
  stripe.create(first, { idempotencyKey: k1 });
  assert.doesNotThrow(() => stripe.create(again, { idempotencyKey: k2 }));
  assert.equal(stripe.creates.length, 2, "the returning talent gets a fresh checkout");
  assert.equal("trial_period_days" in (stripe.creates[1].params as { subscription_data: object }).subscription_data, false);
});

test("the OLD key shape reproduces the retest failure (guards the fake)", () => {
  const stripe = fakeStripe();
  const old = checkoutIdempotencyKey({ prefix: "cs_talent", subjectId: PROFILE, planKey: "talent_pro", interval: "month", suffix: "" });
  stripe.create(talentParams({ trialDays: 14 }), { idempotencyKey: old });
  assert.throws(() => stripe.create(talentParams({ trialDays: null }), { idempotencyKey: old }), /same parameters/);
});

test("(b) identical params twice: same key, the double submit collapses to one session", () => {
  const stripe = fakeStripe();
  const p = talentParams({ trialDays: 14 });
  const k = keyFor(p);
  assert.equal(keyFor(talentParams({ trialDays: 14 })), k, "deterministic");
  const a = stripe.create(p, { idempotencyKey: k });
  const b = stripe.create(talentParams({ trialDays: 14 }), { idempotencyKey: keyFor(talentParams({ trialDays: 14 })) });
  assert.equal(b.id, a.id);
  assert.equal(b.replayed, true);
  assert.equal(stripe.creates.length, 1);
});

test("key ignores object key order (stable JSON) but not array order", () => {
  assert.equal(stableParamsJson({ a: 1, b: { d: 2, c: 3 } }), stableParamsJson({ b: { c: 3, d: 2 }, a: 1 }));
  assert.notEqual(stableParamsJson({ x: [1, 2] }), stableParamsJson({ x: [2, 1] }));
  assert.equal(stableParamsJson({ a: undefined, b: 1 }), stableParamsJson({ b: 1 }));
});

test("(c) different plan, interval, promo or price: different keys", () => {
  const base = keyFor(talentParams({ trialDays: 14 }));
  const others = [
    keyFor(talentParams({ trialDays: 14, plan: "talent_portfolio" }), "talent_portfolio"),
    keyFor(talentParams({ trialDays: 14, interval: "year" }), "talent_pro", "year"),
    keyFor(talentParams({ trialDays: 14, promo: "promo_test_1" })),
    keyFor(talentParams({ trialDays: 14, price: "price_test_pro_month_v2" })),
    keyFor(talentParams({ trialDays: 7 })),
  ];
  assert.equal(new Set([base, ...others]).size, 6);
});

test("key keeps the readable base prefix and stays within Stripe's 255-char limit", () => {
  const k = keyFor(talentParams({ trialDays: 14 }));
  assert.ok(k.startsWith(`cs_talent_${PROFILE}_talent_pro_p`), k);
  assert.ok(k.length <= 255);
});

test("(d) the trial marker carries the NEW key and the pre-create sweep keeps a same-key session", async () => {
  const k = keyFor(talentParams({ trialDays: 14 }));
  const expired: string[] = [];
  const stripe: SessionStripe = {
    checkout: {
      sessions: {
        list: async () => ({
          data: [
            { id: "cs_same", metadata: { [TRIAL_SESSION_MARKER]: k } },
            { id: "cs_other", metadata: { [TRIAL_SESSION_MARKER]: keyFor(talentParams({ trialDays: 14, plan: "talent_portfolio" }), "talent_portfolio") } },
          ],
        }),
        expire: async (id) => {
          expired.push(id);
          return {};
        },
      },
    },
  };
  assert.deepEqual(await singleOpenTrialSession(stripe, "cus_test_1", 14, k, () => {}), { [TRIAL_SESSION_MARKER]: k });
  assert.deepEqual(expired, ["cs_other"]);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: both checkouts key the session on the fingerprint of the exact params they send", () => {
  for (const file of ["src/lib/stripe/talent-billing.ts", "src/lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    assert.match(src, /const idempotencyKey = checkoutSessionKey\(\s*checkoutIdempotencyKey\(/, `${file} fingerprints the key`);
    assert.match(src, /checkoutSessionKey\([\s\S]*?,\s*sessionParams,?\s*\)/, `${file} fingerprints sessionParams`);
    assert.match(
      src,
      /stripe\.checkout\.sessions\.create\(\s*\{ \.\.\.sessionParams, metadata: \{ \.\.\.sessionParams\.metadata, \.\.\.trialMarker \} \},\s*(?:\/\/[^\n]*\s*)*\{ idempotencyKey \}/,
      `${file} sends sessionParams (+ the marker only) under that key`,
    );
  }
});
