import test from "node:test";
import assert from "node:assert/strict";

import { isPathAllowedForHostKind } from "./surface-allow-list";

test("Posts v1: agency host allows /blog/<slug>, /blog/c/<cat> and /llms.txt; bare /blog stays a clean-URL CMS slug", () => {
  for (const p of ["/blog/spring-2026", "/blog/c/tips", "/blog/spring-2026/og", "/llms.txt"]) {
    assert.equal(isPathAllowedForHostKind("agency", p), true, p);
  }
  assert.equal(isPathAllowedForHostKind("agency", "/blog"), false);
  assert.equal(isPathAllowedForHostKind("agency", "/blog/"), false);
});
