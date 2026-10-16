import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_ATTACH_MAX_BYTES,
  SUPPORT_NEW_TICKET_MAX_FILES,
  isAcceptableSupportAttachment,
  stageSupportAttachments,
  uploadStagedAttachments,
} from "./support-attachment-limits";

const png = (n = "a.png", size = 100) => ({ name: n, type: "image/png", size });

test("accepts allowed types within the size cap only", () => {
  assert.equal(isAcceptableSupportAttachment(png()), true);
  assert.equal(isAcceptableSupportAttachment(png("a", SUPPORT_ATTACH_MAX_BYTES + 1)), false);
  assert.equal(isAcceptableSupportAttachment({ name: "x.pdf", type: "application/pdf", size: 10 }), false);
  assert.equal(isAcceptableSupportAttachment(png("e", 0)), false);
});

test("staging rejects bad files and caps the count", () => {
  const bad = { name: "x.exe", type: "application/x-msdownload", size: 5 };
  const r = stageSupportAttachments([], [png("1"), bad, png("2"), png("3"), png("4")]);
  assert.equal(r.files.length, SUPPORT_NEW_TICKET_MAX_FILES);
  assert.equal(r.rejected, true);
  assert.equal(stageSupportAttachments([], [png()]).rejected, false);
});

test("uploads every staged file to the ticket and counts failures", async () => {
  const seen: string[] = [];
  const failed = await uploadStagedAttachments("t1", [png("1"), png("2"), png("3")], async (id, f) => {
    seen.push(`${id}:${f.name}`);
    if (f.name === "2") throw new Error("net");
    return f.name !== "3";
  });
  assert.deepEqual(seen, ["t1:1", "t1:2", "t1:3"]);
  assert.equal(failed, 2);
});
