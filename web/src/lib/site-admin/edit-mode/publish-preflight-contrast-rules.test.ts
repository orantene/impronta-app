/**
 * WS4 — unit tests for the contrast preflight rules.
 *
 * Runs with the node test runner (tsx --test), same as the other
 * publish-preflight-*.test.ts files in this directory.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectContrastPreflightIssues } from "./publish-preflight-contrast-rules";

describe("collectContrastPreflightIssues", () => {
  it("returns empty array for null tokens (best-effort skip)", () => {
    const issues = collectContrastPreflightIssues(null);
    assert.deepStrictEqual(issues, []);
  });

  it("returns empty array when all pairs pass WCAG AA", () => {
    // High-contrast pairings all pass easily.
    const tokens: Record<string, string> = {
      "color.ink": "#000000",
      "color.surface-raised": "#ffffff",
      "color.primary": "#000000",
      "color.background": "#ffffff",
      "color.secondary": "#000000",
      "color.muted": "#595959", // exactly 7:1 on white — AAA
      "color.accent": "#000000",
    };
    const issues = collectContrastPreflightIssues(tokens);
    assert.strictEqual(issues.length, 0);
  });

  it("flags a pair that fails WCAG AA with verdict 'fail'", () => {
    // Light grey on white — extremely low contrast
    const tokens: Record<string, string> = {
      "color.ink": "#cccccc",
      "color.surface-raised": "#ffffff",
      "color.primary": "#000000",
      "color.background": "#ffffff",
      "color.secondary": "#000000",
      "color.muted": "#000000",
      "color.accent": "#000000",
    };
    const issues = collectContrastPreflightIssues(tokens);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0]?.verdict, "fail");
    assert.ok(issues[0]?.pairLabel.includes("Ink on Surface"));
    assert.ok(issues[0]?.ratio !== undefined && issues[0].ratio < 3);
    assert.ok(issues[0]?.message.includes("fails WCAG AA"));
  });

  it("flags a pair that passes AA large but not AA small with verdict 'aa-large'", () => {
    // Ratio ~3.6 — passes for large text (3:1) but not small (4.5:1)
    const tokens: Record<string, string> = {
      "color.ink": "#767676", // ~4.54:1 on white — right at AA boundary; use something just below
      "color.surface-raised": "#ffffff",
      "color.primary": "#000000",
      "color.background": "#ffffff",
      "color.secondary": "#000000",
      "color.muted": "#000000",
      // Accent with ratio ~3.5 on white background
      "color.accent": "#7a9fb8",
    };
    const issues = collectContrastPreflightIssues(tokens);
    // ink (#767676 on #ffffff) = ~4.54 — borderline. Use a definitely aa-large value:
    // For a reliable test, override with a known pair:
    const tokensKnown: Record<string, string> = {
      "color.ink": "#000000",
      "color.surface-raised": "#ffffff",
      "color.primary": "#000000",
      "color.background": "#ffffff",
      "color.secondary": "#000000",
      "color.muted": "#888888", // ~3.9:1 on white — aa-large only
      "color.accent": "#000000",
    };
    const knownIssues = collectContrastPreflightIssues(tokensKnown);
    assert.strictEqual(knownIssues.length, 1);
    assert.strictEqual(knownIssues[0]?.verdict, "aa-large");
    assert.ok(knownIssues[0]?.message.includes("large text"));
  });

  it("surfaces issues for all 5 pairs when all fail", () => {
    // All same shade — near-zero contrast
    const tokens: Record<string, string> = {
      "color.ink": "#888888",
      "color.surface-raised": "#999999",
      "color.primary": "#aaaaaa",
      "color.background": "#bbbbbb",
      "color.secondary": "#cccccc",
      "color.muted": "#dddddd",
      "color.accent": "#eeeeee",
    };
    const issues = collectContrastPreflightIssues(tokens);
    assert.strictEqual(issues.length, 5);
  });

  it("uses registry-default fallbacks when a token key is absent", () => {
    // Empty token map — should fall back to defaults and run without error.
    const issues = collectContrastPreflightIssues({});
    // Registry defaults are mostly high-contrast; just confirm no throw.
    assert.ok(Array.isArray(issues));
  });
});
