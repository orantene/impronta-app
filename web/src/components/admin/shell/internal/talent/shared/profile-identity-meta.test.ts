import assert from "node:assert/strict";
import { test } from "node:test";

import { profileIdentityMeta } from "./profile-identity-meta";

test("profileIdentityMeta hides the any placeholder and a zero age", () => {
  assert.equal(profileIdentityMeta("any", 0), "");
  assert.equal(profileIdentityMeta("Any", 31), "31");
  assert.equal(profileIdentityMeta("she/her", 0), "she/her");
  assert.equal(profileIdentityMeta("she/her", 28), "she/her · 28");
  assert.equal(profileIdentityMeta(null, null), "");
});
