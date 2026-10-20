/**
 * Google Drive import helpers (pure, no directive). Moved verbatim from
 * `actions.ts` (they are not server actions and were never exported).
 */

import {
  PHOTO_RASTER_MIMES,
  SNIFF_HEAD_BYTES,
  guardImageBytes,
  readResponseCapped,
} from "@/lib/media/upload-guards";

/**
 * H1: a shared Drive file can be any size. Raw camera photos fit; anything
 * past this is refused while streaming, never buffered whole.
 */
export const DRIVE_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

export function parseDriveUrl(url: string): { kind: "file"; fileId: string } | { kind: "folder"; folderId: string } | null {
  try {
    const u = new URL(url.trim());
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) return { kind: "file", fileId: fileMatch[1]! };
    const folderMatch = u.pathname.match(/\/folders\/([^/?]+)/);
    if (folderMatch) return { kind: "folder", folderId: folderMatch[1]! };
    const id = u.searchParams.get("id");
    if (id) return { kind: "file", fileId: id };
    return null;
  } catch {
    return null;
  }
}

export async function downloadDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const url = `https://drive.usercontent.google.com/u/0/uc?id=${encodeURIComponent(fileId)}&export=download`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const read = await readResponseCapped(res, DRIVE_IMPORT_MAX_BYTES);
  if (!read.ok) return null;
  if (read.bytes.byteLength < 1000) return null; // likely an error HTML page
  // The header was Google's claim; the bytes decide (SVG and HTML refused).
  const sniffed = guardImageBytes(read.bytes.subarray(0, SNIFF_HEAD_BYTES), { allowed: PHOTO_RASTER_MIMES });
  if (!sniffed.ok) return null;
  const buffer = read.bytes.buffer.slice(
    read.bytes.byteOffset,
    read.bytes.byteOffset + read.bytes.byteLength,
  ) as ArrayBuffer;
  return { buffer, contentType: sniffed.mime };
}
