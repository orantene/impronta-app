import assert from "node:assert/strict";
import { test } from "node:test";

import { TALENT_SELLER_ACTIONS, talentSellerActionBlock } from "./talent-seller-actions-model";

test("six direct-client actions, in mockup order", () => {
  assert.deepEqual(
    TALENT_SELLER_ACTIONS.map((a) => a.id),
    ["quote", "time", "deposit", "file", "note", "client"],
  );
});

test("wired actions run only with an open conversation", () => {
  for (const id of ["quote", "time", "deposit", "client"] as const) {
    assert.equal(talentSellerActionBlock(id, true), null);
    assert.equal(talentSellerActionBlock(id, false), "Pick a conversation first");
  }
});

test("unwired actions are always disabled with an honest note", () => {
  assert.match(talentSellerActionBlock("file", true) ?? "", /Not available yet/);
  assert.match(talentSellerActionBlock("note", true) ?? "", /Not available yet/);
});

test("no em dashes in action copy", () => {
  for (const a of TALENT_SELLER_ACTIONS) assert.ok(!`${a.title}${a.body}`.includes("—"));
});
