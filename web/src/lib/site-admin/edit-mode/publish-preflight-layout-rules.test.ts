import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBreakpointCascadeRisks,
  collectBreakpointOrderRisks,
  collectBreakpointVisibilityRisks,
  collectLayoutOverflowRisks,
  isLayoutOverflowRiskBlocking,
} from "./publish-preflight-layout-rules";

test("collectLayoutOverflowRisks detects long unbroken copy tokens", () => {
  const risks = collectLayoutOverflowRisks({
    headline:
      "ElegantAndUnexpectedlyLongHeadlineTokenThatWillLikelyOverflowSmallScreens",
    subtitle: "Short subtitle",
  });
  assert.equal(risks.length, 1);
  assert.equal(risks[0]?.path, "props.headline");
});

test("collectLayoutOverflowRisks ignores url-like fields", () => {
  const risks = collectLayoutOverflowRisks({
    primaryCta: {
      href: "https://example.com/super-long-link-token-that-should-not-count",
    },
    canonicalUrl: "https://example.com/another-long-token-that-should-ignore",
  });
  assert.equal(risks.length, 0);
});

test("collectLayoutOverflowRisks scans nested arrays and objects", () => {
  const risks = collectLayoutOverflowRisks({
    cards: [
      { title: "Normal title" },
      {
        title:
          "ThisCardUsesAVeryVeryVeryVeryVeryLongUnbrokenStringForTestingOnly",
      },
    ],
  });
  assert.equal(risks.length, 1);
  assert.equal(risks[0]?.path, "props.cards[1].title");
});

test("collectBreakpointVisibilityRisks detects hidden breakpoint declarations", () => {
  const risks = collectBreakpointVisibilityRisks({
    nodePresentation: {
      breakpoints: {
        mobile: { visibility: "hidden" },
      },
    },
  });
  assert.equal(risks.length, 1);
  assert.equal(
    risks[0]?.path,
    "props.nodePresentation.breakpoints.mobile.visibility",
  );
});

test("collectBreakpointCascadeRisks warns when mobile overrides skip tablet", () => {
  const risks = collectBreakpointCascadeRisks({
    nodePresentation: {
      breakpoints: {
        mobile: { paddingInlinePx: 80, visibility: "visible" },
      },
    },
  });
  assert.ok(risks.length >= 1);
  assert.equal(risks[0]?.reason, "missing-tablet-override");
  assert.ok(
    risks.some(
      (risk) =>
        risk.path ===
        "props.nodePresentation.breakpoints.mobile.paddingInlinePx",
    ),
  );
});

test("collectBreakpointOrderRisks detects mobile values larger than tablet", () => {
  const risks = collectBreakpointOrderRisks({
    presentation: {
      breakpoints: {
        tablet: { paddingInlinePx: 24 },
        mobile: { paddingInlinePx: 40 },
      },
    },
  });
  assert.equal(risks.length, 1);
  assert.equal(
    risks[0]?.path,
    "props.presentation.breakpoints.mobile.paddingInlinePx",
  );
  assert.equal(risks[0]?.reason, "mobile-exceeds-tablet");
});

test("isLayoutOverflowRiskBlocking returns true for extreme token length", () => {
  const risks = collectLayoutOverflowRisks({
    headline:
      "SupercalifragilisticexpialidociousPlusEvenMoreCharactersToTripBlockingThreshold",
  });
  assert.equal(risks.length, 1);
  assert.equal(isLayoutOverflowRiskBlocking(risks[0]!), true);
});
