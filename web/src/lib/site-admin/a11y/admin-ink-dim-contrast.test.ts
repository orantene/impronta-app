/**
 * A11Y: the admin `ink-dim` text token meets WCAG AA (TUL-1189).
 *
 * `--color-admin-ink-dim` was ink at 38% alpha: 2.5:1 on white and on every
 * admin surface, against 4.5:1 for normal text. It backs `text-admin-ink-dim`
 * (251 files) and `var(--color-admin-ink-dim)` aliases, so one low value put
 * empty states, eyebrows, hints and captions below AA across the whole admin.
 *
 * The token is a translucent ink, so the test composes its alpha over each
 * surface the text sits on and measures the resulting solid colour.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { contrastRatio } from "./contrast";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CSS = readFileSync(path.join(WEB_ROOT, "src/styles/admin-color-bridge.css"), "utf8");

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function tokenHex(name: string): string {
  const m = CSS.match(new RegExp(`--color-admin-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--color-admin-${name} is a 6-digit hex in admin-color-bridge.css`);
  return m[1];
}

function tokenAlpha(name: string): { rgb: Rgb; alpha: number } {
  const m = CSS.match(
    new RegExp(`--color-admin-${name}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([0-9.]+)\\s*\\)`),
  );
  assert.ok(m, `--color-admin-${name} is an rgba(...) value in admin-color-bridge.css`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}

/** Source-over: fg at `alpha` on an opaque `bg`, as a solid `rgb(r, g, b)` string. */
function over(fg: Rgb, alpha: number, bg: Rgb): string {
  const c = fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const rgbString = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const SURFACES: Array<[string, Rgb]> = [
  ["card", hexToRgb(tokenHex("card"))],
  ["surface", hexToRgb(tokenHex("surface"))],
  ["surface-alt", hexToRgb(tokenHex("surface-alt"))],
  // Status pills tint these hues at 10% over white (measured by axe on /talent/today).
  ["coral 10% tint", hexToRgb("#F9F0EC")],
  ["green 10% tint", hexToRgb("#EAF2EF")],
];

test("ink-dim reaches 4.5:1 on every admin surface it sits on", () => {
  const dim = tokenAlpha("ink-dim");
  for (const [name, bg] of SURFACES) {
    const ratio = contrastRatio(over(dim.rgb, dim.alpha, bg), rgbString(bg));
    assert.ok(ratio !== null, `${name}: ratio computed`);
    assert.ok(ratio >= 4.5, `ink-dim at alpha ${dim.alpha} on ${name} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
  }
});

test("ink-dim stays visibly lighter than ink-muted, so the text hierarchy holds", () => {
  const dim = tokenAlpha("ink-dim");
  const muted = tokenAlpha("ink-muted");
  assert.ok(dim.alpha < muted.alpha, `ink-dim (${dim.alpha}) is below ink-muted (${muted.alpha})`);
});

test("the contrast helper agrees with the old failing value (guards the test itself)", () => {
  const white: Rgb = [255, 255, 255];
  const old = contrastRatio(over([11, 11, 13], 0.38, white), rgbString(white));
  assert.ok(old !== null && old < 3, `the old 0.38 value is ~2.5:1, got ${old}`);
});
