/**
 * TUL-628: a limiter that fails open must still be counted and logged
 * (throttled), never swallowed silently, and never log the raw key.
 * Lane: test:auth-routing.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  FAIL_OPEN_LOG_WINDOW_MS,
  failOpen,
  failOpenCount,
  resetFailOpenStateForTests,
} from "@/lib/rate-limit-fail-open";

function captureErrors(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    fn();
  } finally {
    console.error = orig;
  }
  return lines;
}

beforeEach(() => resetFailOpenStateForTests());

test("fail-open still allows the request and counts every occurrence", () => {
  captureErrors(() => {
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(failOpen("checkX", "k:1", new Error("boom"), 1000 + i), { ok: true });
    }
  });
  assert.equal(failOpenCount(), 5);
});

test("logs once per limiter per window, then again with the suppressed count", () => {
  const lines = captureErrors(() => {
    for (let i = 0; i < 5; i++) failOpen("checkX", "k:1", new Error("boom"), 1000 + i);
    failOpen("checkY", "k:1", new Error("boom"), 1005);
    failOpen("checkX", "k:1", new Error("boom"), 1000 + FAIL_OPEN_LOG_WINDOW_MS);
  });
  const x = lines.filter((l) => l.includes("checkX"));
  const y = lines.filter((l) => l.includes("checkY"));
  assert.equal(x.length, 2);
  assert.equal(y.length, 1);
  assert.match(x[1], /4 more since last log/);
});

test("never logs the raw key (it can embed an email or ip)", () => {
  const lines = captureErrors(() => {
    failOpen("checkX", "auth_otp:someone@example.com", new Error("boom"), 1);
  });
  const all = lines.join("\n");
  assert.ok(all.includes("auth_otp:"));
  assert.equal(all.includes("someone@example.com"), false);
});

test("TUL-1139: exceeding the hourly threshold logs ONE distinct threshold error per hour", () => {
  const prev = process.env.RATE_LIMIT_FAILOPEN_ALERT_PER_HOUR;
  process.env.RATE_LIMIT_FAILOPEN_ALERT_PER_HOUR = "3";
  try {
    const lines = captureErrors(() => {
      for (let i = 0; i < 8; i++) failOpen(`lim-${i}`, "k:v", new Error("boom"), 1_000 + i);
    });
    const threshold = lines.filter((l) => l.includes("fail-open threshold exceeded"));
    assert.equal(threshold.length, 1, lines.join("\n"));
    assert.match(threshold[0], /4 in the last hour \(limit 3\)/);
    // A new hour re-arms the alert.
    const again = captureErrors(() => {
      for (let i = 0; i < 5; i++) failOpen(`lim-${i}`, "k:v", new Error("boom"), 3_700_000 + i);
    });
    assert.equal(again.filter((l) => l.includes("fail-open threshold exceeded")).length, 1);
  } finally {
    if (prev === undefined) delete process.env.RATE_LIMIT_FAILOPEN_ALERT_PER_HOUR;
    else process.env.RATE_LIMIT_FAILOPEN_ALERT_PER_HOUR = prev;
  }
});

test("TUL-1139: at or below the threshold nothing extra is logged", () => {
  const lines = captureErrors(() => {
    for (let i = 0; i < 20; i++) failOpen("same", "k:v", new Error("boom"), 5_000 + i);
  });
  assert.equal(lines.filter((l) => l.includes("threshold exceeded")).length, 0);
});
