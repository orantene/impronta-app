import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("TUL-711: the CMS miss title follows the page language", () => {
  const src = readFileSync("src/app/(public)/p/[[...slug]]/page.tsx", "utf8");
  it("has an ES title and no hard-coded English miss title left", () => {
    assert.match(src, /"No encontrada"/);
    assert.doesNotMatch(src, /return \{ title: "Not found" \}/);
  });
});
