/**
 * The liveness decision table.
 *
 * The whole value of a heartbeat is telling three states apart that all LOOK
 * like silence from the outside: a job that never deployed, a job that stopped,
 * and a job that is running and failing every time. Conflating any two of them
 * produces either a page on every deploy or a stopped ledger nobody notices.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHeartbeats,
  stalenessThresholdMinutes,
  truncateDetail,
  type HeartbeatRow,
} from "./cron-heartbeat";

const NOW = new Date("2026-09-03T12:00:00.000Z");

function row(over: Partial<HeartbeatRow> & { job: string }): HeartbeatRow {
  return {
    last_run_at: NOW.toISOString(),
    last_ok_at: NOW.toISOString(),
    last_status: "ok",
    consecutive_failures: 0,
    ...over,
  };
}

function minutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}

test("threshold is two intervals plus grace — an alarm must survive ordinary jitter", () => {
  // Both money crons are hourly, so: 60*2 + 15.
  assert.equal(stalenessThresholdMinutes("project-ledger"), 135);
  assert.equal(stalenessThresholdMinutes("ingest-balance-transactions"), 135);
});

test("a job that ran recently is ok", () => {
  const v = classifyHeartbeats([row({ job: "project-ledger", last_run_at: minutesAgo(10) })], NOW, [
    "project-ledger",
  ]);
  assert.deepEqual(v, [{ job: "project-ledger", state: "ok" }]);
});

test("one missed run is NOT an alarm — that is scheduling jitter, not a stopped job", () => {
  // 70 minutes: one interval late, well under the two-run threshold.
  const v = classifyHeartbeats([row({ job: "project-ledger", last_run_at: minutesAgo(70) })], NOW, [
    "project-ledger",
  ]);
  assert.equal(v[0].state, "ok");
});

test("two missed runs IS an alarm", () => {
  const v = classifyHeartbeats([row({ job: "project-ledger", last_run_at: minutesAgo(200) })], NOW, [
    "project-ledger",
  ]);
  assert.equal(v[0].state, "stale");
  if (v[0].state === "stale") {
    assert.equal(v[0].minutesSince, 200);
    assert.equal(v[0].thresholdMinutes, 135);
  }
});

test("exactly AT the threshold is not yet stale — strictly greater, so the boundary cannot flap", () => {
  const v = classifyHeartbeats([row({ job: "project-ledger", last_run_at: minutesAgo(135) })], NOW, [
    "project-ledger",
  ]);
  assert.equal(v[0].state, "ok");
});

test("a missing row is `never_ran`, NOT `stale` — a fresh deploy must not page anyone", () => {
  const v = classifyHeartbeats([], NOW, ["project-ledger"]);
  assert.deepEqual(v, [{ job: "project-ledger", state: "never_ran" }]);
});

test("a job running and failing every time is `failing`, not silent", () => {
  // This is the state no staleness check can see: it runs on schedule, so
  // last_run_at is fresh, and it fails every time.
  const v = classifyHeartbeats(
    [row({ job: "project-ledger", last_run_at: minutesAgo(5), last_status: "error", consecutive_failures: 4 })],
    NOW,
    ["project-ledger"],
  );
  assert.equal(v[0].state, "failing");
  if (v[0].state === "failing") assert.equal(v[0].consecutiveFailures, 4);
});

test("a single failure is not yet an alarm — one bad run is retried next hour", () => {
  const v = classifyHeartbeats(
    [row({ job: "project-ledger", last_run_at: minutesAgo(5), last_status: "error", consecutive_failures: 1 })],
    NOW,
    ["project-ledger"],
  );
  assert.equal(v[0].state, "ok");
});

test("STOPPED beats FAILING: a stopped job's last status is frozen and would mislabel it", () => {
  // It failed twice, then stopped entirely. The actionable fact is that it
  // stopped -- reporting "failing" would send someone to debug a job that is
  // not running at all.
  const v = classifyHeartbeats(
    [row({ job: "project-ledger", last_run_at: minutesAgo(600), last_status: "error", consecutive_failures: 2 })],
    NOW,
    ["project-ledger"],
  );
  assert.equal(v[0].state, "stale");
});

test("both money jobs are classified independently", () => {
  const v = classifyHeartbeats(
    [
      row({ job: "project-ledger", last_run_at: minutesAgo(5) }),
      row({ job: "ingest-balance-transactions", last_run_at: minutesAgo(400) }),
    ],
    NOW,
  );
  const byJob = Object.fromEntries(v.map((x) => [x.job, x.state]));
  assert.equal(byJob["project-ledger"], "ok");
  assert.equal(byJob["ingest-balance-transactions"], "stale");
});

test("detail is truncated rather than dropped — a runaway error must not lose the heartbeat", () => {
  const long = "x".repeat(5000);
  const out = truncateDetail(long)!;
  assert.ok(out.length <= 2000, `expected <= 2000, got ${out.length}`);
  assert.equal(truncateDetail("  "), null);
  assert.equal(truncateDetail(null), null);
  assert.equal(truncateDetail("fine"), "fine");
});
