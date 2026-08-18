import assert from "node:assert/strict";
import { test } from "node:test";

import { applyResponsiveStructurePatch } from "./responsive-structure";

test("tablet hide preserves the mobile bucket", () => {
  const next = applyResponsiveStructurePatch(
    { responsive: { mobile: { visibility: "hidden", order: 2 } } },
    "tablet",
    { visibility: "hidden" },
  );
  assert.deepEqual(next, {
    responsive: {
      mobile: { visibility: "hidden", order: 2 },
      tablet: { visibility: "hidden" },
    },
  });
});

test("clearing the last tablet field drops the empty bucket", () => {
  const next = applyResponsiveStructurePatch(
    { color: "red", responsive: { tablet: { visibility: "hidden" } } },
    "tablet",
    { visibility: undefined },
  );
  assert.deepEqual(next, { color: "red" });
});
