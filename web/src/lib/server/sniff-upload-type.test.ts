/**
 * TUL-1289: signed-upload finalize lanes (talent documents, reel video) must
 * not trust the client-declared mimetype. Magic bytes decide; a mismatch is refused.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sniffUploadType, verifyDeclaredAgainstBytes } from "./sniff-upload-type";

const ascii = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));
const PDF = ascii("%PDF-1.7\n");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...ascii("ftypisom"), 0, 0]);
const MOV = Uint8Array.from([0, 0, 0, 0x14, ...ascii("ftypqt  "), 0, 0]);
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]);
const EXE = ascii("MZ\x90\x00\x03");

test("sniffUploadType recognises the real format from the first bytes", () => {
  assert.equal(sniffUploadType(PDF), "application/pdf");
  assert.equal(sniffUploadType(PNG), "image/png");
  assert.equal(sniffUploadType(JPG), "image/jpeg");
  assert.equal(sniffUploadType(MP4), "video/mp4");
  assert.equal(sniffUploadType(MOV), "video/quicktime");
  assert.equal(sniffUploadType(WEBM), "video/webm");
  assert.equal(sniffUploadType(EXE), null);
});

test("a PDF declared as image/png is refused", () => {
  const r = verifyDeclaredAgainstBytes("image/png", PDF);
  assert.equal(r.ok, false);
});

test("an executable declared as application/pdf is refused", () => {
  assert.equal(verifyDeclaredAgainstBytes("application/pdf", EXE).ok, false);
});

test("a matching declaration passes and returns the sniffed type", () => {
  assert.deepEqual(verifyDeclaredAgainstBytes("application/pdf", PDF), { ok: true, mime: "application/pdf" });
  assert.deepEqual(verifyDeclaredAgainstBytes("video/mp4; codecs=avc1", MP4), { ok: true, mime: "video/mp4" });
});

test("a generic octet-stream declaration is accepted only when the bytes are a known type, and gets the real type", () => {
  assert.deepEqual(verifyDeclaredAgainstBytes("application/octet-stream", PDF), { ok: true, mime: "application/pdf" });
  assert.equal(verifyDeclaredAgainstBytes("application/octet-stream", EXE).ok, false);
});

test("a video lane refuses an image or document even when declared as video", () => {
  assert.equal(verifyDeclaredAgainstBytes("video/mp4", PNG, { family: "video" }).ok, false);
  assert.equal(verifyDeclaredAgainstBytes("video/mp4", MP4, { family: "video" }).ok, true);
});

test("the finalize lanes call the sniffer", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../../app/(workspace)/[tenantSlug]/admin/media/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /verifyStoredDocumentType|verifyDeclaredAgainstBytes/);
  assert.ok((src.match(/verifyStoredObjectType\(/g) ?? []).length >= 2, "document and reel finalize both verify");
});
