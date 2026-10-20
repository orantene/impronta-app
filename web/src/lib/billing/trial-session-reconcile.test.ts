import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { TRIAL_SESSION_MARKER, sweepTrialSessions } from "./trial-checkout-session";
import { checkoutSessionKey, stableParamsJson } from "./checkout-session-key";
import { reopenIfExpired } from "./checkout-session-reopen";
import { TRIAL_PRICE_IDENTITY, trialPriceIdentity } from "./trial-price-identity";
import {
  TRIAL_RACE_RETRY_ERROR,
  pickTrialWinner,
  reconcileTrialSession,
  type ReconcileSession,
  type ReconcileStripe,
} from "./trial-session-reconcile";

/**
 * TUL-1280 race close: two trial Checkout sessions created in the same instant.
 * Create-then-reconcile, oldest (created asc, id asc) wins. Fake Stripe with a
 * shared session store so creates and lists can be interleaved by hand.
 */

type Stored = ReconcileSession & { status: "open" | "expired"; amount: number; coupon: string | null };

function store() {
  const sessions: Stored[] = [];
  const expireCalls: string[] = [];
  let listFails = 0;
  const stripe: ReconcileStripe = {
    checkout: {
      sessions: {
        list: async (p) => {
          if (listFails > 0) {
            listFails -= 1;
            throw new Error("stripe down");
          }
          assert.equal(p.status, "open");
          return { data: sessions.filter((s) => s.status === "open").map((s) => ({ ...s })), has_more: false };
        },
        expire: async (id) => {
          expireCalls.push(id);
          const s = sessions.find((x) => x.id === id);
          if (s) s.status = "expired";
          return {};
        },
      },
    },
  };
  const create = (id: string, created: number, trial = true): Stored => {
    const s: Stored = {
      id,
      created,
      url: `https://checkout.stripe.test/${id}`,
      metadata: trial ? { checkout_type: "talent_subscription", [TRIAL_SESSION_MARKER]: `key_${id}` } : { checkout_type: "x" },
      status: "open",
      amount: 1200,
      coupon: "co_test",
    };
    sessions.push(s);
    return s;
  };
  return { stripe, sessions, expireCalls, create, failList: (n: number) => (listFails = n) };
}

const noLog = () => {};
const reconcile = (st: ReturnType<typeof store>, s: Stored, otherTrialKnownOpen = false, onError = noLog) =>
  reconcileTrialSession(st.stripe, "cus_test_1", { id: s.id, url: s.url! }, { otherTrialKnownOpen, onError });
const openTrial = (st: ReturnType<typeof store>) =>
  st.sessions.filter((s) => s.status === "open" && s.metadata?.[TRIAL_SESSION_MARKER]);

test("A create, B create, A list, B list: exactly one survives, the oldest, both callers get its URL", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  const ra = await reconcile(st, a);
  const rb = await reconcile(st, b);
  assert.deepEqual(openTrial(st).map((s) => s.id), ["cs_a"]);
  assert.deepEqual(ra, { url: a.url });
  assert.deepEqual(rb, { url: a.url }, "the loser is sent to the winner's checkout");
});

test("B create+list before A lists: still exactly one survivor, the oldest", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  const rb = await reconcile(st, b);
  const ra = await reconcile(st, a);
  assert.deepEqual(openTrial(st).map((s) => s.id), ["cs_a"]);
  assert.deepEqual([ra, rb], [{ url: a.url }, { url: a.url }]);
});

test("A create+list before B exists: A keeps, B (sees A) expires itself", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  assert.deepEqual(await reconcile(st, a), { url: a.url });
  const b = st.create("cs_b", 101);
  assert.deepEqual(await reconcile(st, b), { url: a.url });
  assert.deepEqual(openTrial(st).map((s) => s.id), ["cs_a"]);
});

test("same-second tie: id breaks it deterministically; one survivor, never two", async () => {
  const st = store();
  const late = st.create("cs_z", 100);
  assert.deepEqual(await reconcile(st, late), { url: late.url }, "alone, it keeps itself");
  const early = st.create("cs_a", 100); // same second, smaller id: the deterministic winner
  assert.deepEqual(await reconcile(st, early), { url: early.url });
  assert.deepEqual(openTrial(st).map((s) => s.id), ["cs_a"]);
});

/** Every interleaving of 3 creators where each lists after its own create. */
function interleavings(n: number): string[][] {
  const out: string[][] = [];
  const walk = (seq: string[], created: Set<number>, listed: Set<number>) => {
    if (seq.length === 2 * n) return void out.push(seq);
    for (let i = 0; i < n; i += 1) {
      if (!created.has(i)) walk([...seq, `c${i}`], new Set([...created, i]), listed);
      else if (!listed.has(i)) walk([...seq, `l${i}`], created, new Set([...listed, i]));
    }
  };
  walk([], new Set(), new Set());
  return out;
}

test("all 90 interleavings of 3 concurrent creators: exactly one open trial session, the oldest", async () => {
  const orders = interleavings(3);
  assert.equal(orders.length, 90);
  for (const tie of [false, true]) {
    for (const order of orders) {
      const st = store();
      const mine: Record<number, Stored> = {};
      const results: Record<number, { url: string } | { error: string }> = {};
      let clock = 100;
      for (const step of order) {
        const i = Number(step.slice(1));
        if (step[0] === "c") mine[i] = st.create(`cs_${"xyz"[i]}`, tie ? 100 : clock++);
        else results[i] = await reconcile(st, mine[i]);
      }
      const open = openTrial(st);
      assert.equal(open.length, 1, `${order.join(" ")} tie=${tie}`);
      const oldest = pickTrialWinner(st.sessions)!;
      assert.equal(open[0].id, oldest.id, "the survivor is the oldest; nobody expires it");
      if (!tie) {
        for (const r of Object.values(results)) assert.deepEqual(r, { url: oldest.url }, order.join(" "));
      }
    }
  }
});

test("non-trial sessions are never expired and never win", async () => {
  const st = store();
  const other = st.create("cs_booking", 1, false);
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  await reconcile(st, b);
  await reconcile(st, a);
  assert.equal(other.status, "open");
  assert.ok(!st.expireCalls.includes("cs_booking"));
  assert.deepEqual(openTrial(st).map((s) => s.id), ["cs_a"]);
});

test("amounts and coupons of the surviving session are untouched (reconcile never creates or edits)", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  await reconcile(st, b);
  await reconcile(st, a);
  assert.deepEqual([a.amount, a.coupon, a.metadata], [1200, "co_test", { checkout_type: "talent_subscription", [TRIAL_SESSION_MARKER]: "key_cs_a" }]);
  assert.equal(st.sessions.length, 2, "no session was created by reconcile");
});

test("list error after one retry, no other trial known: keep own session, log", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  st.failList(2);
  const errors: string[] = [];
  assert.deepEqual(await reconcile(st, a, false, (w) => errors.push(w)), { url: a.url });
  assert.equal(a.status, "open");
  assert.deepEqual(errors, ["billing.trialSession.reconcileList"]);
});

test("list error with another trial session known open: fail CLOSED, expire own, retryable error", async () => {
  const st = store();
  st.create("cs_old", 90);
  const a = st.create("cs_a", 100);
  st.failList(2);
  assert.deepEqual(await reconcile(st, a, true), { error: TRIAL_RACE_RETRY_ERROR });
  assert.equal(a.status, "expired");
});

test("a single transient list error is retried", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  st.failList(1);
  assert.deepEqual(await reconcile(st, b), { url: a.url });
  assert.equal(b.status, "expired");
});

test("own session already expired (replayed idempotency key): winner URL, else retryable error", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  b.status = "expired";
  assert.deepEqual(await reconcile(st, b), { url: a.url });
  a.status = "expired";
  assert.deepEqual(await reconcile(st, b), { error: TRIAL_RACE_RETRY_ERROR });
});

test("winner without a URL: retryable error, own still expired", async () => {
  const st = store();
  const a = st.create("cs_a", 100);
  a.url = null;
  const b = st.create("cs_b", 101);
  assert.deepEqual(await reconcile(st, b), { error: TRIAL_RACE_RETRY_ERROR });
  assert.equal(b.status, "expired");
});

test("sweepTrialSessions reports another trial session it could not expire", async () => {
  const fake = {
    checkout: {
      sessions: {
        list: async () => ({ data: [{ id: "cs_old", metadata: { [TRIAL_SESSION_MARKER]: "old" } }] }),
        expire: async () => {
          throw new Error("nope");
        },
      },
    },
  };
  const r = await sweepTrialSessions(fake, "cus_test_1", 14, "k", noLog);
  assert.deepEqual(r, { marker: { [TRIAL_SESSION_MARKER]: "k" }, expiredIds: new Set(), otherTrialKnownOpen: true });
  assert.deepEqual(await sweepTrialSessions(fake, "cus_test_1", null, "k", noLog), {
    marker: {},
    expiredIds: new Set(),
    otherTrialKnownOpen: false,
  });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: both checkouts reconcile AFTER create, only for trial sessions, create call unchanged", () => {
  for (const file of ["src/lib/stripe/talent-billing.ts", "src/lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    const create = src.indexOf("stripe.checkout.sessions.create(");
    const rec = src.indexOf("await reconcileTrialSession(");
    assert.ok(create > 0 && rec > create, `${file} reconciles after create`);
    assert.match(src, /trialDays != null\s*\?\s*await reconcileTrialSession\(/, `${file} reconciles only trial sessions`);
    assert.match(src, /\{ idempotencyKey \}/, `${file} keeps its idempotency key`);
    assert.match(src, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
    assert.match(src, /\.\.\.discount\.params,/);
    assert.match(src, /metadata: \{ \.\.\.sessionParams\.metadata, \.\.\.trialSweep\.marker \}/);
    assert.match(src, /requestedPriceIdentity: priceIdentity/, `${file} passes the requested price identity`);
    assert.match(src, /\[TRIAL_PRICE_IDENTITY\]: priceIdentity/, `${file} stamps the identity on trial sessions`);
    assert.match(src, /const priceIdentity = trialPriceIdentity\(\{ planKey: opts\.planKey, interval: price\.interval, priceId, discount: discount\.params \}\);/, `${file} builds the identity from the sent price + discount`);
    assert.ok(src.indexOf("await reopenIfExpired(") < src.indexOf("await reconcileTrialSession("), `${file} re-opens before reconciling`);
  }
});

const PRO_MONTH = { planKey: "talent_pro", interval: "month", priceId: "price_test_pro_month_usd", discount: { allow_promotion_codes: true } };

/** Two open trial sessions: A (older, winner) with identity `a`, B (loser) asking for identity `b`. */
async function raceWith(a: Parameters<typeof trialPriceIdentity>[0], b: Parameters<typeof trialPriceIdentity>[0]) {
  const st = store();
  const winner = st.create("cs_a", 100);
  winner.metadata = { ...winner.metadata!, plan_key: a.planKey, [TRIAL_PRICE_IDENTITY]: trialPriceIdentity(a) };
  const loser = st.create("cs_b", 101);
  loser.metadata = { ...loser.metadata!, plan_key: b.planKey, [TRIAL_PRICE_IDENTITY]: trialPriceIdentity(b) };
  const r = await reconcileTrialSession(st.stripe, "cus_test_1", { id: loser.id, url: loser.url! }, {
    otherTrialKnownOpen: false,
    requestedPriceIdentity: trialPriceIdentity(b),
    onError: noLog,
  });
  return { r, winner, loser };
}

test("P1 wrong price: a winner with ANY different price identity gives the retry error, never its URL", async () => {
  const cases: [string, Parameters<typeof trialPriceIdentity>[0]][] = [
    ["different plan", { ...PRO_MONTH, planKey: "talent_portfolio", priceId: "price_test_portfolio_month_usd" }],
    ["interval (Pro-month vs Pro-year)", { ...PRO_MONTH, interval: "year", priceId: "price_test_pro_year_usd" }],
    ["interval only (same price id string)", { ...PRO_MONTH, interval: "year" }],
    ["currency (USD vs MXN price)", { ...PRO_MONTH, priceId: "price_test_pro_month_mxn" }],
    ["promo / discount", { ...PRO_MONTH, discount: { discounts: [{ promotion_code: "promo_test_10" }] } }],
    ["coupon", { ...PRO_MONTH, discount: { discounts: [{ coupon: "co_test_half" }] } }],
  ];
  for (const [name, winnerIdentity] of cases) {
    const { r, winner, loser } = await raceWith(winnerIdentity, PRO_MONTH);
    assert.deepEqual(r, { error: TRIAL_RACE_RETRY_ERROR }, name);
    assert.equal(loser.status, "expired", `${name}: the loser still expires itself`);
    assert.equal(winner.status, "open", `${name}: the winner survives`);
  }
});

test("identical price identity: the loser gets the winner's URL", async () => {
  const { r, winner } = await raceWith(PRO_MONTH, { ...PRO_MONTH });
  assert.deepEqual(r, { url: winner.url });
});

test("a winner WITHOUT an identity (created before this change) is treated as a mismatch", async () => {
  const st = store();
  st.create("cs_a", 100);
  const b = st.create("cs_b", 101);
  const r = await reconcileTrialSession(st.stripe, "cus_test_1", { id: b.id, url: b.url! }, {
    otherTrialKnownOpen: false,
    requestedPriceIdentity: trialPriceIdentity(PRO_MONTH),
    onError: noLog,
  });
  assert.deepEqual(r, { error: TRIAL_RACE_RETRY_ERROR });
});

test("trialPriceIdentity: deterministic, key-order independent, readable prefix, short", () => {
  const a = trialPriceIdentity({ ...PRO_MONTH, discount: { discounts: [{ coupon: "c", x: 1 }] } });
  const b = trialPriceIdentity({ ...PRO_MONTH, discount: { discounts: [{ x: 1, coupon: "c" }] } });
  assert.equal(a, b);
  assert.ok(a.startsWith("talent_pro|month|price_test_pro_month_usd|d:"), a);
  assert.ok(a.length <= 120);
});

/** Full flow fake: list/expire/create (idempotent replay, reuse-with-other-params throws)/retrieve. */
function flowStripe() {
  type S = { id: string; created: number; status: "open" | "expired"; url: string; metadata: Record<string, string> };
  const sessions: S[] = [];
  const byKey = new Map<string, { json: string; snap: S }>();
  let n = 0;
  const stripe = {
    checkout: {
      sessions: {
        list: async () => ({ data: sessions.filter((s) => s.status === "open").map((s) => ({ ...s })), has_more: false }),
        expire: async (id: string) => {
          const s = sessions.find((x) => x.id === id);
          if (s) s.status = "expired";
          return {};
        },
        create: async (params: { metadata: Record<string, string> }, o: { idempotencyKey: string }) => {
          const json = stableParamsJson(params);
          const hit = byKey.get(o.idempotencyKey);
          if (hit) {
            if (hit.json !== json) throw new Error("Keys for idempotent requests can only be used with the same parameters");
            return { ...hit.snap };
          }
          n += 1;
          const s: S = { id: `cs_test_${String(n).padStart(8, "0")}`, created: 1000 + n, status: "open", url: `https://checkout.stripe.test/${n}`, metadata: params.metadata };
          sessions.push(s);
          byKey.set(o.idempotencyKey, { json, snap: { ...s } });
          return { ...s };
        },
        retrieve: async (id: string) => ({ ...sessions.find((x) => x.id === id)! }),
      },
    },
  };
  return { stripe, sessions };
}

async function flowClick(f: ReturnType<typeof flowStripe>, plan: string, interval = "month") {
  const identity = trialPriceIdentity({ planKey: plan, interval, priceId: `price_${plan}_${interval}`, discount: { allow_promotion_codes: true } });
  const sessionParams = {
    metadata: { plan_key: plan, billing_interval: interval, [TRIAL_PRICE_IDENTITY]: identity },
    line_items: [{ price: `price_${plan}_${interval}`, quantity: 1 }],
  };
  const key = checkoutSessionKey(`cs_talent_p1_${plan}_${interval}`, sessionParams);
  const sweep = await sweepTrialSessions(f.stripe, "cus_test_1", 14, key, noLog);
  const createParams = { ...sessionParams, metadata: { ...sessionParams.metadata, ...sweep.marker } };
  const created = await f.stripe.checkout.sessions.create(createParams, { idempotencyKey: key });
  const session = await reopenIfExpired(f.stripe, created, createParams, key, sweep.expiredIds);
  return reconcileTrialSession(f.stripe, "cus_test_1", { id: session.id, url: session.url }, {
    otherTrialKnownOpen: sweep.otherTrialKnownOpen,
    requestedPriceIdentity: identity,
    onError: noLog,
  });
}

test("A -> B -> A through sweep, re-open and reconcile: an OPEN session of the requested plan, twice over", async () => {
  const f = flowStripe();
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const a = await flowClick(f, "talent_pro");
    const b = await flowClick(f, "talent_portfolio");
    const again = await flowClick(f, "talent_pro");
    for (const [r, plan] of [[a, "talent_pro"], [b, "talent_portfolio"], [again, "talent_pro"]] as const) {
      assert.ok("url" in r, `cycle ${cycle} ${plan}: ${JSON.stringify(r)}`);
    }
    const open = f.sessions.filter((s) => s.status === "open");
    assert.equal(open.length, 1);
    assert.equal(open[0].metadata.plan_key, "talent_pro");
    assert.equal((again as { url: string }).url, open[0].url, "the URL handed back is the open session");
  }
});

test("two tabs at the same instant, Pro-month vs Pro-year: one open session; the loser gets the retry error", async () => {
  const f = flowStripe();
  // Both creates land before either reconciles (sweeps saw nothing).
  const mk = async (interval: string) => {
    const identity = trialPriceIdentity({ planKey: "talent_pro", interval, priceId: `price_talent_pro_${interval}`, discount: null });
    const createParams = { metadata: { plan_key: "talent_pro", [TRIAL_SESSION_MARKER]: `k_${interval}`, [TRIAL_PRICE_IDENTITY]: identity } };
    const s = await f.stripe.checkout.sessions.create(createParams, { idempotencyKey: `k_${interval}` });
    return { s, identity };
  };
  const month = await mk("month");
  const year = await mk("year");
  const rYear = await reconcileTrialSession(f.stripe, "cus_test_1", { id: year.s.id, url: year.s.url }, { otherTrialKnownOpen: false, requestedPriceIdentity: year.identity, onError: noLog });
  const rMonth = await reconcileTrialSession(f.stripe, "cus_test_1", { id: month.s.id, url: month.s.url }, { otherTrialKnownOpen: false, requestedPriceIdentity: month.identity, onError: noLog });
  assert.deepEqual(rMonth, { url: month.s.url });
  assert.deepEqual(rYear, { error: TRIAL_RACE_RETRY_ERROR }, "never the monthly Checkout for a yearly request");
  assert.equal(f.sessions.filter((s) => s.status === "open").length, 1);
});
