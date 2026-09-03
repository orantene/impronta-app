import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_RE_ALERTS,
  RE_ALERT_SCHEDULE_HOURS,
  shouldReAlert,
  waitedLabel,
} from "./realert-schedule";

/**
 * Regression tests for a real production incident: the lifecycle cron re-alerted
 * on every hourly run, minting a fresh event id each time so the dedupe key
 * never matched. One ticket produced 61 identical emails, another 61, a third 21.
 */
const H = 3_600_000;
const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const hoursAgo = (n: number) => new Date(NOW - n * H).toISOString();

test("no alert before the first threshold", () => {
  assert.equal(
    shouldReAlert({ escalatedAt: hoursAgo(3), priorReAlertCount: 0, nowMs: NOW }),
    false,
  );
});

test("first chase lands at the first threshold", () => {
  assert.equal(
    shouldReAlert({ escalatedAt: hoursAgo(RE_ALERT_SCHEDULE_HOURS[0]), priorReAlertCount: 0, nowMs: NOW }),
    true,
  );
});

test("THE BUG: having already chased once, it does not chase again an hour later", () => {
  // This is the exact production failure. At 5h with one alert already sent,
  // the old code re-alerted; and again at 6h, 7h, 8h... for 61 hours.
  assert.equal(
    shouldReAlert({ escalatedAt: hoursAgo(5), priorReAlertCount: 1, nowMs: NOW }),
    false,
    "re-alerted an hour after the previous one — this is the 61-email bug",
  );
});

test("the interval widens rather than repeating", () => {
  // Each subsequent nudge needs a longer wait than the last.
  for (let i = 1; i < RE_ALERT_SCHEDULE_HOURS.length; i++) {
    assert.ok(
      RE_ALERT_SCHEDULE_HOURS[i] > RE_ALERT_SCHEDULE_HOURS[i - 1],
      `schedule must widen: ${RE_ALERT_SCHEDULE_HOURS[i]} follows ${RE_ALERT_SCHEDULE_HOURS[i - 1]}`,
    );
    assert.equal(
      shouldReAlert({
        escalatedAt: hoursAgo(RE_ALERT_SCHEDULE_HOURS[i] - 1),
        priorReAlertCount: i,
        nowMs: NOW,
      }),
      false,
      `chased before the ${i + 1}th threshold`,
    );
    assert.equal(
      shouldReAlert({
        escalatedAt: hoursAgo(RE_ALERT_SCHEDULE_HOURS[i]),
        priorReAlertCount: i,
        nowMs: NOW,
      }),
      true,
    );
  }
});

test("it goes quiet after the cap, however old the ticket gets", () => {
  // The decisive property: unbounded age must NOT produce unbounded email.
  for (const age of [96, 200, 1000, 10_000]) {
    assert.equal(
      shouldReAlert({ escalatedAt: hoursAgo(age), priorReAlertCount: MAX_RE_ALERTS, nowMs: NOW }),
      false,
      `still chasing after ${MAX_RE_ALERTS} alerts at ${age}h old`,
    );
  }
});

test("a whole ticket lifetime produces at most MAX_RE_ALERTS emails", () => {
  // Simulate the hourly cron for two weeks against one unanswered ticket and
  // count the sends. The old implementation scored 336 here.
  let sent = 0;
  const escalatedAt = new Date(NOW).toISOString();
  for (let hour = 1; hour <= 24 * 14; hour++) {
    const now = NOW + hour * H;
    if (shouldReAlert({ escalatedAt, priorReAlertCount: sent, nowMs: now })) sent += 1;
  }
  assert.equal(sent, MAX_RE_ALERTS, `two weeks of hourly cron sent ${sent} emails`);
});

test("a malformed escalatedAt never triggers a send", () => {
  assert.equal(shouldReAlert({ escalatedAt: "not-a-date", priorReAlertCount: 0, nowMs: NOW }), false);
});

test("waitedLabel reads in the unit a human would use", () => {
  assert.equal(waitedLabel(new Date(NOW - 30 * 60000).toISOString(), NOW), "30 min");
  assert.equal(waitedLabel(hoursAgo(5), NOW), "5h");
  assert.equal(waitedLabel(hoursAgo(72), NOW), "3 days");
});
