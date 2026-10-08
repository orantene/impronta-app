import assert from "node:assert/strict";
import test from "node:test";

import { isStaleImageJob, QUEUED_STALE_MS, RUNNING_STALE_MS } from "./tenant-image-job-staleness";

const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("running: stale only past the threshold, measured from started_at", () => {
  assert.equal(isStaleImageJob({ status: "running", created_at: ago(RUNNING_STALE_MS * 5), started_at: ago(60_000) }, NOW), false);
  assert.equal(isStaleImageJob({ status: "running", created_at: ago(1), started_at: ago(RUNNING_STALE_MS + 1) }, NOW), true);
  assert.equal(isStaleImageJob({ status: "running", created_at: ago(RUNNING_STALE_MS + 1), started_at: null }, NOW), true);
});

test("queued: waits through a cap reset, stale after 48h from created_at", () => {
  assert.equal(isStaleImageJob({ status: "queued", created_at: ago(QUEUED_STALE_MS - 1000), started_at: null }, NOW), false);
  assert.equal(isStaleImageJob({ status: "queued", created_at: ago(QUEUED_STALE_MS + 1), started_at: null }, NOW), true);
});

test("terminal states (done, partial, failed) are never stale", () => {
  for (const status of ["done", "partial", "failed"]) {
    assert.equal(isStaleImageJob({ status, created_at: ago(QUEUED_STALE_MS * 10), started_at: ago(QUEUED_STALE_MS * 10) }, NOW), false);
  }
});

test("unparseable or missing timestamps are never reaped", () => {
  assert.equal(isStaleImageJob({ status: "running", created_at: null, started_at: null }, NOW), false);
  assert.equal(isStaleImageJob({ status: "queued", created_at: "garbage", started_at: null }, NOW), false);
});
