import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  decideCheckoutTrialDays,
  dbShowsPriorSubscription,
  offeredTrialDays,
  stripeShowsPriorSubscription,
  trialParams,
  type HistoryRead,
  type StripeSubscriptionLite,
  type SubscriptionHistoryRow,
  type TrialEligibilityDeps,
} from "./trial-eligibility";
import {
  readStripeSubscriptionHistory,
  readTalentSubscriptionHistory,
  readWorkspaceSubscriptionHistory,
  type HistoryDb,
} from "./trial-eligibility-readers";

/** TUL-1280: one free trial per customer. Fakes only; no Supabase, no Stripe. */

const OFFER = { isEnabled: true, trialDays: 14 };
const PROFILE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function deps(opts: {
  db?: HistoryRead<SubscriptionHistoryRow> | Error;
  stripe?: HistoryRead<StripeSubscriptionLite> | Error;
}) {
  const calls = { db: 0, stripe: 0, errors: [] as string[] };
  const d: TrialEligibilityDeps = {
    readDbHistory: async () => {
      calls.db++;
      if (opts.db instanceof Error) throw opts.db;
      return opts.db ?? { data: [], error: null };
    },
    readStripeHistory: async () => {
      calls.stripe++;
      if (opts.stripe instanceof Error) throw opts.stripe;
      return opts.stripe ?? { data: [], error: null };
    },
    onError: (where) => calls.errors.push(where),
  };
  return { d, calls };
}

test("first-time customer (no DB rows, no Stripe subscriptions) gets the offered trial", async () => {
  const { d, calls } = deps({});
  assert.equal(await decideCheckoutTrialDays(OFFER, d), 14);
  assert.deepEqual([calls.db, calls.stripe], [1, 1]);
});

test("a DB row that ever trialed, or any paid status, means no trial", async () => {
  for (const row of [
    { status: "cancelled", trial_end: "2026-09-01T00:00:00Z" },
    { status: "active", trial_end: null },
    { status: "past_due", trial_end: null },
    { status: "trialing", trial_end: null },
    { status: "paused", trial_end: null },
    { status: "incomplete", trial_end: "2026-09-01T00:00:00Z" },
  ]) {
    const { d, calls } = deps({ db: { data: [row], error: null } });
    assert.equal(await decideCheckoutTrialDays(OFFER, d), null, JSON.stringify(row));
    assert.equal(calls.stripe, 0, "DB already refused; Stripe is not asked");
  }
});

test("canceled-then-resubscribing customer gets no second trial", async () => {
  const { d } = deps({ db: { data: [{ status: "cancelled", trial_end: null }], error: null } });
  assert.equal(await decideCheckoutTrialDays(OFFER, d), null);
  // DB row gone (e.g. profile changed) but Stripe still remembers the old trial.
  const viaStripe = deps({ stripe: { data: [{ status: "canceled", trial_start: 1_750_000_000 }], error: null } });
  assert.equal(await decideCheckoutTrialDays(OFFER, viaStripe.d), null);
});

test("a never-completed first checkout (incomplete, no trial) does not burn the trial", () => {
  assert.equal(dbShowsPriorSubscription([{ status: "incomplete_expired", trial_end: null }]), false);
  assert.equal(stripeShowsPriorSubscription([{ status: "incomplete_expired", trial_start: null }]), false);
  assert.equal(stripeShowsPriorSubscription([{ status: "canceled", trial_start: null }]), true);
});

test("DB says prior trial but Stripe unreachable: no trial", async () => {
  const { d } = deps({
    db: { data: [{ status: "cancelled", trial_end: "2026-09-01T00:00:00Z" }], error: null },
    stripe: new Error("ECONNRESET"),
  });
  assert.equal(await decideCheckoutTrialDays(OFFER, d), null);
});

test("Stripe read fails on a clean DB: fail closed, no trial, error logged", async () => {
  const { d, calls } = deps({ stripe: new Error("ECONNRESET") });
  assert.equal(await decideCheckoutTrialDays(OFFER, d), null);
  assert.deepEqual(calls.errors, ["billing.trialEligibility.stripe"]);
  assert.equal(calls.stripe, 1, "retries live per page in the Stripe reader");
});

test("both reads fail: no trial, logged, and the decision still resolves (checkout proceeds)", async () => {
  const a = deps({ db: new Error("pg down"), stripe: new Error("stripe down") });
  assert.equal(await decideCheckoutTrialDays(OFFER, a.d), null);
  assert.deepEqual(a.calls.errors, ["billing.trialEligibility.db"]);
  const b = deps({ db: { data: null, error: { message: "denied" } } });
  assert.equal(await decideCheckoutTrialDays(OFFER, b.d), null);
});

test("offer off (or zero days): no trial for anyone, and no history reads", async () => {
  for (const offer of [{ isEnabled: false, trialDays: 14 }, { isEnabled: true, trialDays: 0 }, null]) {
    const { d, calls } = deps({});
    assert.equal(await decideCheckoutTrialDays(offer, d), null);
    assert.deepEqual([calls.db, calls.stripe], [0, 0]);
  }
  assert.equal(offeredTrialDays({ isEnabled: true, trialDays: 30 }), 30, "trial length unchanged");
});

test("trialParams: ineligible checkout sends NO trial_period_days key at all", () => {
  assert.deepEqual(trialParams(null), {});
  assert.equal("trial_period_days" in trialParams(null), false);
  assert.deepEqual(trialParams(14), { trial_period_days: 14 });
});

test("invariance: only the trial key differs between eligible and ineligible sessions", () => {
  const base = {
    line_items: [{ price: "price_test_pro_month", quantity: 1 }],
    discounts: [{ coupon: "co_test" }],
    subscription_data: { metadata: { plan_key: "talent_pro" } },
  };
  const build = (days: number | null) => ({
    ...base,
    subscription_data: { ...base.subscription_data, ...trialParams(days) },
  });
  const eligible = build(14);
  const ineligible = build(null);
  assert.deepEqual(ineligible.line_items, eligible.line_items);
  assert.deepEqual(ineligible.discounts, eligible.discounts);
  assert.deepEqual(ineligible.subscription_data.metadata, eligible.subscription_data.metadata);
  assert.deepEqual(ineligible, base);
});

function fakeDb(result: { data: unknown; error: unknown }) {
  const seen: string[] = [];
  type Chain = Promise<{ data: unknown; error: unknown }> & {
    eq: (c: string, v: string) => Chain;
    in: (c: string, v: readonly string[]) => Chain;
    or: (f: string) => Chain;
    limit: (n: number) => Chain;
  };
  const chain: Chain = Object.assign(Promise.resolve(result), {
    eq: (c: string, v: string) => (seen.push(`eq:${c}=${v}`), chain),
    in: (c: string, v: readonly string[]) => (seen.push(`in:${c}=${v.join("|")}`), chain),
    or: (f: string) => (seen.push(`or:${f}`), chain),
    limit: (n: number) => (seen.push(`limit:${n}`), chain),
  });
  const db: HistoryDb = {
    from: (t: string) => (seen.push(`from:${t}`), { select: (c: string) => (seen.push(`select:${c}`), chain) }),
  };
  return { db, seen };
}

test("talent reader: profile OR user rows, read-only select of status + trial_end", async () => {
  const { db, seen } = fakeDb({ data: [{ status: "cancelled", trial_end: null }], error: null });
  const r = await readTalentSubscriptionHistory(db, { talentProfileId: PROFILE, userId: USER });
  assert.deepEqual(r, { data: [{ status: "cancelled", trial_end: null }], error: null });
  assert.deepEqual(seen.slice(0, 3), [
    "from:talent_subscriptions",
    "select:status, trial_end",
    `or:talent_profile_id.eq.${PROFILE},user_id.eq.${USER}`,
  ]);
});

test("talent reader refuses a non-uuid id as an error (fails closed, no filter splicing)", async () => {
  const { db, seen } = fakeDb({ data: [], error: null });
  const r = await readTalentSubscriptionHistory(db, { talentProfileId: "x,user_id.neq.0", userId: USER });
  assert.ok(r.error);
  assert.equal(seen.length, 0);
});

test("workspace reader and error passthrough", async () => {
  const ok = fakeDb({ data: [], error: null });
  assert.deepEqual(await readWorkspaceSubscriptionHistory(ok.db, "t1"), { data: [], error: null });
  assert.ok(ok.seen.includes("eq:tenant_id=t1"));
  const bad = fakeDb({ data: null, error: { message: "denied" } });
  assert.deepEqual(await readWorkspaceSubscriptionHistory(bad.db, "t1"), { data: null, error: { message: "denied" } });
});

test("Stripe reader lists every status for the customer (read-only list call)", async () => {
  const params: unknown[] = [];
  const stripe = {
    subscriptions: {
      list: async (p: { customer: string; status: "all"; limit: number }) => {
        params.push(p);
        return { data: [{ id: "sub_1", status: "canceled", trial_start: 1 }], has_more: false };
      },
    },
  };
  const r = await readStripeSubscriptionHistory(stripe, "cus_test_1");
  assert.equal(r.data?.length, 1);
  assert.deepEqual(params, [{ customer: "cus_test_1", status: "all", limit: 20 }]);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: talent and workspace checkout send the trial only through the eligibility check", () => {
  for (const [file, subject] of [
    ["src/lib/stripe/talent-billing.ts", 'kind: "talent"'],
    ["src/lib/stripe/workspace-billing.ts", 'kind: "workspace"'],
  ] as const) {
    const src = read(file);
    assert.match(src, /await checkoutTrialDays\(/, `${file} calls checkoutTrialDays`);
    assert.ok(src.includes(subject), `${file} passes ${subject}`);
    assert.match(src, /\.\.\.trialParams\(trialDays\)/, `${file} spreads trialParams`);
    assert.doesNotMatch(src, /trialOffer\?\.isEnabled/, `${file} no longer grants the trial from the offer alone`);
    assert.equal(src.match(/trial_period_days/g)?.length ?? 0, 0, `${file} has no direct trial_period_days`);
  }
});
