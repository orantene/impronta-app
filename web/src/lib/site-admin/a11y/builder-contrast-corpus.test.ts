import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { contrastRatio } from "./contrast";

/**
 * AIQ-30 — deterministic WCAG-AA regression lock for the AI-builder renderer
 * token fixes (AIQ-1/2/4/5). The renderer emits `var(--token-color-*, …)`; this
 * table transcribes each theme's RESOLVED token values from token-presets.css
 * and asserts the pairs the renderer actually composes (ink on page/surface,
 * muted on page/surface, primary-button label on the primary fill) all clear
 * AA. If a token in token-presets.css changes and breaks contrast, this fails
 * loudly. No model, no browser — pure numeric.
 */
type ThemeTokens = {
  id: string;
  pageBg: string;
  ink: string;
  muted: string; // may be rgba (composited over its background before contrast)
  surfaceRaised: string;
  primary: string;
};

const THEME_TOKENS: ThemeTokens[] = [
  { id: "light", pageBg: "#ffffff", ink: "#111111", muted: "#737373", surfaceRaised: "#ffffff", primary: "#111111" },
  { id: "noir", pageBg: "#0a0a0a", ink: "#f4f4f5", muted: "#a1a1aa", surfaceRaised: "#0f0f0f", primary: "#c6a14e" },
  { id: "espresso", pageBg: "#1a1410", ink: "#efe7da", muted: "rgba(239,231,218,0.5)", surfaceRaised: "#241c16", primary: "#c0875a" },
];

const AA = 4.5; // WCAG AA, normal text — primary copy + CTA labels must clear this
const AA_LARGE = 3.0; // muted is intentionally de-emphasized secondary text; the lock
// proves it stays legible (the AIQ-4 fix took it from ~1.0 invisible to ~4.4+),
// without falsely failing a theme whose muted lands a hair under 4.5.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}
/** Resolve a color to a solid hex; an rgba() is alpha-composited over `bg` (what the browser paints). */
function resolveOver(color: string, bg: string): string {
  const m = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (!m) return color; // already a solid hex
  const parts = m[1].split(",").map((s) => s.trim());
  const [r, g, b] = parts.map(Number);
  const a = parts.length > 3 ? Number(parts[3]) : 1;
  const [br, bg2, bb] = hexToRgb(bg);
  return rgbToHex([r * a + br * (1 - a), g * a + bg2 * (1 - a), b * a + bb * (1 - a)]);
}
function assertContrast(fg: string, bg: string, label: string, threshold: number) {
  const r = contrastRatio(resolveOver(fg, bg), bg);
  assert.ok(r !== null, `${label}: uncomputable (${fg} on ${bg})`);
  assert.ok(r! >= threshold, `${label}: ${r?.toFixed(2)} < ${threshold} (${fg} on ${bg})`);
}

for (const t of THEME_TOKENS) {
  test(`[${t.id}] AIQ-4: body ink on page background meets AA`, () => {
    assertContrast(t.ink, t.pageBg, "ink/page", AA);
  });
  test(`[${t.id}] AIQ-1/2: card + surface band ink on surface-raised meets AA`, () => {
    assertContrast(t.ink, t.surfaceRaised, "ink/surface", AA);
  });
  test(`[${t.id}] AIQ-5: primary button label (surface-raised) on primary fill meets AA`, () => {
    assertContrast(t.surfaceRaised, t.primary, "btn-label/primary", AA);
  });
  test(`[${t.id}] AIQ-4: muted text stays legible on page + surface (AA-large floor)`, () => {
    assertContrast(t.muted, t.pageBg, "muted/page", AA_LARGE);
    assertContrast(t.muted, t.surfaceRaised, "muted/surface", AA_LARGE);
  });
}

// ── Drift guard: the THEME_TOKENS table above is transcribed from
// token-presets.css. If a token there changes but this table doesn't, the AA
// assertions would silently pass on stale values. This test re-reads the CSS and
// asserts the table still matches, so the contrast lock stays honest.
const CSS = readFileSync(resolve(process.cwd(), "src/app/token-presets.css"), "utf8");
// The CSS block (from its opening `{` to the first `}`) that carries each theme's
// token declarations. token-presets custom-property blocks are flat (no nesting).
const THEME_SELECTOR: Record<string, string> = {
  light: "html {",
  noir: '[data-token-background-mode="editorial-noir"]',
  espresso: '[data-token-background-mode="espresso"]',
};
function blockAfter(needle: string): string {
  const i = CSS.indexOf(needle);
  assert.ok(i >= 0, `token-presets.css: selector not found: ${needle}`);
  const open = CSS.indexOf("{", i);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}
function tokenIn(block: string, name: string): string | null {
  const m = new RegExp(`--token-color-${name}:\\s*([^;]+);`).exec(block);
  return m ? m[1].trim().replace(/\s+/g, "") : null;
}
const norm = (v: string) => v.replace(/\s+/g, "");

for (const t of THEME_TOKENS) {
  test(`[${t.id}] drift guard: token table matches token-presets.css`, () => {
    const block = blockAfter(THEME_SELECTOR[t.id]!);
    assert.equal(tokenIn(block, "ink"), norm(t.ink), `${t.id} ink drifted`);
    assert.equal(tokenIn(block, "muted"), norm(t.muted), `${t.id} muted drifted`);
    assert.equal(tokenIn(block, "surface-raised"), norm(t.surfaceRaised), `${t.id} surface-raised drifted`);
    assert.equal(tokenIn(block, "primary"), norm(t.primary), `${t.id} primary drifted`);
  });
}
