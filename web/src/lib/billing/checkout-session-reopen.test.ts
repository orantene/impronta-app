import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { checkoutSessionKey, stableParamsJson } from "./checkout-session-key";
import { reopenIfExpired, REOPEN_MAX_HOPS, reopenKey } from "./checkout-session-reopen";
import { sweepTrialSessions, TRIAL_SESSION_MARKER } from "./trial-checkout-session";

/**
 * TUL-1280 money review P1: Pro (A) -> Portfolio (B, sweep expires A) -> Pro
 * again. Key A REPLAYS Stripe's cached session A, which is now EXPIRED: a dead
 * Checkout URL for 24h. After create we re-key from the expired id until we
 * hold an OPEN session. Fake Stripe: records key + params, replays the cached
 * response for a reused key, throws on a reused key with different params.
 */

type Session = { id: string; status: "open" | "expired" | "complete"; url: string; metadata: Record<string, string> };

function fakeStripe() {
  const sessions: Session[] = [];
  const byKey = new Map<string, { json: string; snapshot: Session }>();
  const creates: { key: string; params: Record<string, unknown> }[] = [];
  let n = 0;
  const stripe = {
    checkout: {
      sessions: {
        list: async (_p: { customer: string; status: "open"; limit: number }) => ({
          data: sessions.filter((s) => s.status === "open").map((s) => ({ ...s })),
        }),
        expire: async (id: string) => {
          const s = sessions.find((x) => x.id === id);
          if (s) s.status = "expired";
          return {};
        },
        create: async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
          const json = stableParamsJson(params);
          const cached = byKey.get(opts.idempotencyKey);
          if (cached) {
            if (cached.json !== json) {
              throw new Error("Keys for idempotent requests can only be used with the same parameters they were first used with.");
            }
            return { ...cached.snapshot }; // a replay: the response as it was, status "open"
          }
          const s: Session = {
            id: `cs_test_${String(++n).padStart(10, "0")}`,
            status: "open",
            url: `https://checkout.stripe.test/${n}`,
            metadata: (params.metadata as Record<string, string>) ?? {},
          };
          sessions.push(s);
          byKey.set(opts.idempotencyKey, { json, snapshot: { ...s } });
          creates.push({ key: opts.idempotencyKey, params });
          return { ...s };
        },
        retrieve: async (id: string) => ({ ...sessions.find((x) => x.id === id)! }),
      },
    },
  };
  return { stripe, sessions, creates };
}

const PLAN_PRICE = { talent_pro: "price_test_pro", talent_portfolio: "price_test_portfolio" } as const;
type Plan = keyof typeof PLAN_PRICE;

/** Mirrors talent-billing: params -> key -> sweep -> create (+ marker) -> reopen. */
async function click(f: ReturnType<typeof fakeStripe>, plan: Plan) {
  const sessionParams = {
    customer: "cus_test_1",
    mode: "subscription",
    line_items: [{ price: PLAN_PRICE[plan], quantity: 1 }],
    metadata: { plan_key: plan, checkout_type: "talent_subscription" },
    subscription_data: { metadata: { plan_key: plan }, trial_period_days: 14 },
    discounts: [{ coupon: "co_test" }],
  };
  const idempotencyKey = checkoutSessionKey(`cs_talent_p1_${plan}`, sessionParams);
  const sweep = await sweepTrialSessions(f.stripe, "cus_test_1", 14, idempotencyKey, () => {});
  const createParams = { ...sessionParams, metadata: { ...sessionParams.metadata, ...sweep.marker } };
  const created = await f.stripe.checkout.sessions.create(createParams, { idempotencyKey });
  const session = await reopenIfExpired(f.stripe, created, createParams, idempotencyKey, sweep.expiredIds);
  return { session, createParams, idempotencyKey };
}

const live = (f: ReturnType<typeof fakeStripe>, id: string) => f.sessions.find((s) => s.id === id)!.status;

test("A -> B -> A: the third click ends with an OPEN session after exactly one retry", async () => {
  const f = fakeStripe();
  const a = await click(f, "talent_pro");
  const b = await click(f, "talent_portfolio");
  assert.equal(live(f, a.session.id), "expired", "B's sweep expired A");
  const before = f.creates.length;
  const again = await click(f, "talent_pro");
  assert.equal(live(f, again.session.id), "open");
  assert.notEqual(again.session.id, a.session.id);
  assert.equal(live(f, b.session.id), "expired", "the Pro sweep expired B");
  assert.equal(f.creates.length - before, 1, "exactly one retry created one new session");
  const retry = f.creates.at(-1)!;
  assert.equal(retry.key, reopenKey(again.idempotencyKey, a.session.id));
  assert.deepEqual(retry.params, again.createParams, "amounts, coupons and metadata unchanged on the retry");
  assert.equal(f.sessions.filter((s) => s.status === "open").length, 1);
});

test("a second A -> B -> A cycle also ends OPEN (re-keys from the newest expired id)", async () => {
  const f = fakeStripe();
  await click(f, "talent_pro");
  await click(f, "talent_portfolio");
  await click(f, "talent_pro");
  const b2 = await click(f, "talent_portfolio");
  assert.equal(live(f, b2.session.id), "open");
  const a3 = await click(f, "talent_pro");
  assert.equal(live(f, a3.session.id), "open");
  assert.equal(f.sessions.filter((s) => s.status === "open").length, 1);
});

test("double click on the same plan: no retry, same open session (dedupe preserved)", async () => {
  const f = fakeStripe();
  const one = await click(f, "talent_pro");
  const two = await click(f, "talent_pro");
  assert.equal(two.session.id, one.session.id);
  assert.equal(f.creates.length, 1);
});

test("the re-key is deterministic and keeps the readable base", () => {
  assert.equal(reopenKey("cs_talent_x_pabc", "cs_test_0000000042"), "cs_talent_x_pabc:r:00000042");
});

test("a session swept in THIS request is re-keyed without a retrieve", async () => {
  let retrieves = 0;
  const created: string[] = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (_p: object, o: { idempotencyKey: string }) => {
          created.push(o.idempotencyKey);
          return { id: "cs_new_00000001", status: "open" as const };
        },
        retrieve: async () => {
          retrieves += 1;
          return { status: "open" };
        },
      },
    },
  };
  const s = await reopenIfExpired(stripe, { id: "cs_swept_00000009", status: "open" as const }, {}, "k", new Set(["cs_swept_00000009"]));
  assert.equal(s.id, "cs_new_00000001");
  assert.deepEqual(created, ["k:r:00000009"]);
  assert.equal(retrieves, 1, "only the NEW session is checked");
});

test("never ends on an expired session: after the hop cap it throws (checkout shows its error)", async () => {
  const stripe = {
    checkout: {
      sessions: {
        create: async (_p: object, o: { idempotencyKey: string }) => ({ id: `cs_${o.idempotencyKey.length}_xxxxxxxx`, status: "open" as const }),
        retrieve: async () => ({ status: "expired" }),
      },
    },
  };
  await assert.rejects(reopenIfExpired(stripe, { id: "cs_dead_00000001", status: "open" as const }, {}, "k", new Set()));
  assert.ok(REOPEN_MAX_HOPS >= 3);
});

test("sweepTrialSessions reports the ids it expired and keeps the same-key session", async () => {
  const f = fakeStripe();
  f.sessions.push(
    { id: "cs_other", status: "open", url: "u1", metadata: { [TRIAL_SESSION_MARKER]: "other" } },
    { id: "cs_same", status: "open", url: "u2", metadata: { [TRIAL_SESSION_MARKER]: "k" } },
    { id: "cs_plain", status: "open", url: "u3", metadata: {} },
  );
  const r = await sweepTrialSessions(f.stripe, "cus_test_1", 14, "k", () => {});
  assert.deepEqual([...r.expiredIds], ["cs_other"]);
  assert.deepEqual(r.marker, { [TRIAL_SESSION_MARKER]: "k" });
  assert.deepEqual(await sweepTrialSessions(f.stripe, "cus_test_1", null, "k", () => {}), { marker: {}, expiredIds: new Set(), otherTrialKnownOpen: false });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: both checkouts re-open an expired replay right after create, trial sessions only", () => {
  for (const file of ["src/lib/stripe/talent-billing.ts", "src/lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    const create = src.indexOf("stripe.checkout.sessions.create(");
    const reopen = src.indexOf("await reopenIfExpired(stripe, created, createParams, idempotencyKey, trialSweep.expiredIds)");
    assert.ok(create > 0 && reopen > create, `${file} re-opens after create`);
    assert.match(src, /trialDays != null\s*\?\s*await reopenIfExpired\(/, `${file} only for trial sessions`);
    assert.match(src, /const createParams: Stripe\.Checkout\.SessionCreateParams = \{ \.\.\.sessionParams, metadata: \{ \.\.\.sessionParams\.metadata, \.\.\.trialSweep\.marker \} \};/);
  }
});
