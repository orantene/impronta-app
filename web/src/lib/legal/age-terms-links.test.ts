import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ageTermsLinks } from "./age-terms-links";

describe("ageTermsLinks (TUL-614)", () => {
  it("prefixes the Spanish legal pages with /es", () => {
    assert.deepEqual(ageTermsLinks("https://tulala.digital", "es"), {
      terms: "https://tulala.digital/es/legal/terms",
      privacy: "https://tulala.digital/es/legal/privacy",
    });
  });
  it("keeps English unprefixed and tolerates a trailing slash", () => {
    assert.deepEqual(ageTermsLinks("https://tulala.digital/", "en"), {
      terms: "https://tulala.digital/legal/terms",
      privacy: "https://tulala.digital/legal/privacy",
    });
  });
  it("the checkbox uses the helper, not a hardcoded legal path", () => {
    const src = readFileSync("src/components/auth/age-terms-checkbox.tsx", "utf8");
    assert.match(src, /ageTermsLinks\(getSiteUrl\(\), locale\)/);
    assert.doesNotMatch(src, /\/legal\/terms`/);
  });
  it("the /start save step links follow the page language too", () => {
    const src = readFileSync("src/components/onboarding/steps/save-step.tsx", "utf8");
    assert.match(src, /ageTermsLinks\(getSiteUrl\(\), locale\)/);
    assert.doesNotMatch(src, /\/legal\/(terms|privacy)`/);
  });
});
