import test from "node:test";
import assert from "node:assert/strict";

import {
  pickGalleryUrls,
  pickHeadshotUrl,
  resolveLiveMediaUrls,
  type MediaPickRow,
} from "./media-pick";

const rows: MediaPickRow[] = [
  { url: "https://cdn/lashes-classic.jpg", variantKind: "gallery", sortOrder: 0 },
  { url: "https://cdn/portrait.jpg", variantKind: "card", sortOrder: 0 },
  { url: "https://cdn/hero.jpg", variantKind: "hero", sortOrder: 1 },
  { url: "https://cdn/nails.jpg", variantKind: "gallery", sortOrder: 2 },
];

test("pickHeadshotUrl prefers card over earlier gallery by sort_order", () => {
  assert.equal(pickHeadshotUrl(rows), "https://cdn/portrait.jpg");
});

test("pickGalleryUrls omits card and the chosen headshot", () => {
  const head = pickHeadshotUrl(rows);
  assert.deepEqual(pickGalleryUrls(rows, head, 6), [
    "https://cdn/lashes-classic.jpg",
    "https://cdn/hero.jpg",
    "https://cdn/nails.jpg",
  ]);
});

test("resolveLiveMediaUrls maps hero/about/inset like demo style", () => {
  const live = resolveLiveMediaUrls(rows);
  assert.equal(live.headshotUrl, "https://cdn/portrait.jpg");
  assert.equal(live.aboutUrl, "https://cdn/hero.jpg");
  assert.equal(live.insetUrl, "https://cdn/lashes-classic.jpg");
});
