/** TUL-1646 P0: a month marked paid outside must never be charged by card (behavioural, fake admin + fake void). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { skipAutopayForOutsideMonth } from "./rent-outside-autopay.server";
import type { RentPlan } from "./rent-cycle";

const plan = (o: Partial<RentPlan> = {}) => ({ id: "plan-1", autopayStatus: "active", autopayFirstPeriod: "2026-11", ...o }) as RentPlan;
function fake(updateError = false) {
  const updates: unknown[] = [];
  const q: Record<string, unknown> = {};
  Object.assign(q, { update: (v: unknown) => { updates.push(v); return q; }, eq: () => q, then: (res: (v: unknown) => unknown) => Promise.resolve({ error: updateError ? { message: "x" } : null }).then(res) });
  return { admin: { from: () => q } as never, updates };
}
const base = { tenantId: "t-1", subscriptionId: "sub_1", platform: "mx" as const, skipPeriods: ["2026-12"] };

describe("skipAutopayForOutsideMonth", () => {
  test("an automatic month: skip list written FIRST, then the existing invoice is voided on the right subscription/platform", async () => {
    const f = fake();
    const voided: unknown[] = [];
    const ok = await skipAutopayForOutsideMonth(f.admin, { ...base, plan: plan(), period: "2027-01" }, { voidMonth: async (a) => { voided.push(a); return true; } });
    assert.equal(ok, true);
    assert.deepEqual(f.updates, [{ autopay_skip_periods: ["2026-12", "2027-01"] }]);
    assert.deepEqual(voided, [{ subscriptionId: "sub_1", platform: "mx", period: "2027-01" }]);
  });
  test("a Stripe void failure refuses (nothing recorded as paid)", async () => {
    assert.equal(await skipAutopayForOutsideMonth(fake().admin, { ...base, plan: plan(), period: "2027-01" }, { voidMonth: async () => false }), false);
  });
  test("a skip-list write failure refuses and never reaches Stripe", async () => {
    let called = false;
    assert.equal(await skipAutopayForOutsideMonth(fake(true).admin, { ...base, plan: plan(), period: "2027-01" }, { voidMonth: async () => { called = true; return true; } }), false);
    assert.equal(called, false);
  });
  test("PENDING checkout (no subscription yet): the skip list alone protects the month", async () => {
    const f = fake();
    let called = false;
    const ok = await skipAutopayForOutsideMonth(f.admin, { ...base, subscriptionId: null, plan: plan({ autopayStatus: "pending" }), period: "2026-12" }, { voidMonth: async () => { called = true; return true; } });
    assert.equal(ok, true);
    assert.equal(f.updates.length, 1);
    assert.equal(called, false);
  });
  test("a month before the first automatic period (paid by link) or an autopay-off plan touches nothing", async () => {
    for (const [pl, period] of [[plan(), "2026-10"], [plan({ autopayStatus: "off" }), "2027-01"]] as const) {
      const f = fake();
      assert.equal(await skipAutopayForOutsideMonth(f.admin, { ...base, plan: pl, period }, { voidMonth: async () => { throw new Error("no"); } }), true);
      assert.deepEqual(f.updates, []);
    }
  });
  test("the action SELECTS stripe_subscription_id (the P0: PLAN_COLUMNS does not carry it)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-outside-actions.ts"), "utf8");
    assert.match(src, /\$\{PLAN_COLUMNS\}, stripe_subscription_id, autopay_platform, autopay_skip_periods/);
    assert.match(src, /subscriptionId: extra\.stripe_subscription_id \?\? null/);
  });
});
