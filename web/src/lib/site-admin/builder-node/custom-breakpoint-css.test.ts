import assert from "node:assert/strict";
import { test } from "node:test";

import { generateCustomBreakpointCss } from "./custom-breakpoint-css";

test("empty / null → no CSS", () => {
  assert.equal(generateCustomBreakpointCss(undefined), "");
  assert.equal(generateCustomBreakpointCss(null), "");
  assert.equal(generateCustomBreakpointCss([]), "");
});

test("a valid tier emits the @media block + mirrors the tablet scale", () => {
  const css = generateCustomBreakpointCss([
    { id: "wide", label: "Wide", maxWidthPx: 1200 },
  ]);
  assert.match(css, /@media \(max-width: 1200px\) \{/);
  // slug-scoped selectors
  assert.match(css, /\[data-section-wide-padding-top="tight"\] \{ padding-top: 32px !important; \}/);
  assert.match(css, /\[data-section-wide-align="center"\] \{ text-align: center; \}/);
  assert.match(css, /\[data-section-wide-background="espresso"\] \{ background: #2d2623; color: #f6f1ea; \}/);
  // container uses the compound inner selector pair
  assert.match(css, /\[data-section-wide-container="narrow"\] > \* > \*\[class\*="__inner"\]/);
  assert.match(css, /width: 720px !important/);
});

test("drops invalid tiers: bad slug, reserved ids, out-of-range px, dupes", () => {
  const css = generateCustomBreakpointCss([
    { id: "Bad Id", label: "x", maxWidthPx: 900 }, // bad slug → dropped
    { id: "tablet", label: "x", maxWidthPx: 900 }, // reserved → dropped
    { id: "mobile", label: "x", maxWidthPx: 900 }, // reserved → dropped
    { id: "tiny", label: "x", maxWidthPx: 100 }, // too small → dropped
    { id: "huge", label: "x", maxWidthPx: 9000 }, // too large → dropped
    { id: "ok", label: "x", maxWidthPx: 800 },
    { id: "ok", label: "x", maxWidthPx: 700 }, // dupe id → dropped
  ]);
  assert.doesNotMatch(css, /data-section-Bad/);
  assert.doesNotMatch(css, /data-section-tablet-background/);
  assert.doesNotMatch(css, /data-section-tiny/);
  assert.doesNotMatch(css, /data-section-huge/);
  // exactly one @media for the single surviving "ok" tier
  assert.equal((css.match(/@media/g) ?? []).length, 1);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.doesNotMatch(css, /max-width: 700px/);
});

test("widest threshold first (narrower wins at equal specificity)", () => {
  const css = generateCustomBreakpointCss([
    { id: "small", label: "S", maxWidthPx: 480 },
    { id: "large", label: "L", maxWidthPx: 1440 },
  ]);
  assert.ok(
    css.indexOf("max-width: 1440px") < css.indexOf("max-width: 480px"),
    "1440 block should precede 480 block",
  );
});
