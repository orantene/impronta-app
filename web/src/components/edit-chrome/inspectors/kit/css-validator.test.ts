/**
 * css-validator.test.ts — unit tests for the MOTION-1 CSS error-hint validator.
 *
 * Tests the three advisory checks: balanced braces, blocked at-rules, and
 * the empty-input warning. The CSSStyleSheet sandbox validation is browser-
 * only and is skipped in Node (no DOM).
 *
 * Run: npx tsx --test css-validator.test.ts (from the project root or with
 * the full path). No external test runner dependency needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateCss } from "./css-validator";

describe("validateCss", () => {
  // ── Empty / blank ──────────────────────────────────────────────────────────

  it("returns a warning for an empty string", () => {
    const errs = validateCss("");
    assert.equal(errs.length, 1, "one error for empty input");
    assert.equal(errs[0].severity, "warning");
    assert.match(errs[0].message, /empty/i);
  });

  it("returns a warning for whitespace-only input", () => {
    const errs = validateCss("   \n  ");
    assert.equal(errs.length, 1);
    assert.equal(errs[0].severity, "warning");
  });

  // ── Balanced braces ───────────────────────────────────────────────────────

  it("returns no brace error for balanced CSS", () => {
    const errs = validateCss(".foo { color: red; }");
    const braceErrors = errs.filter((e) =>
      e.message.toLowerCase().includes("brace"),
    );
    assert.equal(braceErrors.length, 0, "balanced CSS has no brace errors");
  });

  it("returns a brace error for an unclosed rule", () => {
    const errs = validateCss(".foo { color: red;");
    const braceErr = errs.find((e) =>
      e.message.toLowerCase().includes("brace"),
    );
    assert.ok(braceErr, "should detect unclosed brace");
    assert.equal(braceErr!.severity, "error");
  });

  it("returns a brace error for an extra closing brace", () => {
    const errs = validateCss(".foo { color: red; }}");
    const braceErr = errs.find((e) =>
      e.message.toLowerCase().includes("brace"),
    );
    assert.ok(braceErr, "should detect extra closing brace");
    assert.equal(braceErr!.severity, "error");
  });

  it("does not false-positive on braces inside strings", () => {
    // A CSS content property containing a brace character in a string.
    const errs = validateCss('.foo::before { content: "{"; }');
    const braceErrors = errs.filter((e) =>
      e.message.toLowerCase().includes("brace"),
    );
    assert.equal(braceErrors.length, 0, "brace inside string should not count");
  });

  it("does not false-positive on braces inside comments", () => {
    const errs = validateCss("/* { unclosed in comment */ .foo { color: red; }");
    const braceErrors = errs.filter((e) =>
      e.message.toLowerCase().includes("brace"),
    );
    assert.equal(braceErrors.length, 0, "brace inside comment should not count");
  });

  // ── Blocked at-rules ──────────────────────────────────────────────────────

  it("flags @import as an error", () => {
    const errs = validateCss("@import url('foo.css');");
    const importErr = errs.find((e) => e.message.includes("@import"));
    assert.ok(importErr, "should flag @import");
    assert.equal(importErr!.severity, "error");
  });

  it("flags @charset as an error", () => {
    const errs = validateCss('@charset "UTF-8";');
    const charsetErr = errs.find((e) => e.message.includes("@charset"));
    assert.ok(charsetErr, "should flag @charset");
    assert.equal(charsetErr!.severity, "error");
  });

  it("does not flag valid at-rules like @media, @keyframes, @supports", () => {
    const css = `
      @media (max-width: 600px) { .foo { display: none; } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @supports (display: grid) { .bar { display: grid; } }
    `;
    const errs = validateCss(css);
    // There should be no at-rule errors for the above.
    const atRuleErrors = errs.filter(
      (e) => e.message.includes("@") && e.severity === "error",
    );
    assert.equal(atRuleErrors.length, 0, "valid at-rules should not be flagged");
  });

  // ── Valid CSS ─────────────────────────────────────────────────────────────

  it("returns no errors for clean well-formed CSS", () => {
    const css = `.headline { font-size: 2rem; color: var(--color-primary); }
.body-text { line-height: 1.6; }`;
    const errs = validateCss(css);
    // In Node there's no CSSStyleSheet so sandbox check skips.
    // Only brace/at-rule checks run — both should pass.
    const hardErrors = errs.filter((e) => e.severity === "error");
    assert.equal(hardErrors.length, 0, "valid CSS should have no hard errors");
  });

  // ── Multiple issues ───────────────────────────────────────────────────────

  it("can return multiple errors (import + unbalanced)", () => {
    const errs = validateCss("@import url('x.css');\n.foo { color: red;");
    const importErr = errs.find((e) => e.message.includes("@import"));
    const braceErr = errs.find((e) => e.message.toLowerCase().includes("brace"));
    assert.ok(importErr, "should find @import error");
    assert.ok(braceErr, "should find brace error");
  });
});
