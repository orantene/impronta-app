import assert from "node:assert/strict";
import test from "node:test";

import { parseTaxonomyParam } from "./search-params";

test("parseTaxonomyParam accepts modern taxonomy UUID versions", () => {
  assert.deepEqual(parseTaxonomyParam("e6ca0178-d153-655c-5c33-d9b84263196e"), [
    "e6ca0178-d153-655c-5c33-d9b84263196e",
  ]);
});

test("parseTaxonomyParam ignores malformed taxonomy IDs", () => {
  assert.deepEqual(parseTaxonomyParam("not-a-uuid,e6ca0178-d153-655c-5c33-d9b84263196e"), [
    "e6ca0178-d153-655c-5c33-d9b84263196e",
  ]);
});
