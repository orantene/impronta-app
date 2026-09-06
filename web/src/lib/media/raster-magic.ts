/**
 * raster-magic.ts — do these bytes actually start like the image they claim?
 *
 * A DEPENDENCY-FREE LEAF, on purpose. The canonical copy of this check lives in
 * `site-admin/server/brand-library.ts`, which is `server-only` and imports the
 * `@/lib/site-admin` barrel — pulling that into a node test drags in components
 * and their CSS, and the test dies parsing a stylesheet as JavaScript. A check
 * this small should not be reachable only through the app.
 *
 * KNOWN DUPLICATION, recorded rather than quietly added to: the same logic
 * already exists in three places —
 *   • site-admin/server/brand-library.ts (exported)
 *   • server-actions/admin-agency-logo-upload.ts (private)
 *   • talent-site/server/site-logo-actions.ts (private)
 * This is the fourth, and the only one importable from anywhere. Converging
 * the other three onto it is worth doing, but it touches three upload paths
 * and belongs in its own change, not smuggled into a menu importer.
 *
 * WHY IT MATTERS AT ALL: a `Content-Type` header is a claim made by whoever is
 * serving the file. Storing bytes on that word alone is how a text/html error
 * page becomes a "photo", and how a file named .png ends up being something
 * else entirely.
 */

/** Extensions whose signatures this module knows. */
export type RasterExt = "png" | "jpg" | "webp";

/**
 * True when `head` begins with the signature for `ext`.
 *
 * Pass at least the first 12 bytes; anything shorter simply fails, which is the
 * safe direction — an unrecognised prefix must never read as a match.
 */
export function matchesRasterMagic(head: Uint8Array, ext: string): boolean {
  if (ext === "png") {
    // \x89 P N G
    return (
      head.length >= 8 &&
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    );
  }
  if (ext === "jpg") {
    // SOI marker, then the first segment's leading FF.
    return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (ext === "webp") {
    // "RIFF" .... "WEBP" — the middle four bytes are the file length, so the
    // format check has to skip them rather than read a contiguous run.
    return (
      head.length >= 12 &&
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}
