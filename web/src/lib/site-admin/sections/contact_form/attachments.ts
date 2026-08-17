/**
 * FORMS-3 — contact-form attachments: the pure policy module.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * Until now `schema.ts` documented the file field as "no binary upload on the
 * Supabase free tier; the submit route stores a URL/metadata record", and the
 * submit route kept only `File.name`. A visitor attached a portfolio PDF, the
 * form said "Thanks, we'll be in touch", and the bytes were dropped on the
 * floor. That is the bug this module exists to close.
 *
 * THE SECURITY SHAPE (read before changing anything here)
 * ───────────────────────────────────────────────────────
 * The contact form is a NATIVE server-rendered HTML POST from an anonymous
 * visitor. It already posts to our own `/api/cms/forms/submit`. So the bytes
 * ride the SAME request that carries the honeypot, the captcha token and the
 * section id — which means the server has the file in hand at the moment it
 * finishes the anti-abuse checks, and can write it to storage itself with the
 * service role.
 *
 * No signed upload URL is ever minted for an unauthenticated caller. The
 * visitor's browser never receives a bucket name, a storage path, a token, or
 * any other write capability. There is no new public endpoint. The rejected
 * alternative — mint a short-lived "proof of intent" token, then hand the
 * public client a signed upload URL — would have created exactly the thing
 * this codebase has never had and did not need: an anonymous storage write
 * capability reachable from a public URL.
 *
 * The cost of the single-request shape is the platform request-body ceiling
 * (Vercel serverless caps a request body at 4.5 MB), so the caps below are
 * deliberately small and are the honest, enforced numbers — not the 10 MB the
 * old schema comment implied.
 *
 * Everything in this file is PURE (no I/O, no Supabase) so the submit route
 * stays readable and the policy is unit-testable on its own.
 */

/**
 * Dedicated PRIVATE bucket. Deliberately NOT `media-public` and deliberately
 * NOT a `media_assets` row:
 *
 *   - `media_assets` is the tenant's LIBRARY. It is quota-counted
 *     (MEDIA_LIBRARY_MAX_ITEMS), it is what the media picker lists, and it
 *     carries ownership / approval / grant machinery that means nothing for a
 *     stranger's lead attachment. Keeping visitor files out of the picker
 *     would mean patching every library query, and one missed query puts an
 *     untrusted upload in front of the operator as if it were their own brand
 *     asset.
 *   - The storage reaper walks `MANAGED_BUCKETS = ["media-public",
 *     "media-originals"]` (see `lib/media/reap-orphaned-media-scan.ts`). A
 *     bucket outside that list is structurally invisible to it — the same
 *     reason `inquiry-files` is safe. `attachments.test.ts` asserts this
 *     bucket never joins MANAGED_BUCKETS, so a future edit there cannot
 *     quietly make live lead attachments reapable.
 */
export const CONTACT_ATTACHMENT_BUCKET = "form-attachments";

/** Per-file ceiling. Small on purpose — see the request-body note above. */
export const CONTACT_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;

/** Files accepted per submission, across all file fields. */
export const CONTACT_ATTACHMENT_MAX_COUNT = 3;

/** Combined bytes across all accepted files in one submission. */
export const CONTACT_ATTACHMENT_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * Whole-request ceiling, checked against `content-length` BEFORE the body is
 * parsed. Sits under Vercel's 4.5 MB (4_718_592) serverless body cap with room
 * for multipart boundaries and the text fields, so an oversized post is
 * refused by us with an honest message rather than by the platform with an
 * opaque 413.
 */
export const CONTACT_FORM_MAX_REQUEST_BYTES = 4_456_448; // 4.25 MB

/** Bytes of each file the sniffer needs. */
export const CONTACT_ATTACHMENT_SNIFF_BYTES = 16;

/**
 * The allow-list. PDF plus the four raster formats already trusted by
 * `IMAGE_MIME_TO_EXT` in `lib/site-admin/media/validation.ts`.
 *
 * Deliberately EXCLUDED, and why:
 *   - `image/svg+xml` — SVG is a script container. The media lane only serves
 *     an SVG after a strict sanitizer stamps it; nothing sanitizes here.
 *   - Office documents (doc/docx/xls/xlsx/ppt/pptx) and archives — the guest
 *     inquiry lane (PR #1165) accepts these, but that lane's uploader is bound
 *     to a guest_sessions row and the file is destined for a participant
 *     thread. This lane is fully anonymous, so the macro/archive surface is
 *     not worth the convenience. An operator who needs a spreadsheet can ask
 *     for it in the reply.
 *
 * `sniff` is checked against the file's real leading bytes. The multipart
 * part's declared content-type comes from the visitor's OS and is trivially
 * spoofed, so a declared MIME on the allow-list is necessary but not
 * sufficient — the bytes have to agree.
 */
interface AttachmentTypeRule {
  readonly mime: string;
  readonly ext: string;
  readonly label: string;
  readonly sniff: (head: Uint8Array) => boolean;
}

function startsWithAscii(head: Uint8Array, ascii: string, offset = 0): boolean {
  if (head.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (head[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function startsWithBytes(head: Uint8Array, bytes: readonly number[]): boolean {
  if (head.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (head[i] !== bytes[i]) return false;
  }
  return true;
}

export const CONTACT_ATTACHMENT_TYPES: readonly AttachmentTypeRule[] = [
  {
    mime: "application/pdf",
    ext: "pdf",
    label: "PDF",
    sniff: (head) => startsWithAscii(head, "%PDF-"),
  },
  {
    mime: "image/jpeg",
    ext: "jpg",
    label: "JPEG",
    sniff: (head) => startsWithBytes(head, [0xff, 0xd8, 0xff]),
  },
  {
    mime: "image/png",
    ext: "png",
    label: "PNG",
    sniff: (head) =>
      startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/webp",
    ext: "webp",
    label: "WebP",
    sniff: (head) =>
      startsWithAscii(head, "RIFF") && startsWithAscii(head, "WEBP", 8),
  },
  {
    mime: "image/gif",
    ext: "gif",
    label: "GIF",
    sniff: (head) =>
      startsWithAscii(head, "GIF87a") || startsWithAscii(head, "GIF89a"),
  },
];

/** `accept` attribute value for the rendered file input. */
export const CONTACT_ATTACHMENT_ACCEPT = CONTACT_ATTACHMENT_TYPES.map(
  (t) => t.mime,
).join(",");

/** Human list for the field hint, e.g. "PDF, JPEG, PNG, WebP, GIF". */
export const CONTACT_ATTACHMENT_TYPE_LABELS = CONTACT_ATTACHMENT_TYPES.map(
  (t) => t.label,
).join(", ");

/**
 * Visitor-facing failure codes. These travel back on the redirect as
 * `?__tulala_form_err=<code>` and are looked up in the message catalog by
 * `Component.tsx`, so the visitor reads a localized sentence instead of a raw
 * JSON body. Keep in sync with `public.forms.attachment.error.*` in
 * `messages/en.json` + `messages/es.json`.
 */
export type ContactAttachmentErrorCode =
  | "too_large"
  | "too_many"
  | "total_too_large"
  | "unsupported_type"
  | "not_accepted"
  | "required"
  | "store_failed";

export const CONTACT_ATTACHMENT_ERROR_CODES: readonly ContactAttachmentErrorCode[] =
  [
    "too_large",
    "too_many",
    "total_too_large",
    "unsupported_type",
    "not_accepted",
    "required",
    "store_failed",
  ];

export function isContactAttachmentErrorCode(
  value: unknown,
): value is ContactAttachmentErrorCode {
  return (
    typeof value === "string" &&
    (CONTACT_ATTACHMENT_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Effective per-file cap for a field. The operator can tighten below our
 * ceiling but never above it — the schema still permits `fileMaxSizeMb` up to
 * 10, a number this lane cannot honour, so we clamp rather than promise it.
 */
export function effectiveAttachmentMaxBytes(
  fileMaxSizeMb: number | undefined,
): number {
  const operatorBytes =
    typeof fileMaxSizeMb === "number" && Number.isFinite(fileMaxSizeMb)
      ? Math.round(fileMaxSizeMb * 1024 * 1024)
      : CONTACT_ATTACHMENT_MAX_BYTES;
  return Math.max(1, Math.min(operatorBytes, CONTACT_ATTACHMENT_MAX_BYTES));
}

/** MB figure to show the visitor, matching what the server will enforce. */
export function effectiveAttachmentMaxMb(
  fileMaxSizeMb: number | undefined,
): number {
  return (
    Math.round((effectiveAttachmentMaxBytes(fileMaxSizeMb) / 1024 / 1024) * 10) /
    10
  );
}

/**
 * Strip a visitor-supplied filename down to something safe to store in a text
 * column and echo back into an admin table. This value NEVER forms part of a
 * storage path — the path is built from generated ids and a sniffed extension
 * — so this is display hygiene, not a path-traversal defence.
 */
export function sanitizeAttachmentFilename(raw: string | null | undefined): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // Control characters, then anything that would break a table cell.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>"'`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200) || "attachment";
}

/** One candidate file, already read far enough to sniff. */
export interface ContactAttachmentCandidate {
  /** The form field this file arrived on. */
  readonly fieldName: string;
  readonly filename: string;
  readonly byteSize: number;
  /** Content-type the browser declared. Untrusted. */
  readonly declaredMime: string;
  /** First CONTACT_ATTACHMENT_SNIFF_BYTES bytes of the file. */
  readonly head: Uint8Array;
  /** Effective per-file cap for the field this arrived on. */
  readonly maxBytes: number;
}

/** An accepted file, with the server's own verdict on what it actually is. */
export interface ContactAttachmentAccepted {
  readonly fieldName: string;
  readonly filename: string;
  readonly byteSize: number;
  /** The SNIFFED type, never the declared one. */
  readonly mime: string;
  readonly ext: string;
}

export type ContactAttachmentValidation =
  | { readonly ok: true; readonly accepted: readonly ContactAttachmentAccepted[] }
  | { readonly ok: false; readonly code: ContactAttachmentErrorCode };

/**
 * The whole server-side gate, in one pure pass.
 *
 * Runs BEFORE anything is written: a rejected submission stores no object and
 * creates no row, so there is nothing to compensate for. (The route still
 * deletes on a later failure — see `storeContactAttachments` in the route —
 * mirroring PR #1165's register path, which removes the object whenever the
 * row it belongs to cannot be written.)
 */
export function validateContactAttachments(
  candidates: readonly ContactAttachmentCandidate[],
): ContactAttachmentValidation {
  if (candidates.length === 0) return { ok: true, accepted: [] };

  if (candidates.length > CONTACT_ATTACHMENT_MAX_COUNT) {
    return { ok: false, code: "too_many" };
  }

  const accepted: ContactAttachmentAccepted[] = [];
  let total = 0;

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.byteSize) || candidate.byteSize <= 0) {
      return { ok: false, code: "unsupported_type" };
    }
    if (candidate.byteSize > candidate.maxBytes) {
      return { ok: false, code: "too_large" };
    }

    const declared = candidate.declaredMime.toLowerCase().split(";")[0]?.trim() ?? "";
    const rule = CONTACT_ATTACHMENT_TYPES.find((t) => t.mime === declared);
    // Both must hold: an allow-listed declaration AND leading bytes that agree
    // with it. A .pdf renamed to .png, or a script declared as image/png, dies
    // on the second half.
    if (!rule || !rule.sniff(candidate.head)) {
      return { ok: false, code: "unsupported_type" };
    }

    total += candidate.byteSize;
    if (total > CONTACT_ATTACHMENT_MAX_TOTAL_BYTES) {
      return { ok: false, code: "total_too_large" };
    }

    accepted.push({
      fieldName: candidate.fieldName,
      filename: sanitizeAttachmentFilename(candidate.filename),
      byteSize: candidate.byteSize,
      mime: rule.mime,
      ext: rule.ext,
    });
  }

  return { ok: true, accepted };
}

/**
 * Cheap pre-parse refusal. `content-length` is attacker-controlled, so this is
 * a courtesy fast-path, not a security boundary — the real bound on how much
 * we will ever buffer is the platform's own body cap. It exists so an honest
 * visitor with a 20 MB PDF gets our localized "too large" message instead of a
 * platform error page.
 */
export function exceedsRequestBudget(contentLength: string | null): boolean {
  if (!contentLength) return false;
  const parsed = Number(contentLength);
  if (!Number.isFinite(parsed)) return false;
  return parsed > CONTACT_FORM_MAX_REQUEST_BYTES;
}

/**
 * Storage key for an accepted file. Built entirely from server-generated ids
 * plus the SNIFFED extension — no visitor-supplied string reaches the path.
 * The tenant id leads so the bucket's RLS policies can scope by prefix exactly
 * like `pitch-files` does.
 */
export function contactAttachmentStorageKey(input: {
  tenantId: string;
  submissionId: string;
  attachmentId: string;
  ext: string;
}): string {
  return `${input.tenantId}/${input.submissionId}/${input.attachmentId}.${input.ext}`;
}
