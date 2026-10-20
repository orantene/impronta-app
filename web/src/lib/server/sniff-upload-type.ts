/**
 * TUL-1289: decide an upload's real type from its first bytes, never from the
 * client-declared (or client-set Storage) mimetype.
 *
 * Used by the signed-upload finalize lanes in `admin/media/actions.ts`, where
 * the browser PUTs straight to Storage and the only "mimetype" the server has
 * is whatever the browser claimed.
 */

export const SNIFF_HEAD_BYTES = 64;

const startsWith = (b: Uint8Array, s: string, at = 0) =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const startsWithBytes = (b: Uint8Array, sig: number[]) =>
  b.length >= sig.length && sig.every((v, i) => b[i] === v);

/** Real type from magic bytes, or null when the bytes are not a known type. */
export function sniffUploadType(b: Uint8Array): string | null {
  if (startsWith(b, "%PDF-")) return "application/pdf";
  if (startsWithBytes(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, "GIF87a") || startsWith(b, "GIF89a")) return "image/gif";
  if (startsWith(b, "RIFF") && startsWith(b, "WEBP", 8)) return "image/webp";
  if (startsWith(b, "ftyp", 4)) {
    return startsWith(b, "qt", 8) ? "video/quicktime" : "video/mp4";
  }
  if (startsWithBytes(b, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (startsWithBytes(b, [0x50, 0x4b, 0x03, 0x04])) return "application/zip"; // docx/xlsx/pptx/zip
  if (startsWithBytes(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "application/x-ole"; // doc/xls
  return null;
}

const OFFICE_ZIP = /^application\/(zip|vnd\.openxmlformats-officedocument\..+)$/;
const OFFICE_OLE = /^application\/(msword|vnd\.ms-(excel|powerpoint)|x-ole)$/;

export type SniffVerdict = { ok: true; mime: string } | { ok: false; reason: string };

/**
 * `family: "video"` is the reel lane: only video bytes pass, whatever was declared.
 */
export function verifyDeclaredAgainstBytes(
  declared: string,
  head: Uint8Array,
  opts: { family?: "video" } = {},
): SniffVerdict {
  const decl = declared.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const real = sniffUploadType(head);

  if (opts.family === "video") {
    if (real?.startsWith("video/")) return { ok: true, mime: real };
    return { ok: false, reason: "File content is not a video." };
  }

  if (real === null) {
    // Unknown bytes: only plain text may be declared as such, and only if it has no NUL bytes.
    if (decl.startsWith("text/") && !head.includes(0)) return { ok: true, mime: decl };
    return { ok: false, reason: "File content does not match its type." };
  }
  if (decl === "application/octet-stream") return { ok: true, mime: real };
  if (real === decl) return { ok: true, mime: real };
  if (real === "application/zip" && OFFICE_ZIP.test(decl)) return { ok: true, mime: decl };
  if (real === "application/x-ole" && OFFICE_OLE.test(decl)) return { ok: true, mime: decl };
  return { ok: false, reason: "File content does not match its type." };
}

type SignedUrlClient = {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

/**
 * Fetch just the first bytes of a stored object (HTTP Range through a
 * 60-second signed URL), so a 200 MB reel is never pulled into the Function.
 * Returns null when the head cannot be read; callers treat that as a refusal.
 */
export async function fetchStoredObjectHead(
  admin: SignedUrlClient,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data) return null;
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${SNIFF_HEAD_BYTES - 1}` } });
    if (!res.ok) return null;
    return new Uint8Array((await res.arrayBuffer()).slice(0, SNIFF_HEAD_BYTES));
  } catch {
    return null;
  }
}
