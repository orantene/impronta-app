import assert from "node:assert/strict";
import { test } from "node:test";

import {
  templateThumbnailPatch,
  resolveTemplateThumbnailMap,
  distinctThumbnailAssetIds,
} from "./thumbnail-helpers";

test("templateThumbnailPatch sets a non-empty asset id", () => {
  const patch = templateThumbnailPatch("tpl-1", "asset-9");
  assert.deepEqual(patch, { id: "tpl-1", thumbnail_asset_id: "asset-9" });
});

test("templateThumbnailPatch clears on null / blank id", () => {
  assert.deepEqual(templateThumbnailPatch("tpl-1", null), {
    id: "tpl-1",
    thumbnail_asset_id: null,
  });
  assert.deepEqual(templateThumbnailPatch("tpl-1", "   "), {
    id: "tpl-1",
    thumbnail_asset_id: null,
  });
});

test("distinctThumbnailAssetIds dedupes + drops empties", () => {
  const ids = distinctThumbnailAssetIds([
    { thumbnail_asset_id: "a" },
    { thumbnail_asset_id: "a" },
    { thumbnail_asset_id: "b" },
    { thumbnail_asset_id: null },
    { thumbnail_asset_id: "  " },
  ]);
  assert.deepEqual(ids.sort(), ["a", "b"]);
});

test("resolveTemplateThumbnailMap maps templateId → url, skipping unresolved", () => {
  const rows = [
    { id: "t1", thumbnail_asset_id: "a" },
    { id: "t2", thumbnail_asset_id: "b" }, // resolves
    { id: "t3", thumbnail_asset_id: "c" }, // asset missing from map
    { id: "t4", thumbnail_asset_id: null }, // no thumbnail
    { id: "t5", thumbnail_asset_id: "d" }, // empty url in map
  ];
  const assetUrlById = new Map<string, string>([
    ["a", "https://cdn/a.jpg"],
    ["b", "https://cdn/b.jpg"],
    ["d", ""],
  ]);
  const map = resolveTemplateThumbnailMap(rows, assetUrlById);
  assert.equal(map.get("t1"), "https://cdn/a.jpg");
  assert.equal(map.get("t2"), "https://cdn/b.jpg");
  assert.equal(map.has("t3"), false);
  assert.equal(map.has("t4"), false);
  assert.equal(map.has("t5"), false);
  assert.equal(map.size, 2);
});
