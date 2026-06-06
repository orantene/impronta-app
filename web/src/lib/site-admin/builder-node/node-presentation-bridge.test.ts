import { test } from "node:test";
import assert from "node:assert/strict";

import {
  builderStyleToNodePresentation,
  nodePresentationToBuilderStyle,
} from "./node-presentation-bridge";
import {
  nodePresentationValueSchema,
  type NodePresentationValue,
} from "../sections/shared/node-presentation";
import type { BuilderNodeStyle } from "./types";

// ── px-int ↔ CSS-string + key-name map (B → A direction) ─────────────────────

test("B→A: px integers become px CSS strings on the mapped Engine-A keys", () => {
  const np: NodePresentationValue = {
    maxWidthPx: 740,
    marginTopPx: 14,
    marginBottomPx: 18,
    marginLeftPx: 12,
    marginRightPx: 20,
    paddingTopPx: 6,
    paddingBottomPx: 8,
    paddingLeftPx: 10,
    paddingRightPx: 14,
    fontSizePx: 32,
    letterSpacingPx: 2,
    borderWidthPx: 3,
  };
  const style = nodePresentationToBuilderStyle(np);
  assert.equal(style.maxWidthFree, "740px");
  assert.equal(style.marginTopFree, "14px");
  assert.equal(style.marginBottomFree, "18px");
  assert.equal(style.marginLeftFree, "12px");
  assert.equal(style.marginRightFree, "20px");
  assert.equal(style.paddingTop, "6px");
  assert.equal(style.paddingBottom, "8px");
  assert.equal(style.paddingLeft, "10px");
  assert.equal(style.paddingRight, "14px");
  assert.equal(style.fontSize, "32px");
  assert.equal(style.letterSpacing, "2px");
  assert.equal(style.borderWidth, "3px");
});

test("B→A: each px field maps to the exact Engine-A field name", () => {
  assert.equal(nodePresentationToBuilderStyle({ paddingTopPx: 6 }).paddingTop, "6px");
  assert.equal(
    nodePresentationToBuilderStyle({ paddingBottomPx: 8 }).paddingBottom,
    "8px",
  );
  assert.equal(nodePresentationToBuilderStyle({ paddingLeftPx: 10 }).paddingLeft, "10px");
  assert.equal(
    nodePresentationToBuilderStyle({ paddingRightPx: 14 }).paddingRight,
    "14px",
  );
  assert.equal(nodePresentationToBuilderStyle({ fontSizePx: 32 }).fontSize, "32px");
  assert.equal(
    nodePresentationToBuilderStyle({ letterSpacingPx: 2 }).letterSpacing,
    "2px",
  );
  assert.equal(nodePresentationToBuilderStyle({ borderWidthPx: 3 }).borderWidth, "3px");
});

test("B→A: lineHeightPct converts to the unitless ratio string (120 → '1.2')", () => {
  assert.equal(nodePresentationToBuilderStyle({ lineHeightPct: 120 }).lineHeight, "1.2");
  assert.equal(nodePresentationToBuilderStyle({ lineHeightPct: 150 }).lineHeight, "1.5");
  assert.equal(nodePresentationToBuilderStyle({ lineHeightPct: 200 }).lineHeight, "2");
});

test("B→A: inline shorthands expand to BOTH horizontal sides", () => {
  const style = nodePresentationToBuilderStyle({
    marginInlinePx: 9,
    paddingInlinePx: 14,
  });
  assert.equal(style.marginLeftFree, "9px");
  assert.equal(style.marginRightFree, "9px");
  assert.equal(style.paddingLeft, "14px");
  assert.equal(style.paddingRight, "14px");
});

test("B→A: explicit per-side wins over the inline shorthand", () => {
  const style = nodePresentationToBuilderStyle({
    marginInlinePx: 9,
    marginLeftPx: 3,
  });
  assert.equal(style.marginLeftFree, "3px", "explicit left wins");
  assert.equal(style.marginRightFree, "9px", "right falls back to inline");
});

test("B→A: shared-vocab enums/colors pass straight through", () => {
  const np: NodePresentationValue = {
    align: "center",
    size: "lg",
    tone: "muted",
    fontFamily: "Playfair Display",
    fontWeight: 700,
    textTransform: "uppercase",
    textWrap: "balance",
    whiteSpace: "nowrap",
    lineClamp: 3,
    textColor: "#ff0000",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderColor: "var(--token-color-border, #ccc)",
    borderStyle: "dashed",
    visibility: "hidden",
  };
  const style = nodePresentationToBuilderStyle(np);
  assert.equal(style.align, "center");
  assert.equal(style.size, "lg");
  assert.equal(style.tone, "muted");
  assert.equal(style.fontFamily, "Playfair Display");
  assert.equal(style.fontWeight, 700);
  assert.equal(style.textTransform, "uppercase");
  assert.equal(style.textWrap, "balance");
  assert.equal(style.whiteSpace, "nowrap");
  assert.equal(style.lineClamp, 3);
  assert.equal(style.textColor, "#ff0000");
  assert.equal(style.backgroundColor, "rgba(0,0,0,0.5)");
  assert.equal(style.borderColor, "var(--token-color-border, #ccc)");
  assert.equal(style.borderStyle, "dashed");
  assert.equal(style.visibility, "hidden");
});

test("B→A: null/undefined/empty input → empty style", () => {
  assert.deepEqual(nodePresentationToBuilderStyle(null), {});
  assert.deepEqual(nodePresentationToBuilderStyle(undefined), {});
  assert.deepEqual(nodePresentationToBuilderStyle({}), {});
});

// ── A → B direction ──────────────────────────────────────────────────────────

test("A→B: px CSS strings parse back to px integers on the mapped Engine-B keys", () => {
  const style: BuilderNodeStyle = {
    maxWidthFree: "740px",
    marginTopFree: "14px",
    marginBottomFree: "18px",
    paddingTop: "6px",
    fontSize: "32px",
    letterSpacing: "2px",
    borderWidth: "3px",
  };
  const np = builderStyleToNodePresentation(style);
  assert.equal(np.maxWidthPx, 740);
  assert.equal(np.marginTopPx, 14);
  assert.equal(np.marginBottomPx, 18);
  assert.equal(np.paddingTopPx, 6);
  assert.equal(np.fontSizePx, 32);
  assert.equal(np.letterSpacingPx, 2);
  assert.equal(np.borderWidthPx, 3);
});

test("A→B: symmetric horizontal sides re-collapse to the inline shorthand", () => {
  const np = builderStyleToNodePresentation({
    marginLeftFree: "9px",
    marginRightFree: "9px",
    paddingLeft: "14px",
    paddingRight: "14px",
  });
  assert.equal(np.marginInlinePx, 9);
  assert.equal(np.paddingInlinePx, 14);
  assert.equal(np.marginLeftPx, undefined, "collapsed → no per-side left");
  assert.equal(np.marginRightPx, undefined, "collapsed → no per-side right");
});

test("A→B: asymmetric horizontal sides stay per-side", () => {
  const np = builderStyleToNodePresentation({
    marginLeftFree: "3px",
    marginRightFree: "9px",
  });
  assert.equal(np.marginLeftPx, 3);
  assert.equal(np.marginRightPx, 9);
  assert.equal(np.marginInlinePx, undefined);
});

test("A→B: non-px / non-representable Engine-A values are dropped (no Engine-B home)", () => {
  const np = builderStyleToNodePresentation({
    maxWidthFree: "3rem", // not px
    marginTopFree: "clamp(8px, 2vw, 24px)", // not a clean px int
    boxShadow: "0 2px 8px rgba(0,0,0,.2)", // not an Engine-B field at all
    lineHeight: "normal", // keyword line-height has no pct home
  } as BuilderNodeStyle);
  assert.equal(np.maxWidthPx, undefined);
  assert.equal(np.marginTopPx, undefined);
  assert.equal(np.lineHeightPct, undefined);
  // boxShadow simply isn't carried.
  assert.equal((np as Record<string, unknown>).boxShadow, undefined);
});

test("A→B: unitless line-height ratio converts to a percentage int", () => {
  assert.equal(builderStyleToNodePresentation({ lineHeight: "1.2" }).lineHeightPct, 120);
  assert.equal(builderStyleToNodePresentation({ lineHeight: "1.5" }).lineHeightPct, 150);
  assert.equal(builderStyleToNodePresentation({ lineHeight: "2" }).lineHeightPct, 200);
});

// ── Round-trip (the load-bearing lossless guarantee) ─────────────────────────

const ROUND_TRIP_CASES: ReadonlyArray<{ name: string; np: NodePresentationValue }> = [
  {
    name: "hero headline (full spacing + tokens)",
    np: {
      align: "left",
      maxWidthPx: 740,
      marginTopPx: 14,
      marginBottomPx: 18,
      marginLeftPx: 12,
      marginRightPx: 20,
      paddingTopPx: 6,
      paddingBottomPx: 8,
      paddingLeftPx: 10,
      paddingRightPx: 14,
      size: "xl",
      tone: "strong",
    },
  },
  {
    name: "subheadline (inline shorthands)",
    np: {
      align: "left",
      maxWidthPx: 620,
      marginBottomPx: 10,
      marginInlinePx: 9,
      paddingInlinePx: 14,
      size: "lg",
      tone: "muted",
    },
  },
  {
    name: "free typography + color escapes",
    np: {
      fontFamily: "Playfair Display",
      fontSizePx: 48,
      fontWeight: 600,
      letterSpacingPx: 2,
      lineHeightPct: 120,
      textTransform: "uppercase",
      textWrap: "balance",
      whiteSpace: "nowrap",
      lineClamp: 2,
      textColor: "#1a1a1a",
      backgroundColor: "#fafafa",
      borderColor: "#cccccc",
      borderWidthPx: 2,
      borderStyle: "solid",
    },
  },
  {
    name: "visibility hidden",
    np: { visibility: "hidden" },
  },
];

for (const { name, np } of ROUND_TRIP_CASES) {
  test(`round-trip B→A→B is lossless: ${name}`, () => {
    const style = nodePresentationToBuilderStyle(np);
    const back = builderStyleToNodePresentation(style);
    assert.deepEqual(back, np, "B→A→B must reproduce the original Engine-B value");
  });

  test(`round-trip result stays valid under the Engine-B Zod schema: ${name}`, () => {
    const back = builderStyleToNodePresentation(nodePresentationToBuilderStyle(np));
    const parsed = nodePresentationValueSchema.safeParse(back);
    assert.ok(parsed.success, `round-tripped value must satisfy the schema: ${name}`);
  });
}

test("round-trip A→B→A is lossless for a px-clean Engine-A style", () => {
  const style: BuilderNodeStyle = {
    align: "center",
    size: "md",
    maxWidthFree: "600px",
    marginTopFree: "8px",
    marginBottomFree: "16px",
    paddingTop: "4px",
    paddingBottom: "4px",
    paddingLeft: "12px",
    paddingRight: "12px",
    fontSize: "24px",
    fontWeight: 500,
    lineHeight: "1.4",
    letterSpacing: "1px",
    textColor: "#222222",
    borderColor: "#dddddd",
    borderWidth: "1px",
    borderStyle: "solid",
  };
  const np = builderStyleToNodePresentation(style);
  const back = nodePresentationToBuilderStyle(np);
  // paddingLeft===paddingRight collapses to inline then re-expands to L+R — the
  // observable CSS is identical; assert the round-trip reproduces every key.
  assert.deepEqual(back, style, "A→B→A must reproduce the original Engine-A style");
});
