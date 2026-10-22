import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PUBLIC_LISTING_FILTERS } from "./public-listing-predicate";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("directory list and profile page agree on who is public", () => {
  it("the shared gate keys on hidden + listed + not deleted", () => {
    const cols = PUBLIC_LISTING_FILTERS.map((f) => f.column);
    for (const c of ["deleted_at", "is_publicly_hidden", "is_publicly_listed"]) assert.ok(cols.includes(c as never), c);
  });
  it("list, count and age-band queries all apply is_publicly_hidden=false AND is_publicly_listed=true", () => {
    const src = read("./fetch-directory-page.ts");
    assert.equal((src.match(/\.eq\("is_publicly_listed", true\)/g) ?? []).length >= 4, true);
    assert.equal((src.match(/\.eq\("is_publicly_hidden", false\)/g) ?? []).length >= 4, true);
  });
  it("profile page 404s a hidden profile (same field) and reads through the public client", () => {
    const src = read("../../app/t/[profileCode]/profile-view.tsx");
    assert.match(src, /resolveTalentVisibility/);
    assert.match(src, /is_publicly_hidden: profile\.is_publicly_hidden/);
  });
  it("first page is cached at most 120s under the directory tag (staleness window)", () => {
    assert.match(read("./cache.ts"), /tags: \[CACHE_TAG_DIRECTORY\], revalidate: 120/);
  });
});
