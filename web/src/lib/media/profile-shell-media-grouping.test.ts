import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ALBUM_COVER_LIMIT,
  albumOrFilter,
  groupAlbumRows,
  normalizeAlbumId,
  quoteFilterValue,
} from "./profile-shell-media-grouping";

const rows = (n: number, pick: (i: number) => string | null) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, albumId: pick(i) }));

test("counts are exact for a library far bigger than one page", () => {
  const g = groupAlbumRows(rows(12_345, (i) => (i % 5 === 0 ? "a" : i % 5 === 1 ? "b" : i % 5 === 2 ? null : "c")));
  const byId = Object.fromEntries(g.groups.map((x) => [x.albumId, x.count]));
  assert.equal(byId.a, 2469);
  assert.equal(byId.b, 2469);
  assert.equal(byId.c, 4938);
  assert.equal(g.unassigned.count, 2469);
  assert.equal(g.total, 12_345);
  assert.equal(g.groups.reduce((n, x) => n + x.count, g.unassigned.count), g.total);
});

test("covers are capped and keep gallery order", () => {
  const g = groupAlbumRows(rows(100, () => "a"));
  assert.equal(ALBUM_COVER_LIMIT, 4);
  assert.deepEqual(g.groups[0].coverIds, ["r0", "r1", "r2", "r3"]);
  assert.equal(g.groups[0].count, 100);
});

test("an album with fewer photos than the cap, and an empty library", () => {
  const g = groupAlbumRows(rows(2, () => "solo"));
  assert.deepEqual(g.groups[0].coverIds, ["r0", "r1"]);
  const empty = groupAlbumRows([]);
  assert.deepEqual(empty.groups, []);
  assert.equal(empty.unassigned.count, 0);
  assert.equal(empty.total, 0);
});

test("empty and non-string album ids count as unassigned", () => {
  assert.equal(normalizeAlbumId(""), null);
  assert.equal(normalizeAlbumId(undefined), null);
  assert.equal(normalizeAlbumId(7), null);
  assert.equal(normalizeAlbumId("x"), "x");
  const g = groupAlbumRows([{ id: "1", albumId: "" }, { id: "2", albumId: null }]);
  assert.equal(g.unassigned.count, 2);
  assert.deepEqual(g.groups, []);
});

test("filter values are quoted so commas, parens and quotes cannot break the or()", () => {
  assert.equal(quoteFilterValue('a,b)"c'), '"a,b)\\"c"');
  assert.equal(albumOrFilter("x", false), 'metadata->>albumId.eq."x"');
  assert.ok(albumOrFilter("x", true).startsWith("metadata->>albumId.is.null,"));
});

test("the profile shell drawer no longer loads the whole library", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const state = read("src/components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/profile-state.tsx");
  assert.ok(state.includes("media: actionLoadProfileShellMedia(tid)"));
  assert.ok(!state.includes("actionLoadTalentMediaBundleAll"));
  const drawer = read("src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx");
  assert.ok(!drawer.includes("actionLoadTalentMediaBundleAll"));
  assert.ok(!drawer.includes("Keep albumsPro photo lists in sync with galleryAssets"), "album lists are not rebuilt from a partial gallery");
  assert.ok(drawer.includes("totalPhotosOf(profileMedia.albumPaging.paging, state.albumsPro)"), "totals come from the grouped counts");
  assert.ok(drawer.includes("onLoadMore={profileMedia.galleryPaging.loadMore}"));
});
