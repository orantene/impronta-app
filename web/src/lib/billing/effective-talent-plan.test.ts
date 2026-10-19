import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { hasEntitlement } from "../access/talent-entitlements";
import {
  resolveEffectiveTalentPlanKey,
  resolveEffectiveTalentPlanKeyWithPastDue,
  resolveEffectiveTalentPlans,
} from "./effective-talent-plan";

const T0 = "2026-10-01T12:00:00.000Z";
const at = (days: number) => new Date(Date.parse(T0) + days * 86_400_000);

type Sub = { talent_profile_id: string; status: string; past_due_since: string | null };
function fakeDb(subs: Sub[], fail = false) {
  return {
    from(table: string) {
      assert.equal(table, "talent_subscriptions");
      const q = {
        select: () => q,
        in: () => q,
        eq: (_c: string, v: string) => ({
          then: (res: (v: unknown) => unknown) =>
            res(fail ? { data: null, error: { message: "boom" } } : { data: subs.filter((s) => s.status === v), error: null }),
        }),
      };
      return q;
    },
  } as never;
}

describe("resolveEffectiveTalentPlanKey (TUL-835 choke point)", () => {
  const pastDue = (since: string | null): Sub[] => [{ talent_profile_id: "t1", status: "past_due", past_due_since: since }];

  test("past_due day 3 keeps paid", async () => {
    const k = await resolveEffectiveTalentPlanKey(fakeDb(pastDue(T0)), "t1", "talent_portfolio", at(3));
    assert.equal(k, "talent_portfolio");
    assert.equal(hasEntitlement(k, "booking.instant"), true);
  });
  test("past_due day 8 = basic", async () => {
    const k = await resolveEffectiveTalentPlanKey(fakeDb(pastDue(T0)), "t1", "talent_portfolio", at(8));
    assert.equal(k, "talent_basic");
    assert.equal(hasEntitlement(k, "booking.instant"), false);
  });
  test("active (no past_due row) = paid", async () => {
    assert.equal(await resolveEffectiveTalentPlanKey(fakeDb([]), "t1", "talent_pro", at(30)), "talent_pro");
  });
  test("missing timestamp keeps paid", async () => {
    assert.equal(await resolveEffectiveTalentPlanKey(fakeDb(pastDue(null)), "t1", "talent_pro", at(30)), "talent_pro");
  });
  test("lookup error fails open", async () => {
    assert.equal(await resolveEffectiveTalentPlanKey(fakeDb([], true), "t1", "talent_pro", at(30)), "talent_pro");
  });
  test("batch only downgrades the expired talent", async () => {
    const subs: Sub[] = [{ talent_profile_id: "a", status: "past_due", past_due_since: T0 }];
    const m = await resolveEffectiveTalentPlans(
      fakeDb(subs),
      [
        { id: "a", talent_plan_key: "talent_pro" },
        { id: "b", talent_plan_key: "talent_pro" },
      ],
      at(9),
    );
    assert.equal(m.get("a"), "talent_basic");
    assert.equal(m.get("b"), "talent_pro");
  });
});

describe("resolveEffectiveTalentPlanKeyWithPastDue (TUL-835 Today banner, same single read)", () => {
  test("past_due inside grace: paid plan kept and the past-due fact returned", async () => {
    let reads = 0;
    const db = fakeDb([{ talent_profile_id: "t1", status: "past_due", past_due_since: T0 }]);
    const counted = { from: (t: string) => { reads += 1; return (db as { from(t: string): unknown }).from(t); } } as never;
    const r = await resolveEffectiveTalentPlanKeyWithPastDue(counted, "t1", "talent_portfolio", at(2));
    assert.deepEqual(r, { planKey: "talent_portfolio", pastDue: { status: "past_due", pastDueSince: T0 } });
    assert.equal(reads, 1, "plan and past-due fact come from one talent_subscriptions read");
  });
  test("past_due after grace: plan resolves to basic, fact still returned for the Restore banner", async () => {
    const r = await resolveEffectiveTalentPlanKeyWithPastDue(
      fakeDb([{ talent_profile_id: "t1", status: "past_due", past_due_since: T0 }]),
      "t1",
      "talent_portfolio",
      at(8),
    );
    assert.equal(r.planKey, "talent_basic");
    assert.deepEqual(r.pastDue, { status: "past_due", pastDueSince: T0 });
  });
  test("not past_due or a read error: no fact, stored plan (fail open)", async () => {
    assert.deepEqual(await resolveEffectiveTalentPlanKeyWithPastDue(fakeDb([]), "t1", "talent_pro", at(1)), {
      planKey: "talent_pro",
      pastDue: null,
    });
    assert.deepEqual(await resolveEffectiveTalentPlanKeyWithPastDue(fakeDb([], true), "t1", "talent_pro", at(1)), {
      planKey: "talent_pro",
      pastDue: null,
    });
  });
});
