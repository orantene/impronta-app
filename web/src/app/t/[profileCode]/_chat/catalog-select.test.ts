import test from "node:test";
import assert from "node:assert/strict";

import { selectCatalogRow } from "./catalog-select";

test("TUL-1068: the page's catalog island takes the request, nothing is added", () => {
  let added = 0;
  const out = selectCatalogRow({ offeringId: "o1", requestIsland: () => true, addToInquiry: () => { added += 1; } });
  assert.equal(out, "island");
  assert.equal(added, 0);
});

test("TUL-1068: with no island (workspace site) Select adds to the inquiry instead of linking to /book", () => {
  let added = 0;
  const out = selectCatalogRow({ offeringId: "o1", requestIsland: () => false, addToInquiry: () => { added += 1; } });
  assert.equal(out, "added");
  assert.equal(added, 1);
});

test("TUL-1068: a row without an offering id does nothing", () => {
  let added = 0;
  const out = selectCatalogRow({ offeringId: null, requestIsland: () => false, addToInquiry: () => { added += 1; } });
  assert.equal(out, "none");
  assert.equal(added, 0);
});
