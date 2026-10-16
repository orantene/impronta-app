import assert from "node:assert/strict";
import { test } from "node:test";

import { dedupeCatalogRows } from "./guest-catalog-dedupe";

const r = (over: Partial<Parameters<typeof dedupeCatalogRows>[0][number]> = {}) => ({
  category: "package",
  title: "Wedding",
  amountCents: 1000,
  talentProfileId: null as string | null,
  ...over,
});

test("identical rows collapse to the first", () => {
  const a = r();
  const out = dedupeCatalogRows([a, r({ title: "  wedding " })]);
  assert.equal(out.length, 1);
  assert.equal(out[0], a);
});

test("different owner, price or category survive", () => {
  assert.equal(dedupeCatalogRows([r(), r({ talentProfileId: "t1" })]).length, 2);
  assert.equal(dedupeCatalogRows([r(), r({ amountCents: 2000 })]).length, 2);
  assert.equal(dedupeCatalogRows([r(), r({ category: "service" })]).length, 2);
});

test("other categories are not deduped", () => {
  assert.equal(dedupeCatalogRows([r({ category: "ticket" }), r({ category: "ticket" })]).length, 2);
});
