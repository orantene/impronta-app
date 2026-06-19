/**
 * hide-impact.test.ts — D6 unit tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/hide-impact.test.ts
 *
 * Covers the PURE "build the impact message from usage count + dependent count"
 * logic that powers the where-used confirm before a one-way hide/archive
 * (no DB, no I/O):
 *   1. zero usage + zero dependents → reassuring "safe / nothing references it"
 *   2. live-page usage → "used on N live pages; they keep their copy but it
 *      leaves the gallery" (singular vs plural handled)
 *   3. template dependents → "N other templates embed it" (singular vs plural)
 *   4. both signals → both clauses, joined
 *   5. the `hide` vs `archive` verb threads into the copy
 *   6. loadBearing flag = (usage > 0 || dependents > 0)
 *   7. negative / NaN / fractional counts clamp to a non-negative integer
 *   8. buildHideImpact composes the shape (counts + flag + message) consistently
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHideImpactMessage, buildHideImpact } from "./hide-impact";

describe("buildHideImpactMessage", () => {
  it("reassures when nothing references the component (archive)", () => {
    const msg = buildHideImpactMessage(0, 0, "archive");
    assert.match(msg, /Archiving this is safe/);
    assert.match(msg, /nothing currently references it/);
    // No usage / dependent COUNT clause should appear in the reassuring copy.
    assert.doesNotMatch(msg, /used on \d+ live page/);
    assert.doesNotMatch(msg, /\d+ other template/);
  });

  it("surfaces live-page usage with the keep-their-copy framing", () => {
    const msg = buildHideImpactMessage(3, 0, "archive");
    assert.match(msg, /one-way switch/);
    assert.match(msg, /used on 3 live pages/);
    assert.match(msg, /they keep their copy, but it leaves the gallery/);
    // No dependent clause when dependentCount is 0.
    assert.doesNotMatch(msg, /embed it/);
  });

  it("uses the singular for exactly one live page", () => {
    const msg = buildHideImpactMessage(1, 0, "archive");
    assert.match(msg, /used on 1 live page\b/);
    assert.doesNotMatch(msg, /1 live pages/);
  });

  it("surfaces template dependents (singular vs plural)", () => {
    assert.match(buildHideImpactMessage(0, 1), /1 other template embed it/);
    assert.match(buildHideImpactMessage(0, 2), /2 other templates embed it/);
  });

  it("joins both clauses when both signals are non-zero", () => {
    const msg = buildHideImpactMessage(2, 4, "archive");
    assert.match(msg, /used on 2 live pages/);
    assert.match(msg, /4 other templates embed it/);
    // Joined with a semicolon inside the one-way-switch sentence.
    assert.match(msg, /gallery; 4 other templates embed it\./);
  });

  it("threads the hide verb when action='hide'", () => {
    assert.match(buildHideImpactMessage(0, 0, "hide"), /Hiding this is safe/);
    assert.match(buildHideImpactMessage(1, 0, "hide"), /Hiding this is a one-way switch/);
  });

  it("clamps negative / NaN / fractional counts to a non-negative integer", () => {
    // Negative + NaN → treated as 0 (safe message).
    assert.match(buildHideImpactMessage(-5, 0), /Archiving this is safe/);
    assert.match(buildHideImpactMessage(Number.NaN, Number.NaN), /safe/);
    // Fractional → floored.
    assert.match(buildHideImpactMessage(2.9, 0), /used on 2 live pages/);
  });
});

describe("buildHideImpact", () => {
  it("composes counts + loadBearing + message (unused → not load-bearing)", () => {
    const impact = buildHideImpact(0, 0, "archive");
    assert.equal(impact.usageCount, 0);
    assert.equal(impact.dependentCount, 0);
    assert.equal(impact.loadBearing, false);
    assert.equal(
      impact.message,
      buildHideImpactMessage(0, 0, "archive"),
    );
  });

  it("flags load-bearing when usage alone is non-zero", () => {
    const impact = buildHideImpact(1, 0);
    assert.equal(impact.loadBearing, true);
    assert.equal(impact.usageCount, 1);
  });

  it("flags load-bearing when dependents alone are non-zero", () => {
    const impact = buildHideImpact(0, 3);
    assert.equal(impact.loadBearing, true);
    assert.equal(impact.dependentCount, 3);
  });

  it("normalizes the stored counts the same way the message does", () => {
    const impact = buildHideImpact(-2, 4.6, "hide");
    assert.equal(impact.usageCount, 0);
    assert.equal(impact.dependentCount, 4);
    assert.equal(impact.loadBearing, true);
    assert.match(impact.message, /Hiding this is a one-way switch/);
  });
});
