import assert from "node:assert/strict";
import { test } from "node:test";

import { applyMobileFixes } from "./mobile-fix";
import { collectMobileOverflowOffenders } from "./mobile-health";
import { improntaDesign } from "./page-designs/impronta";

test("impronta flagship tree: existing mobile-fix clears 390 overflow", () => {
  const result = applyMobileFixes(improntaDesign.tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const leftover = collectMobileOverflowOffenders(result.tree);
  assert.equal(
    leftover.length,
    0,
    leftover.map((o) => `${o.nodeId}:${o.issue}`).join("; ") ||
      "overflow cleared",
  );
});
