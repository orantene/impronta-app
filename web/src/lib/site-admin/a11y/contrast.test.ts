/**
 * A11Y-2 — Contrast token gate.
 *
 * Asserts that the editor-chrome tokens raised in this workstream meet WCAG AA
 * (4.5:1 for normal text). This is a pure numeric test using the shared
 * relativeLuminance / contrastRatio util; no DOM, no React, no Supabase.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio, classifyContrast } from "./contrast";

/**
 * Approximate the effective sRGB color when an RGBA value is composited over
 * a solid opaque background. Alpha must be in [0,1].
 */
function blendOverHex(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): string {
  const [r, g, b] = fg.map((c, i) =>
    Math.round(alpha * c + (1 - alpha) * bg[i]),
  );
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ── Shared edit-shell chrome tokens ─────────────────────────────────────────

test("edit-shell --muted-foreground #6b6b73 on --background #ffffff meets AA", () => {
  const ratio = contrastRatio("#6b6b73", "#ffffff");
  assert.ok(ratio !== null, "ratio should be computable");
  assert.ok(
    ratio! >= 4.5,
    `Expected >= 4.5 but got ${ratio?.toFixed(2)}`,
  );
  assert.strictEqual(classifyContrast(ratio), "aa");
});

test("edit-shell --muted-foreground #6b6b73 on --muted #f4f4f5 meets AA", () => {
  const ratio = contrastRatio("#6b6b73", "#f4f4f5");
  assert.ok(ratio !== null);
  assert.ok(
    ratio! >= 4.5,
    `Expected >= 4.5 but got ${ratio?.toFixed(2)}`,
  );
});

// ── A11Y-2 fixed token: --admin-gold-muted dark theme ───────────────────────
//
// Before: rgba(228,228,231,0.45) on dark sidebar #0f0f10 → ~3.82:1 (FAIL)
// After:  rgba(228,228,231,0.60) on dark sidebar #0f0f10 → ~5.94:1 (PASS)
//
// Used as small-text labels in inspector-job-section, admin-shell nav-groups,
// and inquiry/booking/talent inspector dt elements.

const SIDEBAR_DARK_BG: [number, number, number] = [15, 15, 16]; // #0f0f10
const LABEL_FG: [number, number, number] = [228, 228, 231];

test("admin-gold-muted dark AFTER fix (0.60 opacity) passes AA on dark sidebar", () => {
  const effective = blendOverHex(LABEL_FG, 0.60, SIDEBAR_DARK_BG);
  const ratio = contrastRatio(effective, "#0f0f10");
  assert.ok(ratio !== null);
  assert.ok(
    ratio! >= 4.5,
    `Expected >= 4.5 but got ${ratio?.toFixed(2)} for ${effective} on #0f0f10`,
  );
});

test("admin-gold-muted dark BEFORE fix (0.45 opacity) would fail AA on dark sidebar", () => {
  // Documents the pre-fix state — this assertion proves the token was borderline.
  const effective = blendOverHex(LABEL_FG, 0.45, SIDEBAR_DARK_BG);
  const ratio = contrastRatio(effective, "#0f0f10");
  assert.ok(ratio !== null);
  assert.ok(
    ratio! < 4.5,
    `Expected < 4.5 (pre-fix state) but got ${ratio?.toFixed(2)}`,
  );
});

// ── Admin light-theme nav idle — already passing, regression guard ───────────

test("admin-nav-idle light (rgba(242,242,242,0.62)) on dark sidebar #0d0d10 passes AA", () => {
  const bg: [number, number, number] = [13, 13, 16]; // #0d0d10
  const effective = blendOverHex([242, 242, 242], 0.62, bg);
  const ratio = contrastRatio(effective, "#0d0d10");
  assert.ok(ratio !== null);
  assert.ok(
    ratio! >= 4.5,
    `Expected >= 4.5 but got ${ratio?.toFixed(2)}`,
  );
});

// ── Admin dark-theme nav idle — already passing, regression guard ─────────────

test("admin-nav-idle dark (rgba(228,228,231,0.58)) on dark sidebar #0f0f10 passes AA", () => {
  const effective = blendOverHex([228, 228, 231], 0.58, SIDEBAR_DARK_BG);
  const ratio = contrastRatio(effective, "#0f0f10");
  assert.ok(ratio !== null);
  assert.ok(
    ratio! >= 4.5,
    `Expected >= 4.5 but got ${ratio?.toFixed(2)}`,
  );
});
