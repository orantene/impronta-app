/**
 * photo-ingest.test.ts — the rules that make a photo import safe to re-run.
 *
 * The dangerous failures here are all quiet ones: a re-import that silently
 * duplicates every photo, a menu export that makes the server fetch its own
 * cloud metadata, a "photo" that is really an HTML error page. None of those
 * announce themselves, so each has a test.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  extForContentType,
  planPhotoFetches,
  isSupportedPhotoType,
  MAX_PHOTO_BYTES,
  MENU_PHOTO_PURPOSE,
  SOURCE_URL_KEY,
} from "./photo-ingest";
import { parseRestauradminMenu } from "./parse-restauradmin";

test("RE-IMPORT DOWNLOADS NOTHING — the whole point of the source-url key", () => {
  // Without this, re-importing El Paisa re-fetches every photo and mints a
  // duplicate asset each time, while the menu still looks correct.
  const urls = ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"];
  const already = new Map([
    ["https://cdn.example/a.jpg", "asset-a"],
    ["https://cdn.example/b.jpg", "asset-b"],
  ]);
  const plan = planPhotoFetches(urls, already);
  assert.deepEqual(plan.toFetch, [], "a re-import must fetch nothing");
  assert.equal(plan.reused.length, 2);
  assert.ok(plan.reused.every((r) => r.reused));
});

test("a photo shared by two dishes is fetched ONCE", () => {
  const shared = "https://cdn.example/parrilla.jpg";
  const plan = planPhotoFetches([shared, shared, shared], new Map());
  assert.deepEqual(plan.toFetch, [shared]);
});

test("a partly-ingested menu fetches only what is missing", () => {
  const plan = planPhotoFetches(
    ["https://cdn.example/a.jpg", "https://cdn.example/new.jpg"],
    new Map([["https://cdn.example/a.jpg", "asset-a"]]),
  );
  assert.deepEqual(plan.toFetch, ["https://cdn.example/new.jpg"]);
  assert.deepEqual(plan.reused, [
    { sourceUrl: "https://cdn.example/a.jpg", mediaAssetId: "asset-a", reused: true },
  ]);
});

test("empty and missing urls are skipped, not fetched as ''", () => {
  const plan = planPhotoFetches(["", "https://cdn.example/a.jpg", ""], new Map());
  assert.deepEqual(plan.toFetch, ["https://cdn.example/a.jpg"]);
});

test("ONLY the three raster types are storable", () => {
  assert.deepEqual(extForContentType("image/jpeg"), { ext: "jpg", mime: "image/jpeg" });
  assert.deepEqual(extForContentType("image/png"), { ext: "png", mime: "image/png" });
  assert.deepEqual(extForContentType("image/webp"), { ext: "webp", mime: "image/webp" });
  // A charset parameter is normal and must not defeat the match.
  assert.deepEqual(extForContentType("image/jpeg; charset=binary"), {
    ext: "jpg",
    mime: "image/jpeg",
  });
  assert.deepEqual(extForContentType("IMAGE/PNG"), { ext: "png", mime: "image/png" });
});

test("AN HTML ERROR PAGE IS NOT A PHOTO", () => {
  // The common real failure: a CDN 200s with an error page, or a hotlink guard
  // serves HTML. Storing that would put a text file in the media library and
  // render a broken image on the menu.
  for (const ct of ["text/html", "application/json", "image/svg+xml", "", null, undefined, 42]) {
    assert.equal(extForContentType(ct), null, `${String(ct)} must not be storable`);
  }
});

test("SVG IS REFUSED — it is a script vector, not a dish photo", () => {
  // An SVG can carry <script>. Serving one from our own storage origin would
  // be stored XSS. The branding uploader refuses it for the same reason.
  assert.equal(extForContentType("image/svg+xml"), null);
  assert.equal(isSupportedPhotoType("image/svg+xml"), false);
});

test("the byte cap is a real number, not a comment", () => {
  assert.equal(MAX_PHOTO_BYTES, 8 * 1024 * 1024);
});

test("the asset is filed where a re-import will find it", () => {
  // These two constants ARE the idempotency contract: the loader queries by
  // purpose and reads the key. A rename on one side alone silently turns every
  // re-import into a re-download.
  assert.equal(MENU_PHOTO_PURPOSE, "cms");
  assert.equal(SOURCE_URL_KEY, "source_url");
});

test("EL PAISA: the real fixture yields photo urls to ingest", () => {
  // Against the checked-in export rather than invented urls — the count is the
  // one the Director and CEO have been quoting, so it should be asserted
  // somewhere rather than repeated from memory.
  const menu = parseRestauradminMenu(
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), "src/lib/menu-import/parrilla-el-paisa.fixture.json"),
        "utf8",
      ),
    ),
  );
  const urls = menu.items.map((i) => i.imageUrl).filter((u): u is string => Boolean(u));
  assert.equal(urls.length, 21, "21 of the 117 dishes carry a photo");
  assert.ok(
    urls.every((u) => /^https?:\/\//i.test(u)),
    "every photo url is http(s) — a data: or file: url would never reach the guard",
  );

  // First run fetches all of them; second run fetches none.
  const first = planPhotoFetches(urls, new Map());
  assert.equal(first.toFetch.length, new Set(urls).size);
  const after = new Map(first.toFetch.map((u, n) => [u, `asset-${n}`]));
  assert.deepEqual(planPhotoFetches(urls, after).toFetch, []);
});
