import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNudgeTranslateStyle,
  NUDGE_ACCELERATION_MULTIPLIER,
  NUDGE_ACCELERATION_THRESHOLD,
  nudgeStepForRepeatCount,
  resolveNudgeBucket,
} from "./nudge";

test("resolveNudgeBucket routes tablet/mobile to their render-backed bucket", () => {
  assert.equal(resolveNudgeBucket("tablet"), "tablet");
  assert.equal(resolveNudgeBucket("mobile"), "mobile");
});

test("resolveNudgeBucket falls back to the base bucket for desktop and the non-render-backed preview tiers", () => {
  assert.equal(resolveNudgeBucket("desktop"), null);
  // Negative case: "wide"/"compact" are Advanced-only canvas-preview tiers with
  // no renderer-emitted @media bucket yet (breakpoint-registry.ts). A nudge
  // must NOT write into style.responsive.wide/.compact — nothing reads it.
  assert.equal(resolveNudgeBucket("wide"), null);
  assert.equal(resolveNudgeBucket("compact"), null);
});

test("buildNudgeTranslateStyle writes the base style.translate for the base bucket", () => {
  const next = buildNudgeTranslateStyle({
    style: { color: "red" },
    bucket: null,
    x: 5,
    y: -3,
  });
  assert.deepEqual(next, { color: "red", translate: "5px -3px" });
});

test("buildNudgeTranslateStyle drops the key at 0,0 (base bucket)", () => {
  const next = buildNudgeTranslateStyle({
    style: { translate: "5px -3px", color: "red" },
    bucket: null,
    x: 0,
    y: 0,
  });
  assert.deepEqual(next, { color: "red" });
});

test("buildNudgeTranslateStyle writes into a responsive override bucket without touching the base value", () => {
  const next = buildNudgeTranslateStyle({
    style: { translate: "20px 30px" },
    bucket: "tablet",
    x: 21,
    y: 30,
  });
  assert.deepEqual(next, {
    translate: "20px 30px",
    responsive: { tablet: { translate: "21px 30px" } },
  });
});

test("buildNudgeTranslateStyle preserves sibling fields in the same bucket", () => {
  const next = buildNudgeTranslateStyle({
    style: { responsive: { mobile: { visibility: "hidden" } } },
    bucket: "mobile",
    x: 4,
    y: 4,
  });
  assert.deepEqual(next, {
    responsive: { mobile: { visibility: "hidden", translate: "4px 4px" } },
  });
});

test("buildNudgeTranslateStyle prunes the bucket and the responsive container back out at 0,0", () => {
  const next = buildNudgeTranslateStyle({
    style: { responsive: { mobile: { translate: "4px 4px" } } },
    bucket: "mobile",
    x: 0,
    y: 0,
  });
  assert.deepEqual(next, {});
});

test("buildNudgeTranslateStyle keeps a sibling bucket key when clearing translate", () => {
  const next = buildNudgeTranslateStyle({
    style: { responsive: { mobile: { translate: "4px 4px", visibility: "hidden" } } },
    bucket: "mobile",
    x: 0,
    y: 0,
  });
  assert.deepEqual(next, { responsive: { mobile: { visibility: "hidden" } } });
});

test("buildNudgeTranslateStyle keeps another device's bucket untouched", () => {
  const next = buildNudgeTranslateStyle({
    style: { responsive: { tablet: { translate: "1px 1px" } } },
    bucket: "mobile",
    x: 2,
    y: 2,
  });
  assert.deepEqual(next, {
    responsive: {
      tablet: { translate: "1px 1px" },
      mobile: { translate: "2px 2px" },
    },
  });
});

test("nudgeStepForRepeatCount holds the base step under the acceleration threshold", () => {
  assert.equal(nudgeStepForRepeatCount(1, 0), 1);
  assert.equal(nudgeStepForRepeatCount(1, NUDGE_ACCELERATION_THRESHOLD - 1), 1);
  assert.equal(nudgeStepForRepeatCount(10, 5), 10);
});

test("nudgeStepForRepeatCount accelerates x4 at and beyond the threshold", () => {
  assert.equal(
    nudgeStepForRepeatCount(1, NUDGE_ACCELERATION_THRESHOLD),
    NUDGE_ACCELERATION_MULTIPLIER,
  );
  assert.equal(
    nudgeStepForRepeatCount(10, NUDGE_ACCELERATION_THRESHOLD + 50),
    10 * NUDGE_ACCELERATION_MULTIPLIER,
  );
});

// Negative test: a non-arrow / unrelated repeat count must never accelerate a
// step of 0 into something non-zero (guards against a stray truthy check).
test("nudgeStepForRepeatCount never manufactures movement from a zero base step", () => {
  assert.equal(nudgeStepForRepeatCount(0, NUDGE_ACCELERATION_THRESHOLD), 0);
});
