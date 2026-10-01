import test from "node:test";
import assert from "node:assert/strict";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { applyTokenSplit, mapCasResult, mapDraftRow, splitTokenPatch, type ThemeDraftRow } from "./drafts-pure";

const payload = { shellTree: [], homeTree: [], tokenDefaults: { "type.stretch": "100%" } } as unknown as DesignPayload;
const row: ThemeDraftRow = {
  id: "d1",
  design: "folio",
  base_version: 3,
  payload,
  preview: null,
  rev: 2,
  status: "open",
  published_version: null,
  release_id: null,
  updated_at: "2026-10-01T00:00:00Z",
};

test("mapDraftRow maps snake_case to camelCase and defaults preview", () => {
  const d = mapDraftRow(row);
  assert.equal(d.baseVersion, 3);
  assert.equal(d.rev, 2);
  assert.deepEqual(d.preview, {});
  assert.equal(d.publishedVersion, null);
  assert.equal(d.releaseId, null);
});

test("splitTokenPatch routes look-owned keys to preview and rejects unknown keys", () => {
  const s = splitTokenPatch({ "color.primary": "v", "nope.key": "x" });
  assert.deepEqual(s.look, { "color.primary": "v" });
  assert.deepEqual(s.invalid, ["nope.key"]);
});

test("splitTokenPatch validates style tokens; null removes", () => {
  const s = splitTokenPatch({ "type.hero-size": "40px", "type.stretch": null, "type.hero-size-desktop": "url(x);" });
  assert.deepEqual(s.style, { "type.hero-size": "40px", "type.stretch": null });
  assert.deepEqual(s.invalid, ["type.hero-size-desktop"]);
});

test("applyTokenSplit sets and removes keys", () => {
  const out = applyTokenSplit(
    payload,
    {},
    { style: { "type.stretch": null, "type.hero-size": "40px" }, look: { "color.primary": "x" }, invalid: [] },
  );
  assert.deepEqual(out.payload.tokenDefaults, { "type.hero-size": "40px" });
  assert.deepEqual(out.preview.previewTokens, { "color.primary": "x" });
});

test("applyTokenSplit leaves payload untouched when only look keys change", () => {
  const out = applyTokenSplit(payload, {}, { style: {}, look: { "color.a": "b" }, invalid: [] });
  assert.equal(out.payload, payload);
});

test("mapCasResult: 0 rows is stale_rev, error is error, 1 row is ok", () => {
  const stale = mapCasResult([], null);
  assert.equal(stale.ok === false && stale.code, "stale_rev");
  const err = mapCasResult(null, { message: "boom" });
  assert.equal(err.ok === false && err.code, "error");
  const ok = mapCasResult([row], null);
  assert.equal(ok.ok && ok.value.rev, 2);
});
