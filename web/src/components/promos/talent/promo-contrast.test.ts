import assert from "node:assert/strict";
import test from "node:test";

/** WCAG 2.x contrast for the promo dashboard token fallbacks (ui.tsx). */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: [string, string, string][] = [
  ["ink on white", "#1c1c1e", "#ffffff"],
  ["muted on white", "#6b6b73", "#ffffff"],
  ["ink on soft", "#1c1c1e", "#e6f4f1"],
  ["muted on soft", "#6b6b73", "#e6f4f1"],
  ["muted on canvas", "#6b6b73", "#fafafa"],
  ["white on action teal", "#ffffff", "#0f766e"],
];
for (const [name, fg, bg] of PAIRS) {
  test(`contrast >= 4.5: ${name}`, () => {
    const r = contrast(fg, bg);
    assert.ok(r >= 4.5, `${name} is ${r.toFixed(2)}`);
  });
}
