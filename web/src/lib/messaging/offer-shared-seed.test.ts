import assert from "node:assert/strict";
import { test } from "node:test";

import { offerDraftNeedsSharedSeed } from "./offer-shared-seed";

test("empty draft needs shared seed", () => {
  assert.equal(offerDraftNeedsSharedSeed([]), true);
});

test("$0 placeholder talent rows need shared seed", () => {
  assert.equal(offerDraftNeedsSharedSeed([{ unitPriceCents: 0 }, { unitPriceCents: 0 }]), true);
});

test("any priced line keeps the existing draft", () => {
  assert.equal(offerDraftNeedsSharedSeed([{ unitPriceCents: 0 }, { unitPriceCents: 50000 }]), false);
  assert.equal(offerDraftNeedsSharedSeed([{ unitPriceCents: 30000 }]), false);
});
