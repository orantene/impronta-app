import { test } from "node:test";
import assert from "node:assert/strict";

import { diagnoseEmptyDriveFolder } from "./drive-folder-diagnosis";

/**
 * The whole point of this module is that "the image query returned nothing" has
 * several different causes and the product used to blame the wrong one. So the
 * tests pin the CAUSE (reason tag) per Drive response shape, not the wording.
 *
 * The critical case is `not_shared`: Drive answers an anonymous caller with
 * HTTP 200 + empty list for an unshared folder, which is exactly why the old
 * `!res.ok` check could never catch it. Here the metadata probe is what
 * separates it, so that case is asserted from a 404 metadata response.
 */

const FOLDER = "application/vnd.google-apps.folder";
const KEY = "test-key";

/** Build a fetch stub: first call = metadata probe, second = children list. */
function stubFetch(
  responses: Array<{ ok: boolean; status?: number; body?: unknown } | "throw">,
): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const spec = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (spec === "throw") throw new Error("network down");
    return {
      ok: spec.ok,
      status: spec.status ?? (spec.ok ? 200 : 404),
      json: async () => spec.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("unshared folder is reported as a sharing problem, not an empty folder", async () => {
  // Drive 404s rather than 403s to hide the existence of unshared items.
  const { impl } = stubFetch([{ ok: false, status: 404 }]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "not_shared");
  assert.match(d.message, /Anyone with the link/);
  // Must NOT tell the operator their folder is empty.
  assert.doesNotMatch(d.message, /nothing inside|no images/i);
});

test("403 on the metadata probe is also a sharing problem", async () => {
  const { impl } = stubFetch([{ ok: false, status: 403 }]);
  assert.equal((await diagnoseEmptyDriveFolder("fid", KEY, impl)).reason, "not_shared");
});

test("a file link (not a folder) is called out as such", async () => {
  const { impl } = stubFetch([{ ok: true, body: { id: "f", mimeType: "image/jpeg" } }]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "not_a_folder");
});

test("readable but genuinely empty folder says so", async () => {
  const { impl } = stubFetch([
    { ok: true, body: { id: "f", mimeType: FOLDER } },
    { ok: true, body: { files: [] } },
  ]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "empty_folder");
});

test("photos one level down are reported as subfolders, with names", async () => {
  const { impl } = stubFetch([
    { ok: true, body: { id: "f", mimeType: FOLDER } },
    {
      ok: true,
      body: {
        files: [
          { id: "a", name: "Veleria", mimeType: FOLDER },
          { id: "b", name: "Mayra", mimeType: FOLDER },
        ],
      },
    },
  ]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "images_in_subfolders");
  assert.match(d.message, /2 subfolder/);
  assert.match(d.message, /Veleria/);
});

test("files present but none are images names the types found", async () => {
  const { impl } = stubFetch([
    { ok: true, body: { id: "f", mimeType: FOLDER } },
    {
      ok: true,
      body: {
        files: [
          { id: "a", name: "raw1.CR2", mimeType: "application/octet-stream" },
          { id: "b", name: "notes.pdf", mimeType: "application/pdf" },
        ],
      },
    },
  ]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "no_image_files");
  assert.match(d.message, /application\/octet-stream/);
});

test("network failure degrades to an unreachable message, never throws", async () => {
  const { impl } = stubFetch(["throw"]);
  const d = await diagnoseEmptyDriveFolder("fid", KEY, impl);
  assert.equal(d.reason, "unreachable");
});

test("the api key is never interpolated raw into the URL", async () => {
  const { impl, calls } = stubFetch([{ ok: false, status: 404 }]);
  await diagnoseEmptyDriveFolder("fid", "a key/with?chars", impl);
  assert.ok(calls[0].includes(encodeURIComponent("a key/with?chars")));
});
