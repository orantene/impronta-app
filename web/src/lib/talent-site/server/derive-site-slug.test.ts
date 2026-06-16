import test from "node:test";
import assert from "node:assert/strict";

import { slugifySiteName, deriveSiteSlug } from "./derive-site-slug";

test("slugifySiteName lowercases, hyphenates, and trims", () => {
  assert.equal(slugifySiteName("Morena Page Builder"), "morena-page-builder");
  assert.equal(slugifySiteName("  Hello   World  "), "hello-world");
  assert.equal(slugifySiteName("Foo & Bar!!"), "foo-bar");
  assert.equal(slugifySiteName("--leading--trailing--"), "leading-trailing");
});

test("slugifySiteName folds accents to ASCII", () => {
  assert.equal(slugifySiteName("José Álvarez"), "jose-alvarez");
  assert.equal(slugifySiteName("Cancún"), "cancun");
});

test("slugifySiteName returns empty for no usable characters", () => {
  assert.equal(slugifySiteName("###"), "");
  assert.equal(slugifySiteName(""), "");
  assert.equal(slugifySiteName("   "), "");
});

test("slugifySiteName caps length and trims a dangling hyphen", () => {
  const long = "a".repeat(60);
  assert.equal(slugifySiteName(long).length, 48);
  // A hyphen landing exactly on the cut boundary is trimmed.
  const boundary = `${"a".repeat(47)}-bbbb`;
  assert.ok(!slugifySiteName(boundary).endsWith("-"));
});

test("deriveSiteSlug prefers displayName over profileCode", () => {
  assert.equal(deriveSiteSlug("Marta Reyes", "TAL-123"), "marta-reyes");
});

test("deriveSiteSlug falls back to profileCode when displayName is blank", () => {
  assert.equal(deriveSiteSlug("###", "TAL-92001"), "tal-92001");
  assert.equal(deriveSiteSlug(null, "TAL-92001"), "tal-92001");
  assert.equal(deriveSiteSlug("", "  "), "site"); // both unusable → fallback
});

test("deriveSiteSlug de-dupes with -2, -3 suffixes (not -1)", () => {
  assert.equal(deriveSiteSlug("Morena", null, ["morena"]), "morena-2");
  assert.equal(
    deriveSiteSlug("Morena", null, ["morena", "morena-2"]),
    "morena-3",
  );
});

test("deriveSiteSlug dedupe is case-insensitive against the taken set", () => {
  assert.equal(deriveSiteSlug("Morena", null, ["MORENA"]), "morena-2");
});

test("deriveSiteSlug keeps the suffixed slug within the length cap", () => {
  const base = "a".repeat(48);
  const taken = [base];
  const out = deriveSiteSlug(base, null, taken);
  assert.ok(out.length <= 48, `slug ${out} (${out.length}) exceeds cap`);
  assert.ok(out.endsWith("-2"));
  assert.ok(!taken.includes(out));
});

test("deriveSiteSlug returns base when slug is free", () => {
  assert.equal(deriveSiteSlug("Unique Name", null, ["something-else"]), "unique-name");
});
