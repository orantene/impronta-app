import { test } from "node:test";
import assert from "node:assert/strict";
import { linesNeedingCompensation } from "./capacity-lost-compensation";

test("a live commit does not open compensation", () => {
  assert.equal(
    linesNeedingCompensation({
      holdExpiresAt: "2026-09-08T12:00:00Z",
      holdAllocationCount: 2,
      commitFailed: false,
      committed: 2,
    }),
    false,
  );
});

test("commit refused after payment needs compensation", () => {
  assert.equal(
    linesNeedingCompensation({
      holdExpiresAt: "2026-09-08T12:00:00Z",
      holdAllocationCount: 1,
      commitFailed: true,
      committed: 0,
    }),
    true,
  );
});

test("holds were present and none committed", () => {
  assert.equal(
    linesNeedingCompensation({
      holdExpiresAt: null,
      holdAllocationCount: 1,
      commitFailed: false,
      committed: 0,
    }),
    true,
  );
});

test("the hold already lapsed (timestamp still on the order, allocations gone)", () => {
  assert.equal(
    linesNeedingCompensation({
      holdExpiresAt: "2026-09-08T11:00:00Z",
      holdAllocationCount: 0,
      commitFailed: false,
      committed: 0,
    }),
    true,
  );
});

test("a paid order that never held capacity is not compensated", () => {
  assert.equal(
    linesNeedingCompensation({
      holdExpiresAt: null,
      holdAllocationCount: 0,
      commitFailed: false,
      committed: 0,
    }),
    false,
  );
});
