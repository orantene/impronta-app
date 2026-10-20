/**
 * portfolio-upload-verify.server.test.ts: registerPortfolioPhoto's H1 hook,
 * extracted so extended-actions.ts stays under the 800-line cap.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { createTranslator } from "@/i18n/messages";

import { verifyPortfolioUpload } from "./portfolio-upload-verify.server";

const TALENT = "11111111-2222-4333-8444-555555555555";
const en = createTranslator("en");

function fakeStore(bytes: Buffer, uploads: Buffer[]): SupabaseClient {
  return {
    storage: {
      from: () => ({
        info: async () => ({ data: { size: bytes.byteLength }, error: null }),
        download: async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null }),
        upload: async (_p: string, b: Buffer) => {
          uploads.push(b);
          return { data: {}, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

test("a fresh upload under the talent's prefix is verified and its GPS stripped", async () => {
  const gps = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "21/1 9/1 0/1" } })
    .toBuffer();
  const uploads: Buffer[] = [];
  const r = await verifyPortfolioUpload(fakeStore(gps, uploads), TALENT, { storagePath: `${TALENT}/gallery/a.jpg`, mimeType: "image/gif" }, en);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.input.mimeType, "image/jpeg", "type comes from the bytes, not the client");
  assert.equal(uploads.length, 1);
  assert.equal((await sharp(uploads[0]!).metadata()).exif, undefined);
});

test("HTML uploaded as a portfolio photo is refused", async () => {
  const html = Buffer.from("<html><script>alert(1)</script></html>");
  const r = await verifyPortfolioUpload(fakeStore(html, []), TALENT, { storagePath: `${TALENT}/gallery/x.jpg` }, en);
  assert.equal(r.ok, false);
});

test("a re-add of an existing asset outside the fresh prefix is not re-verified", async () => {
  const uploads: Buffer[] = [];
  const input = { storagePath: "tenant/abc/library/old.jpg" };
  const r = await verifyPortfolioUpload(fakeStore(Buffer.from("x"), uploads), TALENT, input, en);
  assert.deepEqual(r, { ok: true, input });
  assert.equal(uploads.length, 0);
});
