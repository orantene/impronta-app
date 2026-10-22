/**
 * upload-hardening-wiring.static.test.ts: the H1 guards are only as good as
 * the call sites that use them. Each entry names a path that fetches a
 * user-supplied URL or stores user image bytes, and the guard it must call.
 * A future edit that drops back to a bare `fetch(` or `arrayBuffer()` fails
 * here with the file named.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { SERVER_ACTION_BODY_LIMIT_BYTES } from "@/lib/media/upload-guards";

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
  "src/lib/ai/ai-image-generation.ts",
  "src/lib/ai/openai-image-request.ts",
];

for (const rel of CAPPED_DOWNLOADS) {
  test(`${rel} reads remote bytes through the streaming cap`, () => {
    const src = read(rel);
    assert.match(src, /readResponseCapped\(/);
    // The remote Response (not a storage download of our own object) must
    // never be read with arrayBuffer(): that buffers before any cap.
    assert.doesNotMatch(src, /\b(res|logoResp|img)\.arrayBuffer\(\)/, "arrayBuffer() buffers before any cap");
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

// ── Every upload entry point, not just the files this PR edited ──────────────

/**
 * An UPLOAD ENTRY POINT is any non-test source file that either
 *   • writes to Supabase storage (`.storage ... .upload(` / `.uploadToSignedUrl(`), or
 *   • on the server, takes a user File (`instanceof File`, `as File`).
 * Each one must call an H1 guard. Files that legitimately do neither (generated
 * output, parse-only imports, browser helpers) or are knowingly DEFERRED are
 * listed below WITH A REASON. A new unguarded entry point fails this test.
 */
const GUARD_SYMBOLS =
  /\b(sniffImageBlob|guardImageBlob|guardImageBytes|readGuardedImage|readGuardedAttachment|verifyStoredImage|stripImageMetadata|sanitizeImageForStorage|resizeUploadForStorage|hasEmbeddedMetadata)\(/;

const NOT_GUARDED_ON_PURPOSE: Readonly<Record<string, string>> = {
  "src/app/(workspace)/platform/admin/builder-lab/looks/actions.ts":
    "reads an uploaded JSON look as text; nothing is stored as a file",
  "src/app/api/admin/roster-import/route.ts":
    "CSV/JSON parsed in memory, never stored; Content-Length pre-checked",
  "src/app/api/admin/media/upload/svg/route.ts": "SVG-only lane: the strict sanitizer is its guard",
  "src/lib/client/image-compress.ts": "browser canvas re-encode helper, not a server entry",
  "src/lib/media/platform-stock-admin.server.ts":
    "re-encodes every input with sharp (no metadata); its upload caller is guarded",
  "src/lib/media/watermark-bake.ts": "stores a sharp-rendered derivative of an already-stored asset",
  "src/lib/payments/booking-confirmation.ts": "stores a server-generated PDF",
  "src/lib/site-admin/builder-core/templates/auto-thumbnail.ts": "stores a server-generated screenshot",
};

const STORAGE_UPLOAD = /\.storage\b[\s\S]{0,160}?\.upload(?:ToSignedUrl)?\(/;
const FILE_READ = /instanceof File\b|\bas File\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const ENTRY_POINTS = sourceFiles(path.join(WEB, "src"))
  .map((full) => ({ rel: path.relative(WEB, full).split(path.sep).join("/"), src: readFileSync(full, "utf8") }))
  .filter(({ src }) => {
    const client = /^\s*["']use client["']/.test(src);
    return STORAGE_UPLOAD.test(src) || (!client && FILE_READ.test(src));
  });

test("scanner liveness: it finds the upload entry points it must find", () => {
  const rels = new Set(ENTRY_POINTS.map((e) => e.rel));
  for (const known of [
    "src/lib/server/avatar-upload-action.ts",
    "src/app/api/talent/media/upload/route.ts",
    "src/lib/server-actions/client-inquiry-attachments.ts",
    "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/EditorSections.tsx",
  ]) {
    assert.ok(rels.has(known), `scanner lost ${known}: the patterns broke, not the code`);
  }
  assert.ok(ENTRY_POINTS.length >= 20, `only ${ENTRY_POINTS.length} entry points found`);
});

test("EVERY upload entry point calls an H1 guard or is allow-listed with a reason", () => {
  const unguarded = ENTRY_POINTS.filter(
    ({ rel, src }) => !GUARD_SYMBOLS.test(src) && !(rel in NOT_GUARDED_ON_PURPOSE),
  ).map((e) => e.rel);
  assert.deepEqual(
    unguarded,
    [],
    "New upload entry point(s) without readGuardedImage / readGuardedAttachment / " +
      "verifyStoredImage / guardImage*: add the guard, or allow-list the file with a reason.",
  );
});

test("the allow-list stays honest: every listed file is still an unguarded entry point", () => {
  const byRel = new Map(ENTRY_POINTS.map((e) => [e.rel, e.src]));
  for (const rel of Object.keys(NOT_GUARDED_ON_PURPOSE)) {
    const src = byRel.get(rel);
    assert.ok(src !== undefined, `${rel} is no longer an upload entry point: drop it from the list`);
    assert.ok(!GUARD_SYMBOLS.test(src), `${rel} is guarded now: drop it from the list`);
  }
});

test("server-action uploads: the 4 MB platform body limit is the real ceiling, and the code says so", () => {
  const config = read("next.config.ts");
  const m = /serverActions:\s*\{[^}]*bodySizeLimit:\s*"(\d+)mb"/.exec(config);
  assert.ok(m, "next.config.ts must set serverActions.bodySizeLimit");
  assert.equal(Number(m![1]) * 1024 * 1024, SERVER_ACTION_BODY_LIMIT_BYTES);
  // Vercel's serverless request body cap is ~4.5 MB; the limit must stay under it.
  assert.ok(SERVER_ACTION_BODY_LIMIT_BYTES <= 4.5 * 1024 * 1024);
});
