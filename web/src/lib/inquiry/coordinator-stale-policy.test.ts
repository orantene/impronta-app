import assert from "node:assert/strict";
import test from "node:test";
import {
  COORDINATOR_STALE_ANCHOR_EVENT,
  NOTIFY_MAX_STALENESS_HOURS,
  classifyStaleAlert,
  shouldNotifyForStaleness,
  stalenessHours,
} from "./coordinator-stale-policy";

const NOW = Date.parse("2026-08-15T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

test("anchor event type matches the engine event both sweeps raise", () => {
  // Guards the literal against a rename of ENGINE_EVENT_TYPES.
  // COORDINATOR_ASSIGNMENT_TIMED_OUT — if these drift, the two crons stop
  // sharing an anchor and start double-alerting.
  assert.equal(COORDINATOR_STALE_ANCHOR_EVENT, "coordinator.assignment_timed_out");
});

test("stalenessHours measures elapsed hours", () => {
  assert.equal(stalenessHours(hoursAgo(5), NOW), 5);
  assert.equal(stalenessHours(hoursAgo(0), NOW), 0);
});

test("stalenessHours returns null for absent or unparseable timestamps", () => {
  assert.equal(stalenessHours(null, NOW), null);
  assert.equal(stalenessHours(undefined, NOW), null);
  assert.equal(stalenessHours("", NOW), null);
  assert.equal(stalenessHours("not-a-date", NOW), null);
});

test("stalenessHours goes negative on a future timestamp (clock skew)", () => {
  const future = new Date(NOW + 3 * 60 * 60 * 1000).toISOString();
  assert.equal(stalenessHours(future, NOW), -3);
});

test("an existing anchor always skips, no matter how fresh", () => {
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: true, staleSinceIso: hoursAgo(1), nowMs: NOW }),
    "skip",
  );
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: true, staleSinceIso: hoursAgo(2000), nowMs: NOW }),
    "skip",
  );
});

test("recent staleness notifies", () => {
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: false, staleSinceIso: hoursAgo(3), nowMs: NOW }),
    "notify",
  );
});

test("cutoff boundary is inclusive — exactly at the limit still notifies", () => {
  assert.equal(
    classifyStaleAlert({
      alreadyAnchored: false,
      staleSinceIso: hoursAgo(NOTIFY_MAX_STALENESS_HOURS),
      nowMs: NOW,
    }),
    "notify",
  );
  assert.equal(
    classifyStaleAlert({
      alreadyAnchored: false,
      staleSinceIso: hoursAgo(NOTIFY_MAX_STALENESS_HOURS + 0.01),
      nowMs: NOW,
    }),
    "drain",
  );
});

test("months-old backlog drains quietly instead of notifying", () => {
  // The real production backlog: rows 22-85 days stale when the sweep is
  // first switched on. Every one of them must drain, or staff get a burst.
  for (const days of [22, 35, 45, 48, 70, 72, 74, 85]) {
    assert.equal(
      classifyStaleAlert({
        alreadyAnchored: false,
        staleSinceIso: hoursAgo(days * 24),
        nowMs: NOW,
      }),
      "drain",
      `${days}d-old row must drain, not notify`,
    );
  }
});

test("unknown staleness drains rather than notifying", () => {
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: false, staleSinceIso: null, nowMs: NOW }),
    "drain",
  );
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: false, staleSinceIso: "garbage", nowMs: NOW }),
    "drain",
  );
});

test("a future timestamp is treated as fresh and notifies", () => {
  const future = new Date(NOW + 60 * 60 * 1000).toISOString();
  assert.equal(
    classifyStaleAlert({ alreadyAnchored: false, staleSinceIso: future, nowMs: NOW }),
    "notify",
  );
});

test("maxStalenessHours override is honoured", () => {
  const input = { alreadyAnchored: false, staleSinceIso: hoursAgo(10), nowMs: NOW };
  assert.equal(classifyStaleAlert({ ...input, maxStalenessHours: 12 }), "notify");
  assert.equal(classifyStaleAlert({ ...input, maxStalenessHours: 8 }), "drain");
});

test("shouldNotifyForStaleness agrees with classifyStaleAlert", () => {
  const cases = [
    { alreadyAnchored: true, staleSinceIso: hoursAgo(1), nowMs: NOW },
    { alreadyAnchored: false, staleSinceIso: hoursAgo(1), nowMs: NOW },
    { alreadyAnchored: false, staleSinceIso: hoursAgo(500), nowMs: NOW },
    { alreadyAnchored: false, staleSinceIso: null, nowMs: NOW },
  ];
  for (const c of cases) {
    assert.equal(shouldNotifyForStaleness(c), classifyStaleAlert(c) === "notify");
  }
});

test("the drain path still anchors — only 'skip' writes nothing", () => {
  // Encodes the contract the sweeps rely on: "drain" MUST still write the
  // anchor, otherwise the sibling cron re-alerts the same inquiry an hour later.
  const drained = classifyStaleAlert({
    alreadyAnchored: false,
    staleSinceIso: hoursAgo(1000),
    nowMs: NOW,
  });
  assert.equal(drained, "drain");
  assert.notEqual(drained, "skip");
});
