import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseTalentSiteHelpContactInput,
  sanitizeTalentProfileCode,
  sanitizeTalentSiteHost,
} from "./talent-site-help-context";

test("sanitizeTalentSiteHost accepts hostnames only", () => {
  assert.equal(sanitizeTalentSiteHost("jorg-beauty-qa.tulala.digital"), "jorg-beauty-qa.tulala.digital");
  assert.equal(sanitizeTalentSiteHost("  Jorg.TULALA.digital "), "jorg.tulala.digital");
  assert.equal(sanitizeTalentSiteHost("https://evil.example"), null);
  assert.equal(sanitizeTalentSiteHost("a/b"), null);
  assert.equal(sanitizeTalentSiteHost(""), null);
  assert.equal(sanitizeTalentSiteHost("..bad"), null);
});

test("sanitizeTalentProfileCode accepts TAL-style codes", () => {
  assert.equal(sanitizeTalentProfileCode("TAL-93900"), "TAL-93900");
  assert.equal(sanitizeTalentProfileCode("  TAL_1 "), "TAL_1");
  assert.equal(sanitizeTalentProfileCode("no spaces"), null);
  assert.equal(sanitizeTalentProfileCode(""), null);
  assert.equal(sanitizeTalentProfileCode("x".repeat(65)), null);
});

test("parseTalentSiteHelpContactInput only from talent-site source", () => {
  assert.equal(parseTalentSiteHelpContactInput({ source: "contact_form" }), null);
  assert.deepEqual(
    parseTalentSiteHelpContactInput({
      source: "talent-site",
      host: "jorg.tulala.digital",
      code: "TAL-93900",
    }),
    {
      source: "talent_site_footer",
      host: "jorg.tulala.digital",
      profileCode: "TAL-93900",
    },
  );
  assert.deepEqual(
    parseTalentSiteHelpContactInput({ source: "talent_site_footer", host: "bad/host", code: "TAL-1" }),
    { source: "talent_site_footer", host: null, profileCode: "TAL-1" },
  );
});
