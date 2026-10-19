/**
 * upload-hardening-wiring.static.test.ts: the H1 guards are only as good as
 * the call sites that use them. Each entry names a path that fetches a
 * user-supplied URL or stores user image bytes, and the guard it must call.
 * A future edit that drops back to a bare `fetch(` or `arrayBuffer()` fails
 * here with the file named.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

/** Server code that fetches a URL a user typed: must go through safeFetch. */
const USER_URL_FETCHERS = [
  "src/lib/messages/unfurl.ts",
  "src/lib/tulala/url-import.server.ts",
  "src/lib/menu-import/from-brief.ts",
  "src/lib/menu-import/photo-ingest.ts",
  "src/lib/site-admin/edit-mode/link-validate-action.ts",
  "src/lib/site-admin/edit-mode/brand-kit-url-action.ts",
];

for (const rel of USER_URL_FETCHERS) {
  test(`${rel} fetches user URLs through safeFetch only`, () => {
    const src = read(rel);
    assert.match(src, /from "@\/lib\/security\/safe-fetch"/, "imports safeFetch");
    assert.doesNotMatch(src, /\bawait fetch\(/, "no bare fetch of a user URL");
    assert.doesNotMatch(src, /redirect:\s*"follow"/, "no unchecked redirect following");
  });
}

/** Downloads from trusted hosts that still must not buffer unbounded. */
const CAPPED_DOWNLOADS = [
  "src/app/(workspace)/[tenantSlug]/admin/media/_drive-import-helpers.ts",
  "src/lib/talent/media-kit-pdf.ts",
  "src/lib/events/ticket-pdf.ts",
  "src/lib/media/watermark-bake.ts",
];

for (const rel of CAPPED_DOWNLOADS) {
  test(`${rel} reads remote bytes through the streaming cap`, () => {
    const src = read(rel);
    assert.match(src, /readResponseCapped\(/);
    // The remote Response (not a storage download of our own object) must
    // never be read with arrayBuffer(): that buffers before any cap.
    assert.doesNotMatch(src, /\b(res|logoResp)\.arrayBuffer\(\)/, "arrayBuffer() buffers before any cap");
  });
}

/** Upload paths: magic-byte sniff before storing. */
const SNIFFING_UPLOADS = [
  "src/app/api/talent/media/upload/route.ts",
  "src/app/api/admin/media/upload/route.ts",
  "src/app/api/admin/media/upload/register/route.ts",
  "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts",
  "src/app/(workspace)/[tenantSlug]/admin/media/_drive-import-helpers.ts",
];

for (const rel of SNIFFING_UPLOADS) {
  test(`${rel} trusts magic bytes, not the claimed type`, () => {
    assert.match(read(rel), /guardImage(Bytes|Blob)\(/);
  });
}

test("multipart upload routes refuse an oversized Content-Length before parsing the form", () => {
  for (const rel of ["src/app/api/talent/media/upload/route.ts", "src/app/api/admin/media/upload/route.ts"]) {
    const src = read(rel);
    const pre = src.indexOf("checkDeclaredLength(");
    const form = src.indexOf("req.formData()");
    assert.ok(pre > 0 && form > 0 && pre < form, `${rel}: length check precedes formData()`);
  }
});

test("the shared resize and metadata reads run under the pixel cap", () => {
  for (const rel of ["src/lib/server/media-resize.ts", "src/lib/server/media-metadata.ts"]) {
    const src = read(rel);
    assert.match(src, /SHARP_INPUT_LIMITS/, `${rel} passes the pixel cap to sharp`);
  }
});

test("register lane re-encodes any original that carries EXIF/XMP, not only when smaller", () => {
  assert.match(read("src/app/api/admin/media/upload/register/route.ts"), /hasEmbeddedMetadata\(/);
});

test("menu photos are stored with location metadata stripped", () => {
  assert.match(read("src/lib/menu-import/photo-ingest.ts"), /stripImageMetadata\(/);
});

test("nothing re-attaches metadata to stored derivatives", () => {
  for (const rel of [
    "src/lib/server/media-resize.ts",
    "src/lib/media/image-sanitize.server.ts",
    "src/lib/media/watermark-bake.ts",
  ]) {
    assert.doesNotMatch(read(rel), /\.(withMetadata|keepMetadata|keepExif|withExif)\(/, rel);
  }
});
