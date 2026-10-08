import assert from "node:assert/strict";
import { test } from "node:test";

import { TALENT_SELLER_ACTIONS, talentSellerActionBlock } from "./talent-seller-actions-model";

test("six direct-client actions, in mockup order", () => {
  assert.deepEqual(
    TALENT_SELLER_ACTIONS.map((a) => a.id),
    ["quote", "time", "deposit", "file", "note", "client"],
  );
});

test("every action runs only with an open conversation (F38: file and note are wired)", () => {
  for (const id of ["quote", "time", "deposit", "file", "note", "client"] as const) {
    assert.equal(talentSellerActionBlock(id, true), null);
    assert.equal(talentSellerActionBlock(id, false), "Pick a conversation first");
  }
});

test("no em dashes in action copy", () => {
  for (const a of TALENT_SELLER_ACTIONS) assert.ok(!`${a.title}${a.body}`.includes("—"));
});
