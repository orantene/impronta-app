import test from "node:test";
import assert from "node:assert/strict";
import { classify, SECTION_UNITS } from "./classify.mjs";
import { applyBaseline, mergeBaseline } from "./baseline.mjs";
import { pixelThresholdFor } from "./pixel-thresholds.mjs";

const row = (o) => ({ talent: "Alba", code: "TAL-1", width: 390, section: "hero", label: "Hero", status: "FAIL", reasons: [], findings: [], ...o });
const one = (finding, extra = {}) => classify([row({ findings: [finding], ...extra })], { design: "maison-v2" })[0];

test("style mismatch is a token delta", () => {
  assert.equal(one({ kind: "style", check: "font-size", evidence: "20 vs 24" }).layer, "token");
});
test("order and i18n are payload deltas", () => {
  assert.equal(one({ kind: "order", check: "section order", evidence: "x" }).layer, "payload");
  assert.equal(one({ kind: "i18n", check: "english", evidence: "x" }).layer, "payload");
});
test("overflow and layout are platform deltas", () => {
  assert.equal(one({ kind: "layout", check: "no horizontal overflow", evidence: "x" }).layer, "platform");
});
test("missing node with a kit slot is payload, without a slot is new-capability", () => {
  assert.equal(one({ kind: "missing", check: "hero", evidence: "x" }).layer, "payload");
  SECTION_UNITS.zzz = { wType: "zzz_block", slot: null };
  assert.equal(one({ kind: "missing", check: "zzz", evidence: "x" }, { section: "zzz" }).layer, "new-capability");
  delete SECTION_UNITS.zzz;
});
test("a section marked missing in the map is new-capability whatever the finding", () => {
  SECTION_UNITS.mm = { wType: "mm", missing: true };
  assert.equal(one({ kind: "style", check: "color", evidence: "x" }, { section: "mm" }).layer, "new-capability");
  delete SECTION_UNITS.mm;
});
test("same structural delta on every demo is kit, on one demo is payload", () => {
  const f = { kind: "structure", check: "expects eyebrow", evidence: "x" };
  const both = classify([row({ findings: [f] }), row({ code: "TAL-2", findings: [f] })]);
  assert.ok(both.every((d) => d.layer === "kit"));
  const mixed = classify([row({ findings: [f] }), row({ code: "TAL-2", status: "PASS" })]);
  assert.equal(mixed[0].layer, "payload");
});
test("pixel-only failure is inferred from height", () => {
  const big = one({ kind: "pixel", check: "pixel diff", evidence: "x", pixel: { heightDeltaRatio: 0.2 } });
  assert.deepEqual([big.layer, big.inferred], ["kit", true]);
  const small = one({ kind: "pixel", check: "pixel diff", evidence: "x", pixel: { heightDeltaRatio: 0.01 } });
  assert.equal(small.layer, "token");
});
test("every delta carries section, check, layer, evidence, suggestedFile", () => {
  const d = one({ kind: "style", check: "c", evidence: "e" });
  for (const k of ["section", "check", "layer", "evidence", "suggestedFile"]) assert.ok(d[k], k);
});

test("pixel threshold: map value wins, then legacy, then table", () => {
  assert.equal(pixelThresholdFor("hero", { pixel: { maxMismatch: 0.5 } }), 0.5);
  assert.equal(pixelThresholdFor("hero", { pixelThreshold: 0.3 }), 0.3);
  assert.equal(pixelThresholdFor("hero", {}), 0.18);
  assert.equal(pixelThresholdFor("nope", undefined), 0.15);
});

const base = (accepted) => ({ accepted });
test("baseline marks matching deltas, wildcard check, and reports stale entries", () => {
  const ds = [{ section: "menu", check: "overflow 360", width: 360, talent: "TAL-1", layer: "platform" }, { section: "hero", check: "x", width: 390, talent: "TAL-1", layer: "token" }];
  const stale = applyBaseline(ds, base([{ section: "menu", check: "overflow*", ticket: "TF-1" }, { section: "gone", check: "y", ticket: "TF-2" }]));
  assert.equal(ds[0].accepted, "TF-1");
  assert.equal(ds[1].accepted, undefined);
  assert.equal(stale.length, 1);
});
test("baseline width narrows an entry", () => {
  const ds = [{ section: "menu", check: "c", width: 390, talent: "T", layer: "token" }];
  applyBaseline(ds, base([{ section: "menu", check: "c", width: 360, ticket: "TF-1" }]));
  assert.equal(ds[0].accepted, undefined);
});
test("mergeBaseline adds new deltas with the ticket, keeps old tickets, drops stale", () => {
  const ds = [{ section: "menu", check: "c", width: 390, talent: "T", layer: "token", evidence: "e" }, { section: "hero", check: "h", width: 390, talent: "T", layer: "kit", evidence: "e" }];
  const m = mergeBaseline([{ section: "menu", check: "c", ticket: "OLD" }, { section: "gone", check: "g", ticket: "OLD2" }], ds, "TF-9");
  assert.equal(m.added, 1);
  assert.equal(m.removed, 1);
  assert.deepEqual(m.accepted.map((a) => a.ticket), ["OLD", "TF-9"]);
  const scoped = mergeBaseline([{ section: "gone", check: "g", ticket: "OLD2" }], [], "TF-9", { scoped: true });
  assert.equal(scoped.accepted.length, 1);
  assert.throws(() => mergeBaseline([], ds, ""));
});
test("after merge every delta is baselined (exit 0 condition)", () => {
  const ds = [{ section: "hero", check: "h", width: 390, talent: "T", layer: "kit", evidence: "e" }];
  const m = mergeBaseline([], ds, "TF-9");
  applyBaseline(ds, base(m.accepted));
  assert.ok(ds.every((d) => d.accepted));
});
