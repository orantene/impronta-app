import assert from "node:assert/strict";
import { test } from "node:test";

import { isLocalDevOrigin, talentPublicProfileHref, talentPublicProfileLabel } from "./public-profile-href";

test("F41: production and server render keep the canonical host", () => {
  assert.equal(talentPublicProfileHref("TAL-93901", null), "https://tulala.digital/t/TAL-93901");
  assert.equal(talentPublicProfileHref("TAL-93901", "https://app.tulala.digital"), "https://tulala.digital/t/TAL-93901");
});

test("F41: a local dev origin builds the link on itself", () => {
  assert.equal(talentPublicProfileHref("TAL-93901", "http://localhost:3001"), "http://localhost:3001/t/TAL-93901");
  assert.equal(talentPublicProfileHref("x", "http://app.localhost:3000"), "http://app.localhost:3000/t/x");
  assert.equal(talentPublicProfileLabel("x", "http://127.0.0.1:3001"), "127.0.0.1:3001/t/x");
});

test("F41: only local hosts count as local", () => {
  assert.equal(isLocalDevOrigin("http://localhost.evil.com"), false);
  assert.equal(isLocalDevOrigin("not a url"), false);
  assert.equal(isLocalDevOrigin("http://tulala.test"), true);
});
