import assert from "node:assert/strict";
import { test } from "node:test";

import { isPublishPreflightSurface } from "./publish-preflight-surfaces";

test("preflight runs on live publish surfaces, not the lab", () => {
  assert.equal(isPublishPreflightSurface("homepage"), true);
  assert.equal(isPublishPreflightSurface("cms_page"), true);
  assert.equal(isPublishPreflightSurface("site_shell"), true);
  assert.equal(isPublishPreflightSurface("talent_page"), true);
  assert.equal(isPublishPreflightSurface("platform_lab"), false);
  assert.equal(isPublishPreflightSurface(null), false);
  assert.equal(isPublishPreflightSurface(undefined), false);
});
