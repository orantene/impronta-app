import test from "node:test";
import assert from "node:assert/strict";
import {
  BRAND_IDENTITY_MESSAGE,
  brandIdentityAppliesTo,
  brandIdentityVerdict,
} from "./publish-preflight-brand-identity";

test("incomplete unless a logo exists or the wordmark was chosen (advisory only)", () => {
  assert.deepEqual(brandIdentityVerdict({ hasLogo: false, wordmarkChosen: false }), {
    ok: false,
    reason: "no_identity",
  });
  assert.deepEqual(brandIdentityVerdict({ hasLogo: true, wordmarkChosen: false }), { ok: true });
  assert.deepEqual(brandIdentityVerdict({ hasLogo: false, wordmarkChosen: true }), { ok: true });
});

test("TUL-524: brand identity tip never uses blocker language", () => {
  assert.match(BRAND_IDENTITY_MESSAGE, /business name is your logo/i);
  assert.doesNotMatch(BRAND_IDENTITY_MESSAGE, /to publish/i);
});

test("applies to the tenant's site surfaces, never a talent page", () => {
  assert.equal(brandIdentityAppliesTo(undefined), true);
  assert.equal(brandIdentityAppliesTo("homepage"), true);
  assert.equal(brandIdentityAppliesTo("cms_page"), true);
  assert.equal(brandIdentityAppliesTo("site_shell"), true);
  assert.equal(brandIdentityAppliesTo("talent_page"), false);
  assert.equal(brandIdentityAppliesTo("platform_lab"), false);
});
