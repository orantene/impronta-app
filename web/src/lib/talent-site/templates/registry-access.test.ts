import assert from "node:assert/strict";
import { test } from "node:test";

import { TALENT_SITE_TEMPLATES, listTemplatesForTier, listTemplatesWithAccess } from "./registry";

test("TUL-829: a Free talent sees every template, paid ones locked", () => {
  const all = listTemplatesWithAccess("free");
  assert.equal(all.length, Object.keys(TALENT_SITE_TEMPLATES).length);
  assert.ok(all.length >= 6);
  const unlocked = all.filter((t) => !t.locked).map((t) => t.key);
  assert.deepEqual(unlocked.sort(), listTemplatesForTier("free").map((t) => t.key).sort());
  assert.ok(all.filter((t) => t.locked).length >= 4);
  for (const t of all) assert.equal(t.locked, t.availableAt !== "free");
});

test("TUL-829: a Max talent has nothing locked", () => {
  assert.equal(listTemplatesWithAccess("max").some((t) => t.locked), false);
});
