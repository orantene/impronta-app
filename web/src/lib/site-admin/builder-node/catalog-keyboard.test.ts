import assert from "node:assert/strict";
import test from "node:test";

import { catalogCtaTabIndex } from "./catalog-keyboard";

test("catalogCtaTabIndex: selected or roving anchor is the sole Tab stop", () => {
  assert.equal(catalogCtaTabIndex({ selected: true, rovingAnchor: false }), 0);
  assert.equal(catalogCtaTabIndex({ selected: false, rovingAnchor: true }), 0);
  assert.equal(catalogCtaTabIndex({ selected: false, rovingAnchor: false }), -1);
});
