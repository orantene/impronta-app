import assert from "node:assert/strict";
import { test } from "node:test";

import {
  albumNameFromId,
  albumPhotoCount,
  appendAlbumPage,
  applyOverviewToAlbums,
  totalPhotosOf,
  type AlbumSummaryWire,
  type DrawerAlbum,
} from "./profile-shell-album-media";

const cover = (id: string, sortOrder = 0) => ({ id, url: `u-${id}`, sortOrder });
const summary = (albumId: string | null, count: number, ids: string[]): AlbumSummaryWire => ({
  albumId,
  count,
  covers: ids.map((id, i) => cover(id, i)),
});
const none = summary(null, 0, []);
const main: DrawerAlbum = { id: "main", name: "Main", items: [] };

test("counts come from the grouped counts, not the covers on screen", () => {
  const { albums, paging } = applyOverviewToAlbums([main, { id: "ed", name: "Editorial", items: [] }], {
    albums: [summary("ed", 5000, ["e1", "e2", "e3", "e4"])],
    unassigned: summary(null, 2500, ["m1", "m2", "m3", "m4"]),
  });
  assert.equal(albums[0].items.length, 4);
  assert.equal(paging.main.total, 2500);
  assert.equal(paging.ed.total, 5000);
  assert.equal(totalPhotosOf(paging, albums), 7500);
  assert.equal(paging.ed.nextOffset, 4);
  assert.equal(paging.main.includeUnassigned, true);
  assert.equal(paging.ed.includeUnassigned, false);
});

test("an album with zero photos has no cursor and a zero count", () => {
  const { albums, paging } = applyOverviewToAlbums([main, { id: "empty", name: "Empty", items: [] }], {
    albums: [],
    unassigned: summary(null, 3, ["a", "b", "c"]),
  });
  assert.equal(paging.empty.total, 0);
  assert.equal(paging.empty.nextOffset, null);
  assert.equal(albums[1].items.length, 0);
  assert.equal(paging.main.nextOffset, null, "3 photos all shown as covers");
});

test("an album that only exists in the media is added with a readable name", () => {
  const { albums } = applyOverviewToAlbums([main], {
    albums: [summary("lookbook-ab12", 2, ["x", "y"])],
    unassigned: none,
  });
  assert.deepEqual(albums.map((a) => a.id), ["main", "lookbook-ab12"]);
  assert.equal(albums[1].name, "lookbook");
  assert.equal(albumNameFromId("lookbook-ab12"), "lookbook");
});

test("no gallery photos at all leaves seeded album items alone", () => {
  const seeded: DrawerAlbum = { id: "main", name: "Main", items: [{ url: "seed" }] };
  const { albums, paging } = applyOverviewToAlbums([seeded], { albums: [], unassigned: none });
  assert.equal(albums[0], seeded);
  assert.deepEqual(paging, {});
  assert.equal(totalPhotosOf(paging, albums), 1);
});

test("unassigned and first-album covers merge in gallery order, capped", () => {
  const { albums } = applyOverviewToAlbums([main], {
    albums: [summary("main", 3, ["b1", "b2", "b3"])],
    unassigned: { albumId: null, count: 3, covers: [cover("u1", 0.5), cover("u2", 5), cover("u3", 9)] },
  });
  assert.deepEqual(albums[0].items.map((i) => i.mediaAssetId), ["b1", "u1", "b2", "b3"]);
});

test("paging cursor: a loaded page is appended, deduped, and advances the cursor", () => {
  const first = applyOverviewToAlbums([main], {
    albums: [],
    unassigned: summary(null, 130, ["c1", "c2", "c3", "c4"]),
  });
  const p1 = appendAlbumPage(first.albums, first.paging, "main", {
    items: [{ id: "c4", url: "u-c4" }, ...Array.from({ length: 59 }, (_, i) => ({ id: `p${i}`, url: `u-p${i}` }))],
    total: 130,
    nextOffset: 64,
  });
  assert.equal(p1.albums[0].items.length, 4 + 59, "c4 is not duplicated");
  assert.equal(p1.paging.main.nextOffset, 64);
  const last = appendAlbumPage(p1.albums, p1.paging, "main", { items: [{ id: "z", url: "u-z" }], total: 130, nextOffset: null });
  assert.equal(last.paging.main.nextOffset, null);
  assert.equal(last.paging.main.total, 130);
  assert.equal(albumPhotoCount(last.paging, last.albums[0]), 130);
});

test("appending to an unknown album is a no-op", () => {
  const out = appendAlbumPage([main], {}, "ghost", { items: [], total: 0, nextOffset: null });
  assert.deepEqual(out.paging, {});
});
