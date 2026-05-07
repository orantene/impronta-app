import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNodePresentationResponsiveCss,
  nodePresentationSchema,
} from "./node-presentation";

test("nodePresentation schema accepts breakpoint overrides", () => {
  const result = nodePresentationSchema?.safeParse({
    align: "center",
    marginTopPx: 12,
    marginBottomPx: 18,
    marginInlinePx: 24,
    marginLeftPx: 10,
    marginRightPx: 14,
    paddingTopPx: 8,
    paddingBottomPx: 10,
    paddingInlinePx: 20,
    paddingLeftPx: 8,
    paddingRightPx: 12,
    visibility: "hidden",
    breakpoints: {
      tablet: {
        align: "left",
        size: "lg",
        marginTopPx: 8,
        marginBottomPx: 10,
        marginInlinePx: 14,
        marginLeftPx: 6,
        marginRightPx: 8,
        paddingTopPx: 4,
        paddingInlinePx: 12,
        paddingLeftPx: 6,
        paddingRightPx: 10,
        visibility: "hidden",
      },
      mobile: {
        align: "left",
        size: "sm",
        maxWidthPx: 320,
        marginBottomPx: 6,
        paddingBottomPx: 3,
        visibility: "visible",
      },
    },
  });
  assert.equal(result?.success, true);
});

test("nodePresentation schema rejects invalid visibility values", () => {
  const result = nodePresentationSchema?.safeParse({
    visibility: "collapse",
  });
  assert.equal(result?.success, false);
});

test("nodePresentation schema rejects out-of-range spacing values", () => {
  const result = nodePresentationSchema?.safeParse({
    marginLeftPx: 420,
  });
  assert.equal(result?.success, false);
});

test("nodePresentation schema rejects out-of-range padding values", () => {
  const result = nodePresentationSchema?.safeParse({
    paddingRightPx: 240,
  });
  assert.equal(result?.success, false);
});

test("buildNodePresentationResponsiveCss returns null when no section id", () => {
  const css = buildNodePresentationResponsiveCss({
    rules: [
      {
        selector: ".site-hero__headline",
        tablet: ["text-align:left"],
      },
    ],
  });
  assert.equal(css, null);
});

test("buildNodePresentationResponsiveCss renders scoped tablet/mobile media blocks", () => {
  const css = buildNodePresentationResponsiveCss({
    sectionId: "11111111-1111-4111-8111-111111111111",
    rules: [
      {
        selector: ".site-hero__headline",
        tablet: ["text-align:left", "font-size:2rem"],
        mobile: ["text-align:left", "max-width:320px"],
      },
      {
        selector: ".site-hero__ctas",
        mobile: ["justify-content:flex-start"],
      },
    ],
  });

  assert.ok(css);
  assert.match(css ?? "", /\[data-cms-section\]\[data-section-id="11111111-1111-4111-8111-111111111111"\] \.site-hero__headline/);
  assert.match(css ?? "", /@media \(max-width: 1023px\)/);
  assert.match(css ?? "", /@media \(max-width: 640px\)/);
  assert.match(css ?? "", /justify-content:flex-start !important/);
});
