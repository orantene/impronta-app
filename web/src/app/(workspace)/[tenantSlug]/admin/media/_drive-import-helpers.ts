/**
 * Google Drive import helpers (pure, no directive). Moved verbatim from
 * `actions.ts` (they are not server actions and were never exported).
 */

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
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength < 1000) return null; // likely an error HTML page
  return { buffer, contentType };
}
