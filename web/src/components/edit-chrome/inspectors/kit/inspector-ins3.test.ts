/**
 * INS-3 unit tests.
 *
 * Two suites:
 *   1. Drag-scrub delta math — verifies the value delta calculation logic
 *      extracted from the NumberUnit pointerMove handler, including modifier
 *      key step scaling and min/max clamping.
 *   2. Inspector search filter predicate — verifies the useInspectorSearchFilter
 *      matching logic (case-insensitive substring) used by InspectorSection,
 *      InspectorAccordion and InspectorField.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

// ── 1. Drag-scrub delta math ─────────────────────────────────────────────────

/**
 * Pure version of the scrub delta computation extracted from NumberUnit's
 * pointerMove handler. Computes the next value given a horizontal pixel
 * displacement, a base step, optional modifier, and optional clamp bounds.
 */
function computeScrubValue(opts: {
  startValue: number;
  dx: number;
  step: number;
  shift?: boolean;
  alt?: boolean;
  min?: number;
  max?: number;
}): number {
  const { startValue, dx, step, shift = false, alt = false, min, max } = opts;
  const effectiveStep = shift ? step * 10 : alt ? step / 10 : step;
  const rawNext = startValue + dx * effectiveStep;
  let snapped = Math.round(rawNext / effectiveStep) * effectiveStep;
  if (typeof min === "number" && snapped < min) snapped = min;
  if (typeof max === "number" && snapped > max) snapped = max;
  // Round to avoid floating-point noise.
  return Math.round(snapped * 100) / 100;
}

describe("drag-scrub delta math", () => {
  it("increases value by step * dx", () => {
    const result = computeScrubValue({ startValue: 10, dx: 5, step: 1 });
    assert.equal(result, 15);
  });

  it("decreases value by step * abs(dx) on negative dx", () => {
    const result = computeScrubValue({ startValue: 20, dx: -3, step: 2 });
    assert.equal(result, 14);
  });

  it("Shift modifier multiplies step by 10", () => {
    const result = computeScrubValue({ startValue: 0, dx: 1, step: 1, shift: true });
    assert.equal(result, 10);
  });

  it("Alt modifier divides step by 10", () => {
    const result = computeScrubValue({ startValue: 0, dx: 10, step: 1, alt: true });
    // effectiveStep = 0.1; rawNext = 0 + 10 * 0.1 = 1; snapped = round(1/0.1)*0.1 = 1
    assert.equal(result, 1);
  });

  it("clamps to min when result would be below min", () => {
    const result = computeScrubValue({ startValue: 5, dx: -20, step: 1, min: 0 });
    assert.equal(result, 0);
  });

  it("clamps to max when result would exceed max", () => {
    const result = computeScrubValue({ startValue: 90, dx: 50, step: 1, max: 100 });
    assert.equal(result, 100);
  });

  it("handles fractional steps without floating-point noise", () => {
    const result = computeScrubValue({ startValue: 0, dx: 3, step: 1, alt: true });
    // effectiveStep = 0.1; rawNext = 0.3; snapped = round(0.3/0.1)*0.1 = 3*0.1 = 0.3
    assert.equal(result, 0.3);
  });

  it("handles zero dx (no movement)", () => {
    const result = computeScrubValue({ startValue: 42, dx: 0, step: 1 });
    assert.equal(result, 42);
  });
});

// ── 2. Inspector search filter predicate ─────────────────────────────────────

/**
 * Pure version of the search filter predicate from useInspectorSearchFilter.
 * Returns true if the label(s) should be HIDDEN (filtered OUT).
 */
function isHiddenBySearch(labels: string | string[], query: string): boolean {
  if (!query.trim()) return false;
  const q = query.toLowerCase();
  const arr = Array.isArray(labels) ? labels : [labels];
  return !arr.some((l) => l.toLowerCase().includes(q));
}

describe("inspector search filter predicate", () => {
  it("empty query never hides anything", () => {
    assert.equal(isHiddenBySearch("Background color", ""), false);
  });

  it("whitespace-only query never hides anything", () => {
    assert.equal(isHiddenBySearch("Padding", "   "), false);
  });

  it("exact match is NOT hidden", () => {
    assert.equal(isHiddenBySearch("Background color", "background color"), false);
  });

  it("partial match is NOT hidden", () => {
    assert.equal(isHiddenBySearch("Background color", "color"), false);
  });

  it("case-insensitive match is NOT hidden", () => {
    assert.equal(isHiddenBySearch("Font size", "FONT"), false);
  });

  it("no match IS hidden", () => {
    assert.equal(isHiddenBySearch("Padding top", "color"), true);
  });

  it("any label in array matching keeps visible", () => {
    assert.equal(isHiddenBySearch(["Margin", "Spacing controls"], "spacing"), false);
  });

  it("no labels in array matching means hidden", () => {
    assert.equal(isHiddenBySearch(["Margin", "Padding"], "color"), true);
  });

  it("empty label array always hidden when query present", () => {
    assert.equal(isHiddenBySearch([], "color"), true);
  });

  it("empty string label doesn't match query", () => {
    // An empty string label doesn't contain "color"
    assert.equal(isHiddenBySearch("", "color"), true);
  });
});
