import assert from "node:assert/strict";
import test from "node:test";

import { maxSiteSeoToMetadata } from "./site-metadata";

const TOKEN = "abcDEF123_-xyzABC456_-abcDEF123_-xyzABC456";

test("emits google-site-verification when the talent has a token", () => {
  const md = maxSiteSeoToMetadata({ title: "Ana", noindex: false, googleSiteVerification: TOKEN });
  assert.deepEqual(md.verification, { google: TOKEN });
});

test("emits nothing without a token, and drops a malformed one", () => {
  assert.equal(maxSiteSeoToMetadata({ title: "Ana", noindex: false }).verification, undefined);
  assert.equal(
    maxSiteSeoToMetadata({ title: "Ana", noindex: false, googleSiteVerification: 'x"><b>' }).verification,
    undefined,
  );
});
