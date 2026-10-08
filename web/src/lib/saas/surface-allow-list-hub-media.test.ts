import test from "node:test";
import assert from "node:assert/strict";

import { isPathAllowedForHostKind } from "./surface-allow-list";

test("TUL-87: hub reaches the builder media APIs, and only those", () => {
  for (const p of [
    "/api/admin/media/library",
    "/api/admin/media/upload",
    "/api/admin/media/upload/init",
    "/api/admin/media/upload/register",
    "/api/talent/media/library",
    "/api/talent/media/upload",
  ]) {
    assert.equal(isPathAllowedForHostKind("hub", p), true, `hub should allow ${p}`);
  }
  for (const p of [
    "/api/admin/roster-import",
    "/api/admin/media/bake-watermark",
    "/api/admin/inspector/talent",
    "/api/talent/media-kit",
    "/api/talent/tax-summary",
  ]) {
    assert.equal(isPathAllowedForHostKind("hub", p), false, `hub must 404 ${p}`);
  }
});
