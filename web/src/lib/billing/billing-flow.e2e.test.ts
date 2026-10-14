/**
 * billing-flow.e2e.test.ts (TUL-838): end-to-end regression for the talent
 * billing flow, run as a node lane (`npm run manual:billing-e2e`; also the billing-e2e job in talent-website-e2e.yml).
 *
 * No network: Stripe is replaced by fixture events and a recording fake, and
 * the database by an in-memory talent_subscriptions + talent_profiles pair.
 * Every step goes through the SAME pure seams production uses:
 *
 *   checkout   resolveCheckoutPrice + checkoutIdempotencyKey (TUL-830)
 *   webhook    decideTalentPlanState, the single plan-state writer (TUL-836)
 *   dunning    dunningBanner (TUL-835)
 *   lifecycle  runTalentLifecycle cancel / resume (TUL-832)
 *   access     hasEntitlement, read straight off the written plan (TUL-837)
 *
 * The wiring that a node test cannot execute without Stripe (the session
 * params in talent-billing.ts, the shell rendering the banner) is pinned by
 * static assertions on the source so a refactor cannot silently drop it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { checkoutIdempotencyKey, resolveCheckoutPrice } from "./checkout-interval";
import { decideTalentPlanState, FREE_TALENT_PLAN, type StoredTalentPlanRow } from "./talent-plan-state";
import { dunningBanner } from "./dunning-banner";
import { runTalentLifecycle, type TalentSubscriptionRow } from "./talent-subscription-lifecycle";
import { hasEntitlement } from "@/lib/access/talent-entitlements";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

// ─── Fixtures (fake ids only, never real prices or keys) ─────────────────────

const TALENT = "tp_fixture_1";
const USER = "user_fixture_1";
const SUB = "sub_fixture_1";
const PERIOD_END = "2026-11-14T00:00:00.000Z";
const CATALOG: Record<string, Record<"monthly" | "annual", string | null>> = {
  talent_pro: { monthly: "price_fixture_pro_m", annual: "price_fixture_pro_y" },
  talent_portfolio: { monthly: "price_fixture_max_m", annual: null },
};

type Db = {
  profilePlan: string;
  sub: (StoredTalentPlanRow & { user_id: string; current_period_end: string; cancel_at_period_end: boolean }) | null;
  planChangedCalls: Array<[string, string]>;
};

function freshDb(): Db {
  return { profilePlan: FREE_TALENT_PLAN, sub: null, planChangedCalls: [] };
}

/** Applies one webhook fixture the way talent-billing.ts syncTalentSubscriptionToDb does. */
function deliver(db: Db, eventType: string, status: string, planKey = "talent_pro", subId = SUB) {
  const decision = decideTalentPlanState({
    eventType,
    subscriptionId: subId,
    status,
    planKey,
    existing: db.sub,
    previousProfilePlan: db.profilePlan,
  });
  if (decision.kind === "skip_stale") return decision;
  db.sub = {
    user_id: USER,
    stripe_subscription_id: subId,
    status: decision.status,
    plan_key: decision.rowPlan,
    current_period_end: PERIOD_END,
    cancel_at_period_end: db.sub?.cancel_at_period_end ?? false,
  };
  if (decision.planChanged) db.planChangedCalls.push([db.profilePlan, decision.profilePlan]);
  db.profilePlan = decision.profilePlan;
  return decision;
}

// ─── 1. free -> checkout session ─────────────────────────────────────────────

describe("billing flow: free -> checkout", () => {
  const resolver = (plan: string) => async (i: "monthly" | "annual") => CATALOG[plan]?.[i] ?? null;

  it("monthly checkout charges the catalog monthly price", async () => {
    const r = await resolveCheckoutPrice(resolver("talent_pro"), "month");
    assert.deepEqual(r, { ok: true, priceId: "price_fixture_pro_m", interval: "month" });
  });

  it("yearly checkout charges the catalog yearly price with a distinct idempotency key", async () => {
    const r = await resolveCheckoutPrice(resolver("talent_pro"), "year");
    assert.deepEqual(r, { ok: true, priceId: "price_fixture_pro_y", interval: "year" });
    const base = { prefix: "cs_talent", subjectId: TALENT, planKey: "talent_pro", suffix: "" };
    assert.notEqual(
      checkoutIdempotencyKey({ ...base, interval: "year" }),
      checkoutIdempotencyKey({ ...base, interval: "month" }),
    );
  });

  it("yearly without a catalog price refuses instead of falling back", async () => {
    const r = await resolveCheckoutPrice(resolver("talent_portfolio"), "year");
    assert.deepEqual(r, { ok: false, code: "yearly_unavailable" });
  });

  it("session params carry interval + metadata on session and subscription", () => {
    const src = read("lib/stripe/talent-billing.ts");
    const start = src.indexOf("export async function createTalentCheckoutSession");
    const body = src.slice(start, src.indexOf("// ─── Billing portal", start));
    assert.match(body, /mode: "subscription"/);
    assert.match(body, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
    for (const key of ["talent_profile_id", "user_id", "plan_key", "billing_interval", "checkout_type"]) {
      assert.equal(body.split(`${key}:`).length - 1, 2, `${key} on session AND subscription_data`);
    }
    assert.match(body, /resolveCheckoutPrice\(/);
    assert.match(body, /checkoutIdempotencyKey\(/);
  });
});

// ─── 2. webhook events -> plan state ─────────────────────────────────────────

describe("billing flow: webhook -> plan state", () => {
  it("subscription.created active upgrades and unlocks features on the next read", () => {
    const db = freshDb();
    assert.equal(hasEntitlement(db.profilePlan, "profile.noPlatformBadge"), false);
    deliver(db, "customer.subscription.created", "active");
    assert.equal(db.profilePlan, "talent_pro");
    assert.deepEqual(db.planChangedCalls, [["talent_basic", "talent_pro"]]);
    assert.equal(hasEntitlement(db.profilePlan, "profile.noPlatformBadge"), true);
  });

  it("incomplete first payment grants nothing", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "incomplete");
    assert.equal(db.profilePlan, FREE_TALENT_PLAN);
    assert.equal(db.planChangedCalls.length, 0);
  });

  it("subscription.updated switches plan (pro -> portfolio)", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    deliver(db, "customer.subscription.updated", "active", "talent_portfolio");
    assert.equal(db.profilePlan, "talent_portfolio");
    assert.equal(hasEntitlement(db.profilePlan, "discover.priority"), true);
  });

  it("subscription.deleted downgrades to free and keeps the last paid plan on the row", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active", "talent_portfolio");
    deliver(db, "customer.subscription.deleted", "active", "talent_portfolio");
    assert.equal(db.profilePlan, FREE_TALENT_PLAN);
    assert.equal(db.sub?.status, "cancelled");
    assert.equal(db.sub?.plan_key, "talent_portfolio");
    assert.equal(hasEntitlement(db.profilePlan, "discover.priority"), false);
  });

  it("a stale updated after deleted is ignored; replay is idempotent", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    deliver(db, "customer.subscription.deleted", "active");
    const stale = deliver(db, "customer.subscription.updated", "active");
    assert.equal(stale.kind, "skip_stale");
    assert.equal(db.profilePlan, FREE_TALENT_PLAN);
    const again = deliver(db, "customer.subscription.deleted", "active");
    assert.equal(again.kind === "write" && again.planChanged, false);
  });

  it("a new subscription after cancel is a resubscribe", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    deliver(db, "customer.subscription.deleted", "active");
    deliver(db, "customer.subscription.created", "active", "talent_pro", "sub_fixture_2");
    assert.equal(db.profilePlan, "talent_pro");
  });
});

// ─── 3. past_due banner ──────────────────────────────────────────────────────

describe("billing flow: past_due banner", () => {
  it("payment failure keeps access and shows the banner until recovery", () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    assert.equal(dunningBanner({ status: db.sub!.status, currentPeriodEnd: PERIOD_END }), null);
    deliver(db, "sync", "past_due");
    assert.equal(db.profilePlan, "talent_pro");
    assert.deepEqual(dunningBanner({ status: db.sub!.status, currentPeriodEnd: PERIOD_END }), {
      accessUntil: PERIOD_END,
    });
    deliver(db, "sync", "active");
    assert.equal(dunningBanner({ status: db.sub!.status, currentPeriodEnd: PERIOD_END }), null);
  });

  it("the talent settings shell renders the banner from dunningBanner", () => {
    const shell = read("app/(workspace)/[tenantSlug]/talent/settings/TalentSubscriptionShell.tsx");
    assert.match(shell, /TalentDunningBanner|dunningBanner/);
  });
});

// ─── 4. cancel / resume ──────────────────────────────────────────────────────

describe("billing flow: cancel / resume", () => {
  function deps(db: Db, stripeCalls: Array<[string, boolean]>, failStripe = false) {
    return {
      loadRow: async (): Promise<TalentSubscriptionRow | null> => db.sub,
      setStripeCancelFlag: async (id: string, flag: boolean) => {
        if (failStripe) throw new Error("stripe fixture failure");
        stripeCalls.push([id, flag]);
        return PERIOD_END;
      },
      mirror: async (_id: string, flag: boolean) => {
        if (db.sub) db.sub.cancel_at_period_end = flag;
      },
    };
  }

  it("cancel sets cancel_at_period_end at Stripe, keeps access, resume clears it", async () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    const calls: Array<[string, boolean]> = [];
    const c = await runTalentLifecycle(deps(db, calls), { talentProfileId: TALENT, callerUserId: USER, action: "cancel" });
    assert.deepEqual(c, { ok: true, cancelAtPeriodEnd: true, periodEnd: PERIOD_END });
    assert.equal(db.profilePlan, "talent_pro");
    const r = await runTalentLifecycle(deps(db, calls), { talentProfileId: TALENT, callerUserId: USER, action: "resume" });
    assert.deepEqual(r, { ok: true, cancelAtPeriodEnd: false, periodEnd: PERIOD_END });
    assert.deepEqual(calls, [[SUB, true], [SUB, false]]);
  });

  it("another user cannot cancel; a Stripe failure is not mirrored", async () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    const calls: Array<[string, boolean]> = [];
    const other = await runTalentLifecycle(deps(db, calls), { talentProfileId: TALENT, callerUserId: "intruder", action: "cancel" });
    assert.deepEqual(other, { ok: false, code: "not_found" });
    const failed = await runTalentLifecycle(deps(db, calls, true), { talentProfileId: TALENT, callerUserId: USER, action: "cancel" });
    assert.deepEqual(failed, { ok: false, code: "stripe_failed" });
    assert.equal(db.sub?.cancel_at_period_end, false);
  });

  it("resume after the subscription ended asks for a new checkout", async () => {
    const db = freshDb();
    deliver(db, "customer.subscription.created", "active");
    deliver(db, "customer.subscription.deleted", "active");
    const r = await runTalentLifecycle(deps(db, []), { talentProfileId: TALENT, callerUserId: USER, action: "resume" });
    assert.deepEqual(r, { ok: false, code: "already_ended" });
  });
});
