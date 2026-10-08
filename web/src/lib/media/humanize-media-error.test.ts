import assert from "node:assert/strict";
import { test } from "node:test";
import {
  humanizeMediaError,
  isMediaUnreachableError,
  isOpaqueFilename,
  readMediaJson,
} from "./humanize-media-error";

const t = (k: string) => `T(${k})`;

test("developer parse errors become the plain sentence", () => {
  for (const raw of [
    "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
    "TypeError: Failed to fetch",
    "HTTP 404",
    "HTTP 404 not valid JSON",
  ]) {
    assert.equal(isMediaUnreachableError(raw), true, raw);
    assert.equal(humanizeMediaError(raw, t), "T(dashboard.mediaLibrary.unreachable)");
  }
});

test("a deliberate server message passes through", () => {
  assert.equal(humanizeMediaError("Storage limit reached", t), "Storage limit reached");
});

test("readMediaJson never throws a SyntaxError on an HTML body", async () => {
  await assert.rejects(
    readMediaJson(new Response("<!DOCTYPE html><html></html>", { status: 404 })),
    (e: Error) => !/SyntaxError/.test(String(e)) && isMediaUnreachableError(e.message),
  );
  assert.deepEqual(await readMediaJson(new Response('{"ok":true}')), { ok: true });
});

test("storage ids are not shown as file names", () => {
  assert.equal(isOpaqueFilename("5593b56e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp"), true);
  assert.equal(isOpaqueFilename("a1b2c3d4e5f60718293a4b5c6d.jpg"), true);
  assert.equal(isOpaqueFilename("hero-portrait.jpg"), false);
});
