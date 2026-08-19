import assert from "node:assert/strict";
import { test } from "node:test";

import { ES_PAGE_META } from "./es-page-meta";

test("every entry is actually Spanish", () => {
  // The defect being fixed is English metadata on Spanish pages. Shipping a
  // half-translated map would leave the same bug with more steps.
  const ENGLISH_GIVEAWAYS =
    /\b(About|Contact|For Clients|Become a Model|Studio|Terms of Service|Privacy Policy|Page not found)\b/;
  for (const [slug, meta] of Object.entries(ES_PAGE_META)) {
    assert.ok(!ENGLISH_GIVEAWAYS.test(meta.metaTitle), `${slug}: English meta title`);
    assert.ok(!ENGLISH_GIVEAWAYS.test(meta.title), `${slug}: English admin title`);
    assert.ok(
      meta.metaDescription.length > 60,
      `${slug}: description too thin to be useful in a search result`,
    );
  }
});

test("titles and descriptions are unique per page", () => {
  // Duplicated metadata makes two pages compete for the same query and tells
  // search engines neither is the canonical answer.
  const titles = Object.values(ES_PAGE_META).map((m) => m.metaTitle);
  const descriptions = Object.values(ES_PAGE_META).map((m) => m.metaDescription);
  assert.equal(new Set(titles).size, titles.length, "duplicate meta title");
  assert.equal(new Set(descriptions).size, descriptions.length, "duplicate description");
});

test("no em dashes, per the house copy rule", () => {
  for (const [slug, meta] of Object.entries(ES_PAGE_META)) {
    for (const value of [meta.title, meta.metaTitle, meta.metaDescription]) {
      assert.ok(!value.includes("—"), `${slug}: em dash in operator-facing copy`);
    }
  }
});
