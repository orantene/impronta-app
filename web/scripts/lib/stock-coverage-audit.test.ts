import assert from "node:assert/strict";
import test from "node:test";

import { SLICE1_CODES } from "../demo-talents/unique-theme-map";
import {
  assessStockCoverage,
  assessTarget,
  buildStockCoverageTargets,
  stockCoverageTargetKeys,
  targetKey,
  type StockCoverageTarget,
} from "./stock-coverage-audit";

test("required target list includes every unique-theme demo pack and acceptance types", () => {
  const keys = stockCoverageTargetKeys();
  assert.ok(keys.length >= 45, `expected ~47 acceptance-derived types plus demos, got ${keys.length}`);
  for (const code of SLICE1_CODES) {
    const demoKey = buildStockCoverageTargets().find((t) => t.sources.some((s) => s.includes(code)));
    assert.ok(demoKey, `missing unique-theme target for ${code}`);
  }
  assert.ok(keys.includes("nail-salon|beauty"));
  assert.ok(keys.includes("|custom"), "fashion-model demo relies on universal custom pack");
  assert.ok(keys.includes("handyman|professional"));
});

test("assessStockCoverage passes when pool has hero and gallery", () => {
  const r = assessStockCoverage([
    { id: "1", role: "hero", originTenantId: null },
    { id: "2", role: "gallery", originTenantId: null },
  ]);
  assert.equal(r.heroCount, 1);
  assert.equal(r.galleryCount, 1);
  assert.deepEqual(r.gaps, []);
});

test("wide counts as hero; tenant-origin rows do not count", () => {
  const r = assessStockCoverage([
    { id: "1", role: "wide", originTenantId: null },
    { id: "2", role: "gallery", originTenantId: null },
    { id: "3", role: "hero", originTenantId: "tenant-x" },
  ]);
  assert.equal(r.heroCount, 1);
  assert.equal(r.galleryCount, 1);
  assert.deepEqual(r.gaps, []);
});

test("assessStockCoverage fails with explicit gaps", () => {
  const noHero = assessStockCoverage([{ id: "g", role: "gallery", originTenantId: null }]);
  assert.deepEqual(noHero.gaps, ["hero/wide"]);

  const noGallery = assessStockCoverage([{ id: "h", role: "hero", originTenantId: null }]);
  assert.deepEqual(noGallery.gaps, ["gallery"]);

  const empty = assessStockCoverage([]);
  assert.deepEqual(empty.gaps, ["hero/wide", "gallery"]);
});

test("assessTarget wraps target metadata", () => {
  const target: StockCoverageTarget = {
    businessType: "nail-salon",
    family: "beauty",
    sources: ["acceptance:nail-salon"],
  };
  const ok = assessTarget(target, [
    { id: "a", role: "hero", originTenantId: null },
    { id: "b", role: "gallery", originTenantId: null },
  ]);
  assert.equal(ok.ok, true);
  assert.equal(targetKey(ok.target.businessType, ok.target.family), "nail-salon|beauty");
});
