/**
 * FORMS-3 — contact-form attachment policy.
 *
 * Covers the two things that make an anonymous upload lane safe or unsafe:
 * the allow-list actually rejecting what it claims to reject (including a
 * lying content-type), and the caps being enforced on the server rather than
 * advertised in the UI.
 *
 * Also pins the two structural facts that the rest of the design leans on:
 * the bucket is outside the storage reaper's MANAGED_BUCKETS, and the message
 * catalog has a string for every error code the route can emit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONTACT_ATTACHMENT_ACCEPT,
  CONTACT_ATTACHMENT_BUCKET,
  CONTACT_ATTACHMENT_ERROR_CODES,
  CONTACT_ATTACHMENT_MAX_BYTES,
  CONTACT_ATTACHMENT_MAX_COUNT,
  CONTACT_ATTACHMENT_MAX_TOTAL_BYTES,
  CONTACT_FORM_MAX_REQUEST_BYTES,
  contactAttachmentStorageKey,
  effectiveAttachmentMaxBytes,
  effectiveAttachmentMaxMb,
  exceedsRequestBudget,
  isContactAttachmentErrorCode,
  sanitizeAttachmentFilename,
  validateContactAttachments,
  type ContactAttachmentCandidate,
} from "./attachments";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const GIF_HEAD = new Uint8Array([...Buffer.from("GIF89a", "ascii")]);
const WEBP_HEAD = new Uint8Array([
  ...Buffer.from("RIFF", "ascii"),
  0x00,
  0x00,
  0x00,
  0x00,
  ...Buffer.from("WEBP", "ascii"),
]);
/** A Windows executable. Nothing on the allow-list starts with "MZ". */
const EXE_HEAD = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
const SVG_HEAD = new Uint8Array([...Buffer.from("<svg xmlns=", "ascii")]);

function candidate(
  over: Partial<ContactAttachmentCandidate> = {},
): ContactAttachmentCandidate {
  return {
    fieldName: "portfolio",
    filename: "portfolio.pdf",
    byteSize: 1024,
    declaredMime: "application/pdf",
    head: PDF_HEAD,
    maxBytes: CONTACT_ATTACHMENT_MAX_BYTES,
    ...over,
  };
}

test("no files is a valid submission", () => {
  const result = validateContactAttachments([]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.accepted, []);
});

test("accepts every allow-listed type when the bytes agree", () => {
  const cases: Array<[string, Uint8Array, string]> = [
    ["application/pdf", PDF_HEAD, "pdf"],
    ["image/png", PNG_HEAD, "png"],
    ["image/jpeg", JPEG_HEAD, "jpg"],
    ["image/gif", GIF_HEAD, "gif"],
    ["image/webp", WEBP_HEAD, "webp"],
  ];
  for (const [mime, head, ext] of cases) {
    const result = validateContactAttachments([
      candidate({ declaredMime: mime, head }),
    ]);
    assert.equal(result.ok, true, `${mime} should be accepted`);
    assert.equal(result.ok && result.accepted[0]?.ext, ext);
    assert.equal(result.ok && result.accepted[0]?.mime, mime);
  }
});

test("a content-type the browser lied about is rejected on the bytes", () => {
  // The classic: an .exe (or anything else) renamed and declared image/png.
  // The declared MIME is on the allow-list; the magic bytes are not.
  const result = validateContactAttachments([
    candidate({ declaredMime: "image/png", head: EXE_HEAD, filename: "logo.png" }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "unsupported_type");
});

test("SVG is rejected even when declared honestly", () => {
  const result = validateContactAttachments([
    candidate({ declaredMime: "image/svg+xml", head: SVG_HEAD, filename: "a.svg" }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "unsupported_type");
});

test("office documents and archives are not on this anonymous lane", () => {
  for (const mime of [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "text/html",
    "application/octet-stream",
  ]) {
    const result = validateContactAttachments([
      candidate({ declaredMime: mime, head: PDF_HEAD }),
    ]);
    assert.equal(result.ok, false, `${mime} must be refused`);
    assert.equal(result.ok === false && result.code, "unsupported_type");
  }
});

test("a file over the per-file cap is rejected", () => {
  const result = validateContactAttachments([
    candidate({ byteSize: CONTACT_ATTACHMENT_MAX_BYTES + 1 }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "too_large");
});

test("a zero-byte file is not an attachment", () => {
  const result = validateContactAttachments([candidate({ byteSize: 0 })]);
  assert.equal(result.ok, false);
});

test("the per-submission count cap is enforced", () => {
  const many = Array.from({ length: CONTACT_ATTACHMENT_MAX_COUNT + 1 }, (_, i) =>
    candidate({ fieldName: `f${i}`, byteSize: 16 }),
  );
  const result = validateContactAttachments(many);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "too_many");
});

test("files under the per-file cap can still bust the total cap", () => {
  // Each is legal on its own; together they exceed the submission total.
  const each = CONTACT_ATTACHMENT_MAX_BYTES;
  assert.ok(each * 2 > CONTACT_ATTACHMENT_MAX_TOTAL_BYTES);
  const result = validateContactAttachments([
    candidate({ fieldName: "a", byteSize: each }),
    candidate({ fieldName: "b", byteSize: each }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "total_too_large");
});

test("the operator can tighten the per-file cap but never raise it", () => {
  assert.equal(effectiveAttachmentMaxBytes(1), 1024 * 1024);
  // The schema still permits 10; this lane cannot carry it.
  assert.equal(effectiveAttachmentMaxBytes(10), CONTACT_ATTACHMENT_MAX_BYTES);
  assert.equal(effectiveAttachmentMaxBytes(undefined), CONTACT_ATTACHMENT_MAX_BYTES);
  assert.equal(effectiveAttachmentMaxMb(10), 3);
  assert.equal(effectiveAttachmentMaxMb(1), 1);
});

test("a per-field cap tighter than the global one is honoured", () => {
  const result = validateContactAttachments([
    candidate({ byteSize: 2 * 1024 * 1024, maxBytes: effectiveAttachmentMaxBytes(1) }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "too_large");
});

test("the request budget stays under the platform body cap", () => {
  const VERCEL_BODY_CAP = 4.5 * 1024 * 1024;
  assert.ok(
    CONTACT_FORM_MAX_REQUEST_BYTES < VERCEL_BODY_CAP,
    "our ceiling must refuse before the platform does",
  );
  assert.ok(
    CONTACT_ATTACHMENT_MAX_TOTAL_BYTES <= CONTACT_FORM_MAX_REQUEST_BYTES,
    "a submission at the total-bytes cap must be able to fit in one request",
  );
  assert.equal(exceedsRequestBudget(null), false);
  assert.equal(exceedsRequestBudget("not-a-number"), false);
  assert.equal(exceedsRequestBudget(String(CONTACT_FORM_MAX_REQUEST_BYTES)), false);
  assert.equal(exceedsRequestBudget(String(CONTACT_FORM_MAX_REQUEST_BYTES + 1)), true);
});

test("filenames are sanitized for display and never trusted for the path", () => {
  assert.equal(sanitizeAttachmentFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeAttachmentFilename("C:\\Users\\me\\cv.pdf"), "cv.pdf");
  assert.equal(sanitizeAttachmentFilename('<script>x</script>.pdf'), "script.pdf");
  assert.equal(sanitizeAttachmentFilename(""), "attachment");
  assert.equal(sanitizeAttachmentFilename(null), "attachment");
  assert.ok(sanitizeAttachmentFilename("a".repeat(500)).length <= 200);

  // The storage key is built only from ids and the SNIFFED extension, so a
  // hostile filename cannot influence where the object lands.
  const key = contactAttachmentStorageKey({
    tenantId: "11111111-1111-1111-1111-111111111111",
    submissionId: "22222222-2222-2222-2222-222222222222",
    attachmentId: "33333333-3333-3333-3333-333333333333",
    ext: "pdf",
  });
  assert.equal(
    key,
    "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.pdf",
  );
  assert.ok(!key.includes(".."));
});

test("the rendered accept attribute matches the enforced allow-list", () => {
  assert.equal(
    CONTACT_ATTACHMENT_ACCEPT,
    "application/pdf,image/jpeg,image/png,image/webp,image/gif",
  );
  assert.ok(!CONTACT_ATTACHMENT_ACCEPT.includes("svg"));
});

test("error codes round-trip through the URL guard", () => {
  for (const code of CONTACT_ATTACHMENT_ERROR_CODES) {
    assert.equal(isContactAttachmentErrorCode(code), true);
  }
  assert.equal(isContactAttachmentErrorCode("../../etc"), false);
  assert.equal(isContactAttachmentErrorCode(""), false);
  assert.equal(isContactAttachmentErrorCode(undefined), false);
});

test("EN and ES both carry a string for every error code", () => {
  for (const locale of ["en", "es"]) {
    const catalog = JSON.parse(
      readFileSync(resolve(WEB_ROOT, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, never>;
    const attachment = (
      catalog as unknown as {
        public: { forms: { attachment?: Record<string, unknown> } };
      }
    ).public.forms.attachment;
    assert.ok(attachment, `${locale}.json is missing public.forms.attachment`);
    for (const key of ["typesLabel", "sizeLabel", "countLabel", "unavailable"]) {
      assert.equal(
        typeof attachment[key],
        "string",
        `${locale}.json missing public.forms.attachment.${key}`,
      );
    }
    const errors = attachment.error as Record<string, unknown>;
    for (const code of CONTACT_ATTACHMENT_ERROR_CODES) {
      assert.equal(
        typeof errors?.[code],
        "string",
        `${locale}.json missing public.forms.attachment.error.${code}`,
      );
    }
  }
});

test("the attachment bucket is outside the storage reaper's managed buckets", () => {
  // Load-bearing: no reaper covers `form-attachments`, which is exactly why a
  // live lead attachment cannot be deleted out from under its submission row.
  // If someone adds this bucket to MANAGED_BUCKETS, every attachment whose
  // path the reaper cannot account for in `media_assets` becomes reapable.
  const source = readFileSync(
    resolve(WEB_ROOT, "src", "lib", "media", "reap-orphaned-media.ts"),
    "utf8",
  );
  const match = /MANAGED_BUCKETS\s*=\s*\[([^\]]*)\]/.exec(source);
  assert.ok(match, "MANAGED_BUCKETS declaration not found in reap-orphaned-media.ts");
  assert.ok(
    !match[1]!.includes(CONTACT_ATTACHMENT_BUCKET),
    `${CONTACT_ATTACHMENT_BUCKET} must not be a reaper-managed bucket`,
  );
});

test("the migration and the code agree on the bucket and its allow-list", () => {
  const sql = readFileSync(
    resolve(
      WEB_ROOT,
      "..",
      "supabase",
      "migrations",
      "20260817063027_cms_form_submission_attachments.sql",
    ),
    "utf8",
  );
  assert.ok(sql.includes(`'${CONTACT_ATTACHMENT_BUCKET}'`));
  // Private bucket, and the storage-level size backstop matches the code cap.
  assert.ok(/FALSE,\s*\n\s*3145728/.test(sql), "bucket must be private with a 3 MB cap");
  assert.equal(3145728, CONTACT_ATTACHMENT_MAX_BYTES);
  assert.ok(!sql.includes("image/svg+xml"));
  // No anon/authenticated write path to the bucket or the table.
  assert.ok(!/FOR INSERT/i.test(sql));
});
