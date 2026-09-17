import test from "node:test";
import assert from "node:assert/strict";
import { brandIdentityAppliesTo, brandIdentityVerdict } from "./publish-preflight-brand-identity";

test("blocked unless a logo exists or the wordmark was chosen", () => {
  assert.deepEqual(brandIdentityVerdict({ hasLogo: false, wordmarkChosen: false }), { ok: false, reason: "no_identity" });
  assert.deepEqual(brandIdentityVerdict({ hasLogo: true, wordmarkChosen: false }), { ok: true });
  assert.deepEqual(brandIdentityVerdict({ hasLogo: false, wordmarkChosen: true }), { ok: true });
});

test("applies to the tenant's site surfaces, never a talent page", () => {
  assert.equal(brandIdentityAppliesTo(undefined), true);
  assert.equal(brandIdentityAppliesTo("homepage"), true);
  assert.equal(brandIdentityAppliesTo("cms_page"), true);
  assert.equal(brandIdentityAppliesTo("site_shell"), true);
  assert.equal(brandIdentityAppliesTo("talent_page"), false);
  assert.equal(brandIdentityAppliesTo("platform_lab"), false);
});
