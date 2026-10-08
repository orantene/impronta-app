import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { test } from "node:test";

import {
  DEVICE_SWITCH_BUDGET_MS,
  SANDBOX_SLUG,
  assertKeyedOp,
  assertSafeAction,
  assertSandbox,
  buildSnapshot,
  countOccurrences,
  deviceSwitchWithinBudget,
  formatResultTable,
  horizontalShift,
  isQaHarnessFile,
  landsAfterSelected,
  mobileHealthConsistent,
  noGhostText,
  planRestore,
  qaHarnessFileName,
  rectsIntersect,
  tinyPng,
  withinViewport,
  writeSnapshotFile,
  type RestoreOp,
  type Rect,
} from "./builder-behaviour";
import { deleteTempState } from "./timing-harness";

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const PID = "11111111-1111-1111-1111-111111111111";
const site = { id: "site-1", talent_profile_id: PID, site_slug: SANDBOX_SLUG, shell_tree: [{ id: "h" }], draft_rev: 7, shell_published: [{ id: "LIVE" }], style_classes: [], style_presets: [] };
const pages = [{ id: "pg-1", talent_profile_id: PID, slug: "home", blocks: [{ id: "a" }], blocks_published: [{ id: "LIVE" }], theme: {}, status: "draft" }];

test("sandbox guard: only TAL-93900 AND jorg-beauty-qa; Jorgelina and any other pair are refused", () => {
  assert.doesNotThrow(() => assertSandbox({ code: "TAL-93900", slug: SANDBOX_SLUG }));
  assert.throws(() => assertSandbox({ code: "TAL-93938", slug: SANDBOX_SLUG }), /REFUSED/);
  assert.throws(() => assertSandbox({ code: "TAL-93900", slug: "book-jorgelina" }), /REFUSED/);
  assert.throws(() => assertSandbox({ code: "TAL-93900", slug: null }), /REFUSED/);
  assert.throws(() => assertSandbox({ code: "TAL-93020", slug: SANDBOX_SLUG }), /REFUSED/);
});

test("publish guard refuses publish-like action names in English and Spanish, allows editing verbs", () => {
  for (const bad of ["Publish", "publish options", "Go live", "go  live now", "Unpublish", "Publicar", "Promote", "Release", "ship it"]) {
    assert.throws(() => assertSafeAction(bad), /REFUSED/, bad);
  }
  for (const ok of ["Add", "Duplicate", "Assets", "Mobile editing mode", "Tablet"]) assert.equal(assertSafeAction(ok), ok);
});

test("snapshot refuses a site or page that is not this profile's, or not the sandbox slug", () => {
  assert.doesNotThrow(() => buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site, pages }));
  assert.throws(() => buildSnapshot({ code: "TAL-93938", slug: SANDBOX_SLUG, profileId: PID, site, pages }), /REFUSED/);
  assert.throws(() => buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site: { ...site, talent_profile_id: "other" }, pages }), /REFUSED/);
  assert.throws(() => buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site: { ...site, site_slug: "book-jorgelina" }, pages }), /REFUSED/);
  assert.throws(() => buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site, pages: [{ ...pages[0]!, talent_profile_id: "other" }] }), /REFUSED/);
  assert.throws(() => buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: "", site, pages }), /REFUSED/);
});

test("restore plan: every op is keyed, draft columns only, published columns never written", () => {
  const ops = planRestore(buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site, pages }));
  assert.equal(ops.length, 2);
  const s = ops.find((o) => o.table === "talent_sites")!;
  assert.deepEqual(s.match, { id: "site-1", talent_profile_id: PID, site_slug: SANDBOX_SLUG });
  assert.deepEqual(Object.keys(s.values).sort(), ["draft_rev", "shell_tree", "style_classes", "style_presets"]);
  const p = ops.find((o) => o.table === "talent_pages")!;
  assert.deepEqual(p.match, { id: "pg-1", talent_profile_id: PID });
  assert.deepEqual(Object.keys(p.values).sort(), ["blocks", "status", "theme"]);
  for (const o of ops) assert.ok(!Object.keys(o.values).some((c) => /publish/i.test(c)));
});

test("an unkeyed or published-column restore op is refused", () => {
  const base: RestoreOp = { table: "talent_pages", values: { blocks: [] }, match: { id: "pg-1", talent_profile_id: PID } };
  assert.doesNotThrow(() => assertKeyedOp(base));
  assert.throws(() => assertKeyedOp({ ...base, match: {} }), /missing key/);
  assert.throws(() => assertKeyedOp({ ...base, match: { id: "pg-1", talent_profile_id: "" } }), /missing key/);
  assert.throws(() => assertKeyedOp({ ...base, match: { id: "", talent_profile_id: PID } }), /missing key/);
  assert.throws(() => assertKeyedOp({ table: "talent_sites", values: { shell_tree: [] }, match: { id: "s", talent_profile_id: PID } }), /site_slug/);
  assert.throws(() => assertKeyedOp({ ...base, values: { blocks_published: [] } }), /published/);
  assert.throws(() => assertKeyedOp({ ...base, values: {} }), /nothing to write/);
});

test("snapshot file is mode 0600 in a 0700 dir and is removed by deleteTempState", () => {
  const file = writeSnapshotFile(buildSnapshot({ code: "TAL-93900", slug: SANDBOX_SLUG, profileId: PID, site, pages }));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join0(file)).mode & 0o777, 0o700);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).slug, SANDBOX_SLUG);
  assert.equal(deleteTempState(file), true);
});
const join0 = (file: string) => file.slice(0, file.lastIndexOf("/"));

test("qa-harness file rules: only our own generated names count as deletable", () => {
  assert.equal(qaHarnessFileName(123), "qa-harness-123.png");
  assert.ok(isQaHarnessFile("qa-harness-123.png"));
  for (const bad of ["photo.png", "qa-harness-1.jpg", "my-qa-harness-1.png", "", null, undefined]) assert.equal(isQaHarnessFile(bad), false, String(bad));
});

test("tinyPng is a valid PNG: signature, IHDR size, inflatable pixel data of the right length", () => {
  const png = tinyPng(16);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 16);
  assert.equal(png.readUInt32BE(20), 16);
  const idatAt = png.indexOf("IDAT");
  const len = png.readUInt32BE(idatAt - 4);
  assert.equal(inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len)).length, 16 * (1 + 16 * 3));
  assert.ok(png.length < 1024);
  assert.equal(png.subarray(-12, -8).readUInt32BE(0), 0);
  assert.equal(png.subarray(-8, -4).toString("ascii"), "IEND");
});

test("hero fit: clipped on the right or left, or zero width, fails", () => {
  assert.equal(withinViewport(rect(0, 0, 1280, 600), 1280), true);
  assert.equal(withinViewport(rect(0, 0, 1330, 600), 1280), false);
  assert.equal(withinViewport(rect(-40, 0, 1240, 600), 1280), false);
  assert.equal(withinViewport(rect(0, 0, 0, 600), 1280), false);
  assert.equal(withinViewport(rect(0.5, 0, 390.5, 600), 390), true);
});

test("side panel cover: overlapping rects intersect, touching or apart do not", () => {
  assert.equal(rectsIntersect(rect(0, 0, 100, 100), rect(50, 50, 150, 150)), true);
  assert.equal(rectsIntersect(rect(0, 0, 100, 100), rect(100, 0, 200, 100)), false);
  assert.equal(rectsIntersect(rect(0, 0, 100, 100), rect(300, 300, 400, 400)), false);
});

test("horizontal shift is the largest of scroll, canvas and block movement", () => {
  const a = { scrollX: 0, canvasLeft: 80, blockLeft: 80 };
  assert.equal(horizontalShift(a, { ...a }), 0);
  assert.equal(horizontalShift(a, { ...a, canvasLeft: 120 }), 40);
  assert.equal(horizontalShift(a, { ...a, scrollX: 30 }), 30);
});

test("new block must land directly after the selected one; append at the end or index 1 fails", () => {
  const before = ["hero", "about", "faq", "contact"];
  assert.deepEqual(landsAfterSelected(before, ["hero", "about", "new", "faq", "contact"], "about"), { ok: true, newId: "new", expectedIndex: 2, actualIndex: 2 });
  assert.equal(landsAfterSelected(before, ["hero", "new", "about", "faq", "contact"], "about").ok, false);
  assert.equal(landsAfterSelected(before, ["hero", "about", "faq", "contact", "new"], "about").ok, false);
  assert.equal(landsAfterSelected(before, [...before], "about").ok, false);
  assert.equal(landsAfterSelected(before, ["hero", "about", "n1", "n2", "faq", "contact"], "about").ok, false);
  assert.equal(landsAfterSelected(before, ["hero", "x", "faq", "contact"], "missing").ok, false);
});

test("ghost text: the old text must disappear exactly once; staying behind fails", () => {
  assert.equal(noGhostText(1, 0), true);
  assert.equal(noGhostText(1, 1), false);
  assert.equal(noGhostText(2, 1), true);
  assert.equal(noGhostText(0, 0), true);
  assert.equal(countOccurrences("a Welcome b Welcome", "Welcome"), 2);
  assert.equal(countOccurrences("abc", ""), 0);
});

test("device switch budget is stated and enforced", () => {
  assert.equal(DEVICE_SWITCH_BUDGET_MS, 1500);
  assert.equal(deviceSwitchWithinBudget(900), true);
  assert.equal(deviceSwitchWithinBudget(1500), true);
  assert.equal(deviceSwitchWithinBudget(1501), false);
  assert.equal(deviceSwitchWithinBudget(Number.NaN), false);
});

test("mobile health must not say all clear while the phone page overflows", () => {
  assert.equal(mobileHealthConsistent({ docOverflowPx: 40, panelText: "Mobile health All clear" }).ok, false);
  assert.equal(mobileHealthConsistent({ docOverflowPx: 40, panelText: "Mobile health 2 blocks publish" }).ok, true);
  assert.equal(mobileHealthConsistent({ docOverflowPx: 0, panelText: "Mobile health All clear" }).ok, true);
  assert.equal(mobileHealthConsistent({ docOverflowPx: 0, panelText: "Mobile health 3 advisories" }).ok, true);
  assert.equal(mobileHealthConsistent({ docOverflowPx: 0, panelText: "Mobile health" }).ok, false);
});

test("result table lists every check with pass or FAIL and ms, and never prints a token", () => {
  const out = formatResultTable([
    { ticket: "TUL-78", name: "add opens with inspector", pass: true, ms: 812 },
    { ticket: "TUL-79", name: "hero fully visible", pass: false, ms: 40, note: "right edge 1330 > 1280" },
  ]);
  assert.match(out, /TUL-78 add opens with inspector\s+pass\s+812/);
  assert.match(out, /TUL-79 hero fully visible\s+FAIL\s+40\s+right edge 1330/);
  assert.match(out, /1 passed, 1 failed/);
  assert.ok(!/eyJ|base64-|access_token/.test(out));
});
