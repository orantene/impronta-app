import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IG_REFRESH_WINDOW_MS,
  MAX_CONSECUTIVE_FAILURES,
  backoffElapsed,
  failureConfig,
  isFatalFailure,
  needsRefresh,
} from "./token-policy";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();

test("needsRefresh: unknown or unparsable expiry is always due", () => {
  assert.equal(needsRefresh(undefined, IG_REFRESH_WINDOW_MS, NOW), true);
  assert.equal(needsRefresh("not a date", IG_REFRESH_WINDOW_MS, NOW), true);
});

test("needsRefresh: Instagram refreshes inside 15 days, not before", () => {
  const in20d = new Date(NOW + 20 * 86_400_000).toISOString();
  const in10d = new Date(NOW + 10 * 86_400_000).toISOString();
  assert.equal(needsRefresh(in20d, IG_REFRESH_WINDOW_MS, NOW), false);
  assert.equal(needsRefresh(in10d, IG_REFRESH_WINDOW_MS, NOW), true);
});

test("backoff doubles from 30 minutes per consecutive failure", () => {
  const at = (minutesAgo: number, failures: number) => ({
    refresh_consecutive_failures: failures,
    refresh_last_failure_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  });
  assert.equal(backoffElapsed({}, NOW), true);
  assert.equal(backoffElapsed(at(29, 1), NOW), false);
  assert.equal(backoffElapsed(at(30, 1), NOW), true);
  assert.equal(backoffElapsed(at(59, 2), NOW), false);
  assert.equal(backoffElapsed(at(60, 2), NOW), true);
});

test("only a 4xx is fatal", () => {
  assert.equal(isFatalFailure(400), true);
  assert.equal(isFatalFailure(401), true);
  assert.equal(isFatalFailure(500), false);
  assert.equal(isFatalFailure(undefined), false);
});

test("a fatal failure flags reconnect and transitions once", () => {
  const first = failureConfig({ handle: "jorg" }, "dead", { fatal: true, nowIso: NOW_ISO });
  assert.equal(first.flagged, true);
  assert.equal(first.transitioned, true);
  assert.equal(first.config.handle, "jorg");
  assert.equal(first.config.needs_reconnect, true);
  assert.equal(first.config.refresh_consecutive_failures, 1);

  const again = failureConfig(first.config, "dead", { fatal: true, nowIso: NOW_ISO });
  assert.equal(again.flagged, true);
  assert.equal(again.transitioned, false);
});

test("transient failures flag only at the threshold", () => {
  let config: Record<string, unknown> = {};
  for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
    const next = failureConfig(config, "blip", { fatal: false, nowIso: NOW_ISO });
    assert.equal(next.flagged, false);
    config = next.config;
  }
  const last = failureConfig(config, "blip", { fatal: false, nowIso: NOW_ISO });
  assert.equal(last.flagged, true);
  assert.equal(last.transitioned, true);
  assert.equal(last.config.refresh_consecutive_failures, MAX_CONSECUTIVE_FAILURES);
});
