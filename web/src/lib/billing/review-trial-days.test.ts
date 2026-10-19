import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { shownTrialDays } from "./review-trial-days";

/** TUL-1285: /get-started/review never promises a trial a signed-in returning user will not get. */

const PLAN = { trialEnabled: true, trialDays: 14 };
const USER = "22222222-2222-4222-8222-222222222222";

function eligibility(result: number | Error) {
  const calls: { userId: string; offer: unknown }[] = [];
  const fn = async (userId: string, offer: { isEnabled: boolean; trialDays: number }) => {
    calls.push({ userId, offer });
    if (result instanceof Error) throw result;
    return result;
  };
  return { fn, calls };
}

test("signed-in user with a prior trial: no trial days shown (charged-today wording)", async () => {
  const e = eligibility(0);
  assert.equal(await shownTrialDays(PLAN, USER, e.fn), null);
  assert.deepEqual(e.calls, [{ userId: USER, offer: { isEnabled: true, trialDays: 14 } }]);
});

test("signed-in first-timer: the offer days", async () => {
  assert.equal(await shownTrialDays(PLAN, USER, eligibility(14).fn), 14);
});

test("logged-out visitor: offer days unchanged, no history read", async () => {
  const e = eligibility(0);
  assert.equal(await shownTrialDays(PLAN, null, e.fn), 14);
  assert.equal(e.calls.length, 0);
});

test("a failed eligibility read fails closed: no trial text", async () => {
  assert.equal(await shownTrialDays(PLAN, USER, eligibility(new Error("db down")).fn), null);
});

test("offer off or no plan: null for everyone, no read", async () => {
  const e = eligibility(14);
  assert.equal(await shownTrialDays({ trialEnabled: false, trialDays: 14 }, USER, e.fn), null);
  assert.equal(await shownTrialDays(null, USER, e.fn), null);
  assert.equal(await shownTrialDays({ trialEnabled: true, trialDays: null }, USER, e.fn), null);
  assert.equal(e.calls.length, 0);
});

test("wiring: the review page gates both plans with the DB-only user rule when signed in", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(marketing)/get-started/review/page.tsx"), "utf8");
  assert.match(src, /displayTrialDays\(\{ kind: "user", userId: uid \}, offer\)/);
  assert.match(src, /resolved\.isAuthenticated \? resolved\.userId : null/);
  assert.match(src, /trialDays: workspaceTrialDays,/);
  assert.match(src, /trialDays: talentTrialDays,/);
  assert.doesNotMatch(src, /trialEnabled \? \w+\.trialDays : null/, "no trial promised from config alone");
});
