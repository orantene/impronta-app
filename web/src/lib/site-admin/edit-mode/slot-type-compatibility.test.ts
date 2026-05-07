import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSlotTypeCompatibility } from "./slot-type-compatibility";

const SLOT_DEFS = [
  {
    key: "hero",
    label: "Hero",
    allowedSectionTypes: ["hero"],
  },
  {
    key: "body",
    label: "Body",
    allowedSectionTypes: null,
  },
] as const;

test("allows unrestricted slots", () => {
  const result = checkSlotTypeCompatibility({
    slotDefs: SLOT_DEFS,
    targetSlotKey: "body",
    sectionTypeKey: "gallery_strip",
  });
  assert.deepEqual(result, { ok: true });
});

test("blocks unknown slots", () => {
  const result = checkSlotTypeCompatibility({
    slotDefs: SLOT_DEFS,
    targetSlotKey: "sidebar",
    sectionTypeKey: "hero",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "SLOT_UNKNOWN");
});

test("blocks restricted slot mismatch", () => {
  const result = checkSlotTypeCompatibility({
    slotDefs: SLOT_DEFS,
    targetSlotKey: "hero",
    sectionTypeKey: "cta_banner",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "SECTION_TYPE_NOT_ALLOWED");
});

test("allows restricted slot when type matches", () => {
  const result = checkSlotTypeCompatibility({
    slotDefs: SLOT_DEFS,
    targetSlotKey: "hero",
    sectionTypeKey: "hero",
  });
  assert.deepEqual(result, { ok: true });
});
