/**
 * visual-effect-models.test.ts — the value grammar behind the visual effect
 * controls. Round-trips, honest-refusal cases (a value the grammar cannot own
 * parses to null / raw instead of a defaulted approximation), and the save-cap
 * guards that keep a composed value from being silently dropped by zod.
 *
 * The WIRED behavior (clicks emitting patches) is pinned separately in
 * visual-effect-wiring.test.tsx; this file is the pure half.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BORDER_WIDTH_MAX_CHARS,
  BOX_SHADOW_MAX_CHARS,
  composeBorderSideWidths,
  composeCornerRadius,
  composeGlassBackdrop,
  composeShadowLayer,
  composeShadowStack,
  GLASS_SURFACE_PATCH,
  parseBorderSideWidths,
  parseCornerRadius,
  parseGlassBackdrop,
  parseShadowLayer,
  parseShadowStack,
  splitTopLevelCommas,
} from "./visual-effect-models";

// ── splitTopLevelCommas ─────────────────────────────────────────────────────

test("splitTopLevelCommas ignores commas inside functional colors", () => {
  assert.deepEqual(
    splitTopLevelCommas("0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10)"),
    ["0 1px 2px rgba(0,0,0,0.06)", "0 1px 3px rgba(0,0,0,0.10)"],
  );
});

// ── Glass backdrop ──────────────────────────────────────────────────────────

test("glass: blur-only and blur+saturate round-trip", () => {
  assert.deepEqual(parseGlassBackdrop("blur(12px)"), { blur: 12, saturate: null });
  assert.deepEqual(parseGlassBackdrop("blur(12px) saturate(1.4)"), {
    blur: 12,
    saturate: 1.4,
  });
  // Order-insensitive parse, canonical compose.
  assert.deepEqual(parseGlassBackdrop("saturate(1.4) blur(12px)"), {
    blur: 12,
    saturate: 1.4,
  });
  assert.equal(
    composeGlassBackdrop({ blur: 12, saturate: 1.4 }),
    "blur(12px) saturate(1.4)",
  );
  assert.equal(composeGlassBackdrop({ blur: 8, saturate: null }), "blur(8px)");
});

test("glass: a filter outside the grammar refuses to parse (no silent snap)", () => {
  assert.equal(parseGlassBackdrop("blur(4px) invert(1)"), null);
  assert.equal(parseGlassBackdrop("brightness(1.2)"), null);
  assert.equal(parseGlassBackdrop("blur(4px) blur(8px)"), null);
  assert.equal(parseGlassBackdrop(""), null);
  assert.equal(parseGlassBackdrop(undefined), null);
});

test("glass: the one-click preset parses back into its own controls", () => {
  const parsed = parseGlassBackdrop(GLASS_SURFACE_PATCH.backdropFilter);
  assert.ok(parsed, "the preset's backdropFilter is inside the grammar");
  assert.equal(GLASS_SURFACE_PATCH.borderWidth, "1px");
  assert.equal(GLASS_SURFACE_PATCH.borderStyle, "solid");
});

// ── Per-corner radius ───────────────────────────────────────────────────────

test("corner radius: every shorthand arity expands per CSS rules", () => {
  assert.deepEqual(parseCornerRadius("16px"), {
    topLeft: "16px", topRight: "16px", bottomRight: "16px", bottomLeft: "16px",
  });
  assert.deepEqual(parseCornerRadius("16px 0"), {
    topLeft: "16px", topRight: "0", bottomRight: "16px", bottomLeft: "0",
  });
  assert.deepEqual(parseCornerRadius("1px 2px 3px"), {
    topLeft: "1px", topRight: "2px", bottomRight: "3px", bottomLeft: "2px",
  });
  assert.deepEqual(parseCornerRadius("16px 16px 0 0"), {
    topLeft: "16px", topRight: "16px", bottomRight: "0", bottomLeft: "0",
  });
});

test("corner radius: compose is minimal and round-trips", () => {
  assert.equal(
    composeCornerRadius({ topLeft: "16px", topRight: "16px", bottomRight: "16px", bottomLeft: "16px" }),
    "16px",
  );
  assert.equal(
    composeCornerRadius({ topLeft: "16px", topRight: "16px", bottomRight: "0", bottomLeft: "0" }),
    "16px 16px 0 0",
  );
  assert.equal(
    composeCornerRadius({ topLeft: "8px", topRight: "0", bottomRight: "8px", bottomLeft: "0" }),
    "8px 0",
  );
});

test("corner radius: elliptical, calc, and token values refuse to parse", () => {
  assert.equal(parseCornerRadius("16px / 8px"), null);
  assert.equal(parseCornerRadius("calc(1rem + 2px)"), null);
  assert.equal(parseCornerRadius("token:radius.md"), null);
  assert.equal(parseCornerRadius("var(--r)"), null);
});

// ── Per-side border widths ──────────────────────────────────────────────────

test("border sides: parse accepts px and bare zero; compose is minimal", () => {
  assert.deepEqual(parseBorderSideWidths("1px 0 0 0"), {
    top: 1, right: 0, bottom: 0, left: 0,
  });
  assert.deepEqual(parseBorderSideWidths("2px"), {
    top: 2, right: 2, bottom: 2, left: 2,
  });
  // right == left collapses to the 3-term shorthand.
  assert.equal(composeBorderSideWidths({ top: 1, right: 0, bottom: 0, left: 0 }), "1px 0 0");
  assert.equal(composeBorderSideWidths({ top: 2, right: 2, bottom: 2, left: 2 }), "2px");
  assert.equal(composeBorderSideWidths({ top: 1, right: 0, bottom: 1, left: 0 }), "1px 0");
  assert.equal(composeBorderSideWidths({ top: 0, right: 0, bottom: 0, left: 0 }), "0");
});

test("border sides: non-px values refuse to parse", () => {
  assert.equal(parseBorderSideWidths("thin"), null);
  assert.equal(parseBorderSideWidths("0.1em"), null);
  assert.equal(parseBorderSideWidths("calc(1px)"), null);
});

test("border sides: a compose past the 16-char save cap returns null, never a doomed value", () => {
  const out = composeBorderSideWidths({ top: 10, right: 11, bottom: 12, left: 13 });
  assert.equal(out, null);
  // The cap constant matches the zod schema's cap (registry.ts).
  assert.equal(BORDER_WIDTH_MAX_CHARS, 16);
});

// ── Shadow stack ────────────────────────────────────────────────────────────

test("shadow stack: the shipped S/M/L presets (bare-zero, two layers) parse fully", () => {
  const stack = parseShadowStack(
    "0 1px 2px rgba(18,18,18,0.06), 0 1px 3px rgba(18,18,18,0.10)",
  );
  assert.equal(stack.length, 2);
  assert.ok(stack[0]?.parsed && stack[1]?.parsed, "both layers are grammar-owned");
  assert.deepEqual(stack[0]!.parsed, {
    inset: false, x: 0, y: 1, blur: 2, spread: 0, color: "rgba(18,18,18,0.06)",
  });
});

test("shadow stack: an exotic layer stays raw and round-trips byte-identical", () => {
  // A length function in blur position must NOT "parse" with the blur folded
  // into the color — that would corrupt the layer on the first edit.
  const exotic = "0 0 min(2px,1vw) red";
  const stack = parseShadowStack(`0 8px 24px rgba(0,0,0,0.18), ${exotic}`);
  assert.equal(stack.length, 2);
  assert.equal(stack[1]?.parsed, null, "min() blur is not grammar-owned");
  assert.equal(stack[1]?.css, exotic);
  // Compose keeps the raw text exactly.
  const composed = composeShadowStack(stack);
  assert.equal(composed, `0 8px 24px rgba(0,0,0,0.18), ${exotic}`);
});

test("shadow stack: a var() ring color IS grammar-owned (color is free text)", () => {
  const parsed = parseShadowLayer("inset 0 0 0 1px var(--ring-color)");
  assert.deepEqual(parsed, {
    inset: true, x: 0, y: 0, blur: 0, spread: 1, color: "var(--ring-color)",
  });
});

test("shadow stack: inset + spread parse and recompose", () => {
  const parsed = parseShadowLayer("inset 0 2px 4px 1px rgba(0,0,0,0.2)");
  assert.deepEqual(parsed, {
    inset: true, x: 0, y: 2, blur: 4, spread: 1, color: "rgba(0,0,0,0.2)",
  });
  assert.equal(
    composeShadowLayer(parsed!),
    "inset 0px 2px 4px 1px rgba(0,0,0,0.2)",
  );
});

test("shadow stack: empty and none yield an empty stack; empty composes to undefined", () => {
  assert.deepEqual(parseShadowStack(undefined), []);
  assert.deepEqual(parseShadowStack("none"), []);
  assert.equal(composeShadowStack([]), undefined);
});

test("shadow stack: a compose past the 200-char save cap returns null", () => {
  const layer = { css: "0 8px 24px rgba(0,0,0,0.18)", parsed: null };
  const many = Array.from({ length: 10 }, () => layer);
  assert.equal(composeShadowStack(many), null);
  assert.equal(BOX_SHADOW_MAX_CHARS, 200);
});
