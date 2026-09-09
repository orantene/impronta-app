import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileBusinessRegistry, assertKnownBusinessType } from "./registry-reconcile";

test("reports the real catalog count and never invents 120", () => {
  const report = reconcileBusinessRegistry();
  assert.ok(report.catalogCount > 0);
  assert.equal(report.mayClaimComplete120, report.catalogCount >= 120 && report.meetsTarget);
  assert.equal(report.unknownPresetIds.length, 0);
  // Nail salon is a load-bearing case id.
  assert.equal(assertKnownBusinessType("nail-salon"), true);
  // eslint-disable-next-line no-console
  console.log(
    `[registry] catalog=${report.catalogCount} target=${report.catalogTarget} presets=${report.industryPresetCount} destinations=${report.destinationCount}`,
  );
});
