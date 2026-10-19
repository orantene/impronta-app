import assert from "node:assert/strict";
import { test } from "node:test";
import { directoryIndexing, applyDirectoryIndexing } from "./directory-indexing";

test("A6: no query is page 1, unfiltered, indexable", () => {
  assert.deepEqual(directoryIndexing({}), { page: 1, filtered: false });
});

test("A6: ?page=n alone is self-canonical, not filtered", () => {
  assert.deepEqual(directoryIndexing({ page: "3" }), { page: 3, filtered: false });
  assert.deepEqual(directoryIndexing({ page: "junk" }), { page: 1, filtered: false });
});

test("A6: any other query param makes a filtered view", () => {
  assert.equal(directoryIndexing({ q: "ana" }).filtered, true);
  assert.equal(directoryIndexing({ page: "2", sort: "newest" }).filtered, true);
  assert.equal(directoryIndexing({ q: "" }).filtered, false);
});

test("A6: metadata - page n canonical and hreflang carry ?page=n; filtered is noindex", () => {
  const meta = {
    alternates: {
      canonical: "https://x.test/directory",
      languages: { en: "https://x.test/directory", es: "https://x.test/es/directory" },
    },
  };
  const p2 = applyDirectoryIndexing(meta, { page: "2" });
  assert.equal(p2.alternates?.canonical, "https://x.test/directory?page=2");
  assert.deepEqual(p2.alternates?.languages, {
    en: "https://x.test/directory?page=2",
    es: "https://x.test/es/directory?page=2",
  });
  assert.equal(p2.robots, undefined);
  assert.equal(applyDirectoryIndexing(meta, {}).alternates?.canonical, "https://x.test/directory");
  const f = applyDirectoryIndexing(meta, { q: "ana", page: "2" });
  assert.deepEqual(f.robots, { index: false, follow: true });
  assert.equal(f.alternates?.canonical, "https://x.test/directory");
});
