import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImmediateUpdateParams,
  buildPreviewParams,
  buildScheduleUpdateParams,
  isUsableProrationDate,
  planChangeCopyKey,
  planChangeIdempotencyKey,
  planChangePolicy,
  planRank,
  type PlanChangeKind,
  type PlanChangeSubject,
} from "./plan-change-policy";
import type { BillingInterval } from "@/lib/pricing/interval-pricing";

const INTERVALS: BillingInterval[] = ["month", "year"];

function expected(fromPlan: string, fromI: BillingInterval, toPlan: string, toI: BillingInterval): PlanChangeKind {
  const a = planRank(fromPlan);
  const b = planRank(toPlan);
  if (b > a) return "upgrade";
  if (b < a) return "downgrade";
  if (fromI === toI) return "noop";
  return toI === "year" ? "interval_up" : "interval_down";
}

for (const [audience, plans] of [
  ["talent", ["talent_pro", "talent_portfolio"]],
  ["workspace", ["website", "studio", "agency", "network"]],
] as const) {
  test(`policy table is exhaustive for ${audience} plans x intervals`, () => {
    let cases = 0;
    for (const fp of plans) for (const fi of INTERVALS) for (const tp of plans) for (const ti of INTERVALS) {
      const p = planChangePolicy({ plan: fp, interval: fi }, { plan: tp, interval: ti });
      const kind = expected(fp, fi, tp, ti);
      assert.equal(p.kind, kind, `${fp}/${fi} -> ${tp}/${ti}`);
      if (kind === "upgrade" || kind === "interval_up") {
        assert.equal(p.timing, "now");
        assert.equal(p.stripeParams.proration_behavior, "always_invoice");
        assert.equal(p.stripeParams.payment_behavior, "error_if_incomplete");
        assert.equal(p.stripeParams.useSchedule, false);
      } else if (kind === "downgrade" || kind === "interval_down") {
        assert.equal(p.timing, "period_end");
        assert.equal(p.stripeParams.useSchedule, true);
        assert.equal(p.stripeParams.proration_behavior, "none");
      } else {
        assert.equal(p.stripeParams.useSchedule, false);
        assert.equal(p.stripeParams.proration_behavior, "none");
      }
      cases++;
    }
    assert.equal(cases, plans.length * plans.length * 4);
  });
}

test("named rows: pro->portfolio upgrade, portfolio->pro downgrade, month<->year on same plan", () => {
  assert.equal(planChangePolicy({ plan: "talent_pro", interval: "month" }, { plan: "talent_portfolio", interval: "month" }).kind, "upgrade");
  assert.equal(planChangePolicy({ plan: "talent_portfolio", interval: "year" }, { plan: "talent_pro", interval: "year" }).kind, "downgrade");
  assert.equal(planChangePolicy({ plan: "studio", interval: "month" }, { plan: "studio", interval: "year" }).kind, "interval_up");
  assert.equal(planChangePolicy({ plan: "studio", interval: "year" }, { plan: "studio", interval: "month" }).kind, "interval_down");
  // Higher plan wins over a shorter interval: still charged now.
  assert.equal(planChangePolicy({ plan: "studio", interval: "year" }, { plan: "agency", interval: "month" }).timing, "now");
  // Unknown current plan (legacy metadata) ranks below any known plan.
  assert.equal(planChangePolicy({ plan: "", interval: "month" }, { plan: "talent_pro", interval: "month" }).kind, "upgrade");
});

const subject: PlanChangeSubject = {
  kind: "talent",
  subjectId: "tp_1",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  itemId: "si_1",
  toPlan: "talent_portfolio",
  toInterval: "year",
  toPriceId: "price_portfolio_year",
};

test("preview and update share items, proration_date and behavior", () => {
  const preview = buildPreviewParams(subject, 1_800_000_000);
  const update = buildImmediateUpdateParams(subject, 1_800_000_000);
  assert.deepEqual(preview.subscription_details.items, update.items);
  assert.equal(preview.subscription_details.proration_date, update.proration_date);
  assert.equal(preview.subscription_details.proration_behavior, update.proration_behavior);
  assert.equal(preview.subscription, "sub_1");
  assert.equal(preview.customer, "cus_1");
  assert.deepEqual(update.metadata, { plan_key: "talent_portfolio", billing_interval: "year" });
  assert.equal(update.payment_behavior, "error_if_incomplete");
});

test("schedule keeps the current price to period end, then the new price with new plan metadata", () => {
  const p = buildScheduleUpdateParams({
    currentPriceId: "price_pro_month",
    currentPhaseStart: 100,
    currentPeriodEnd: 200,
    toPriceId: "price_basic",
    toPlan: "talent_pro",
    toInterval: "month",
  });
  assert.equal(p.end_behavior, "release");
  assert.equal(p.phases.length, 2);
  assert.deepEqual(p.phases[0], { items: [{ price: "price_pro_month", quantity: 1 }], start_date: 100, end_date: 200 });
  assert.equal(p.phases[1].start_date, 200);
  assert.equal(p.phases[1].items[0].price, "price_basic");
  assert.deepEqual(p.phases[1].metadata, { plan_key: "talent_pro", billing_interval: "month" });
});

test("schedule carries trial_end on the current phase only while a trial is running (TUL-831)", () => {
  const base = {
    currentPriceId: "price_portfolio_year",
    currentPhaseStart: 100,
    currentPeriodEnd: 200,
    toPriceId: "price_pro_month",
    toPlan: "talent_pro",
    toInterval: "month" as const,
  };
  const trialing = buildScheduleUpdateParams({ ...base, trialEnd: 200 });
  assert.equal((trialing.phases[0] as { trial_end?: number }).trial_end, 200);
  assert.equal("trial_end" in trialing.phases[1], false);
  for (const trialEnd of [null, undefined, 100, 50]) {
    const p = buildScheduleUpdateParams({ ...base, trialEnd });
    assert.equal("trial_end" in p.phases[0], false, String(trialEnd));
  }
});

test("idempotency key is stable for one preview and changes with a new preview", () => {
  const base = { subscriptionId: "sub_1", toPlan: "talent_portfolio", toInterval: "year" as const, prorationDate: 1700, step: "update" as const };
  assert.equal(planChangeIdempotencyKey(base), planChangeIdempotencyKey({ ...base }));
  assert.notEqual(planChangeIdempotencyKey(base), planChangeIdempotencyKey({ ...base, prorationDate: 1701 }));
  assert.notEqual(planChangeIdempotencyKey(base), planChangeIdempotencyKey({ ...base, toInterval: "month" }));
  assert.notEqual(planChangeIdempotencyKey(base), planChangeIdempotencyKey({ ...base, step: "schedule_update" }));
  assert.match(planChangeIdempotencyKey(base), /1700$/);
});

test("proration date must be a recent integer, not in the future", () => {
  const now = 2_000_000_000_000;
  const sec = Math.floor(now / 1000);
  assert.equal(isUsableProrationDate(sec, now), true);
  assert.equal(isUsableProrationDate(sec - 60, now), true);
  assert.equal(isUsableProrationDate(sec - 16 * 60, now), false);
  assert.equal(isUsableProrationDate(sec + 120, now), false);
  assert.equal(isUsableProrationDate(sec + 0.5, now), false);
  assert.equal(isUsableProrationDate("123", now), false);
});

test("copy key per outcome", () => {
  assert.equal(planChangeCopyKey({ kind: "upgrade", timing: "now" }), "payToday");
  assert.equal(planChangeCopyKey({ kind: "interval_up", timing: "now" }), "payToday");
  assert.equal(planChangeCopyKey({ kind: "downgrade", timing: "period_end" }), "changesOn");
  assert.equal(planChangeCopyKey({ kind: "interval_down", timing: "period_end" }), "changesOn");
  assert.equal(planChangeCopyKey({ kind: "noop", timing: "now", cancelsPendingChange: true }), "cancelPending");
  assert.equal(planChangeCopyKey({ kind: "noop", timing: "now" }), "noChange");
});
