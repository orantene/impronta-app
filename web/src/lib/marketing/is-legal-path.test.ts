import assert from "node:assert/strict";
import test from "node:test";

import { isMarketingLegalPath } from "./is-legal-path";

test("isMarketingLegalPath: legal docs only", () => {
  assert.equal(isMarketingLegalPath("/legal"), true);
  assert.equal(isMarketingLegalPath("/legal/terms"), true);
  assert.equal(isMarketingLegalPath("/legal/cookies"), true);
  assert.equal(isMarketingLegalPath("/legal/privacy"), true);
  assert.equal(isMarketingLegalPath("/legal/refunds"), true);
  assert.equal(isMarketingLegalPath("/pricing"), false);
  assert.equal(isMarketingLegalPath("/"), false);
  assert.equal(isMarketingLegalPath("/legalese"), false);
});
