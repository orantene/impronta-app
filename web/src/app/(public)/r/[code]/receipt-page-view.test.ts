import assert from "node:assert/strict";
import test from "node:test";

import { COPY } from "./receipt-page-view";

test("receipt copy has the same keys in English and Spanish", () => {
  const en = Object.keys(COPY.en).sort();
  const es = Object.keys(COPY.es).sort();
  assert.deepEqual(es, en);
});
