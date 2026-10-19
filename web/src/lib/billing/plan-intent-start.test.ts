import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  PlanIntentStartError,
  planIntentRunKey,
  resetPlanIntentStarts,
  sharedPlanIntentStart,
  startWithRetry,
  type TimerApi,
} from "./plan-intent-start";
import { upgradeOutcome } from "./upgrade-outcome";

/** Manual clock: timers fire only when the test says so. */
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  const api: TimerApi = {
    set: (fn) => {
      const id = next++;
      pending.set(id, fn);
      return id;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const fireAll = () => {
    const fns = [...pending.values()];
    pending.clear();
    for (const fn of fns) fn();
  };
  return { api, fireAll, count: () => pending.size };
}

const tick = () => new Promise((r) => setImmediate(r));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => resetPlanIntentStarts());

const DOWNGRADE = { ok: true as const, redirectUrl: "https://billing.stripe.test/p", planChange: { planKey: "talent_pro", interval: "month" as const } };
const UPGRADE = { ok: true as const, redirectUrl: "https://billing.stripe.test/p", planChange: { planKey: "talent_portfolio", interval: "year" as const } };

test("TUL-831: a downgrade intent's answer opens the plan-change confirm (same as upgrade)", () => {
  assert.deepEqual(upgradeOutcome(DOWNGRADE), { kind: "plan_change", target: { planKey: "talent_pro", interval: "month" } });
  assert.deepEqual(upgradeOutcome(UPGRADE), { kind: "plan_change", target: { planKey: "talent_portfolio", interval: "year" } });
});

test("upgrade unchanged: one answer, one action, no retry", async () => {
  const t = fakeTimers();
  let calls = 0;
  const v = await startWithRetry(async () => (calls++, UPGRADE), { timers: t.api });
  assert.equal(v, UPGRADE);
  assert.equal(calls, 1);
  assert.equal(t.count(), 0, "watchdog cleared");
});

test("an aborted (never-answering) first call does not leave the opener stuck: it retries and the confirm opens", async () => {
  const t = fakeTimers();
  const first = deferred<typeof DOWNGRADE>();
  let calls = 0;
  const run = startWithRetry(() => (++calls === 1 ? first.promise : Promise.resolve(DOWNGRADE)), { timers: t.api });
  await tick();
  assert.equal(calls, 1);
  t.fireAll(); // first attempt's watchdog: no answer in time
  assert.equal(calls, 2, "a second attempt runs");
  assert.deepEqual(upgradeOutcome(await run), { kind: "plan_change", target: { planKey: "talent_pro", interval: "month" } });
});

test("an errored first call retries once", async () => {
  const t = fakeTimers();
  let calls = 0;
  const v = await startWithRetry(
    () => (++calls === 1 ? Promise.reject(new Error("ERR_ABORTED")) : Promise.resolve(DOWNGRADE)),
    { timers: t.api },
  );
  assert.equal(calls, 2);
  assert.equal(v, DOWNGRADE);
});

test("a late answer from the first attempt still wins", async () => {
  const t = fakeTimers();
  const first = deferred<typeof DOWNGRADE>();
  const second = deferred<typeof DOWNGRADE>();
  let calls = 0;
  const run = startWithRetry(() => (++calls === 1 ? first.promise : second.promise), { timers: t.api });
  t.fireAll();
  first.resolve(DOWNGRADE);
  assert.equal(await run, DOWNGRADE);
});

test("when every attempt fails it rejects (the opener falls back to the plan drawer, never hangs)", async () => {
  const t = fakeTimers();
  let calls = 0;
  const run = startWithRetry(() => (calls++, new Promise<never>(() => {})), { timers: t.api });
  t.fireAll();
  t.fireAll();
  await assert.rejects(run, (e) => e instanceof PlanIntentStartError && e.reason === "timeout");
  assert.equal(calls, 2, "at most two attempts");
});

test("a remounted opener joins the run in flight instead of firing another action", async () => {
  const t = fakeTimers();
  const d = deferred<typeof DOWNGRADE>();
  let calls = 0;
  const key = planIntentRunKey("tal", "talent_pro", "month");
  const a = sharedPlanIntentStart(key, () => (calls++, d.promise), { timers: t.api });
  const b = sharedPlanIntentStart(key, () => (calls++, d.promise), { timers: t.api });
  assert.equal(a, b);
  d.resolve(DOWNGRADE);
  assert.equal(await b, DOWNGRADE);
  assert.equal(calls, 1);
  // Settled: a later mount (e.g. after the shell dropped the dialog) runs again.
  await sharedPlanIntentStart(key, async () => (calls++, DOWNGRADE), { timers: t.api });
  assert.equal(calls, 2);
});
