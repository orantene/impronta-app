import assert from "node:assert/strict";
import { test } from "node:test";

import { collectLayoutOverflowRisks } from "./publish-preflight-layout-rules";

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
