import test from "node:test";
import assert from "node:assert/strict";

import type { CompositionSectionRef } from "@/lib/site-admin/edit-mode/composition-actions";
import { normalizeCompositionSlots } from "./composition-slots";

function ref(
  sectionId: string,
  sortOrder: number,
  overrides: Partial<CompositionSectionRef> = {},
): CompositionSectionRef {
  return {
    sectionId,
    sortOrder,
    sectionTypeKey: "hero",
    name: "Test",
    ...overrides,
  };
}

test("normalizeCompositionSlots sorts rows by sortOrder", () => {
  const next = normalizeCompositionSlots({
    primary: [ref("c", 2), ref("a", 0), ref("b", 1)],
  });
  assert.deepEqual(
    next.primary.map((r) => r.sectionId),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    next.primary.map((r) => r.sortOrder),
    [0, 1, 2],
  );
});

test("normalizeCompositionSlots re-densifies sparse sortOrder values", () => {
  const next = normalizeCompositionSlots({
    primary: [ref("a", 10), ref("b", 50)],
  });
  assert.deepEqual(
    next.primary.map((r) => r.sortOrder),
    [0, 1],
  );
});

test("normalizeCompositionSlots breaks ties by sectionId", () => {
  const next = normalizeCompositionSlots({
    primary: [ref("z", 0), ref("m", 0), ref("a", 0)],
  });
  assert.deepEqual(
    next.primary.map((r) => r.sectionId),
    ["a", "m", "z"],
  );
});
