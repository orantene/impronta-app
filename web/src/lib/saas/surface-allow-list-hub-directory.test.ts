import test from "node:test";
import assert from "node:assert/strict";
import { isPathAllowedForHostKind } from "./surface-allow-list";

test("TUL-1866: hub serves its directory (the /search hop target) but not the storefront cart or its API", () => {
  for (const p of ["/directory", "/global-directory", "/api/directory/talents-by-ids"]) {
    assert.equal(isPathAllowedForHostKind("hub", p), true, `hub should allow ${p}`);
  }
  for (const p of ["/directory/cart", "/api/directory", "/api/directory/preview/abc", "/api/directory/talents-by-idsx"]) {
    assert.equal(isPathAllowedForHostKind("hub", p), false, `hub must 404 ${p}`);
  }
});
