/**
 * TUL-444 / TUL-495 B1 Step 1 — renderTalentMaxSite must name every awaited
 * loader under `timed("maxSite.*")` so TULALA_PERF_TRACE=1 can attribute TTFB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(
  join(new URL(".", import.meta.url).pathname, "render-max-site.tsx"),
  "utf8",
);

const REQUIRED_SPANS = [
  "maxSite.resolveSite",
  "maxSite.locale",
  "maxSite.plan",
  "maxSite.pages",
  "maxSite.designSlug",
  "maxSite.tenant",
  "maxSite.identity",
  "maxSite.isDemo",
  "maxSite.ctaMode",
  "maxSite.seoFacts",
  "maxSite.prepareTrees",
  "maxSite.themeTokens",
  "maxSite.document",
  "maxSite.dataSources",
  "maxSite.components",
  "maxSite.platformDefaultTheme",
  "maxSite.experiment",
  "maxSite.captcha",
  "maxSite.captchaEnforced",
  "maxSite.offerings",
  "maxSite.liveStatus",
  "maxSite.askVisible",
  "maxSite.usdRates",
  "maxSite.socialLinks",
  "maxSite.whitelabel",
] as const;

describe("renderTalentMaxSite loader instrumentation (TUL-444 B1)", () => {
  it("imports timed/perfMark/perfStart from perf-trace", () => {
    assert.match(SRC, /from\s+["']@\/lib\/server\/perf-trace["']/);
    assert.match(SRC, /\btimed\b/);
    assert.match(SRC, /\bperfStart\b/);
    assert.match(SRC, /\bperfMark\b/);
  });

  it("wraps every named public-path loader span", () => {
    for (const name of REQUIRED_SPANS) {
      assert.match(
        SRC,
        new RegExp(`timed\\(\\s*["']${name.replace(/\./g, "\\.")}["']`),
        `missing timed("${name}")`,
      );
    }
  });

  it("keeps failOnReadTimeout on the exported entry (TUL-444)", () => {
    assert.match(SRC, /export const renderTalentMaxSite[\s\S]{0,200}failOnReadTimeout\(/);
  });
});
