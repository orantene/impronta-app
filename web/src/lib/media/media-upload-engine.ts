/**
 * media-upload-engine — the staging model, the file-preparation rules and the
 * bounded worker pool that every media upload surface in the app should share.
 *
 * WHY THIS FILE EXISTS (media rebuild, seam 3)
 * ────────────────────────────────────────────
 * The Media page (`components/admin/shell/internal/media-page.tsx`) grew the
 * best upload code in the repo: a staging list with per-file status, a
 * concurrency-4 worker pool, zip extraction with a 100-image cap, SVG
 * pre-rejection with one honest message instead of N upload errors, and a
 * signed-then-legacy ladder that keeps a batch moving on browsers where the
 * canvas compression step is unavailable. Every OTHER surface that uploads
 * media re-implemented some subset of that, badly: the picker drawer uploads
 * strictly serially in a bare `for` loop, and BrandingMediaManager does the
 * same with a different status vocabulary.
 *
 * This module is the engine, extracted as PURE functions so the semantics that
 * were only ever verified by hand — pool never exceeds N in flight, one file's
 * failure does not abort its siblings, the batch promise resolves only after
 * the last worker — get real tests. `lib/media/use-media-upload.ts` is the thin
 * React shell over it; the transports stay in `lib/client/signed-upload*`.
 *
 * Nothing here touches React, the DOM, or the network, with one deliberate
 * exception: `prepareUploadFiles` reads Files and (for zips) needs JSZip. The
 * zip loader is INJECTED so a test can drive the extraction rules without
 * pulling a 400 KB dependency into the test process.
 */

/** Where an upload is in its lifecycle. Ordered by progression. */
export type MediaUploadStatus =
  | "queued"
  | "compressing"
  | "uploading"
  | "registering"
  | "ready"
  | "error";

/**
 * One file in a batch. `Extra` lets a surface carry its own per-item state in
 * the same list instead of a parallel map — the Media page uses it for the
 * per-photo `talentId` its assign modal edits while the upload is in flight.
 */
export type MediaUploadItem<Extra = Record<string, never>> = {
  /** Stable within a batch. Not a DB id — nothing is registered yet. */
  id: string;
  file: File;
  /** `URL.createObjectURL(file)` — the caller MUST revoke it (see `revokeAll`). */
  blobUrl: string;
  status: MediaUploadStatus;
  /** Bytes on the wire so far. Real, not a guess — see `putToSignedUrl`. */
  bytesSent: number;
  /** Post-compression total. Null until the uploading phase reports it. */
  bytesTotal: number | null;
  errorMsg?: string;
  /** Set on `ready`, per purpose. Staging lane. */
  storagePath?: string;
  publicUrl?: string;
  /** Opaque per-purpose payload the caller needs after a successful upload
   *  (staged meta, the CMS library row, the branding asset row). */
  registered?: unknown;
} & Extra;

/** Why a file (or a whole batch) was refused before any bytes moved. */
export type PrepareRejection =
  | { code: "svg_skipped"; count: number }
  | { code: "zip_too_large" }
  | { code: "zip_unreadable" }
  | { code: "zip_truncated"; cap: number }
  | { code: "batch_too_large"; max: number };

export type PrepareResult = {
  /** Files cleared to upload. Empty is a legitimate no-op, not an error. */
  files: File[];
  /** Everything the caller should surface. Order is stable. */
  rejections: PrepareRejection[];
  /** True when a rejection is fatal to the whole batch (nothing should run). */
  aborted: boolean;
};

/** Minimal slice of JSZip this module depends on. Injected, so tests can fake it. */
export type ZipLoader = (file: File) => Promise<{
  files: Record<string, { dir: boolean; async: (t: "blob") => Promise<Blob> }>;
}>;

export const ZIP_IMAGE_CAP = 100;
export const ZIP_MAX_BYTES = 500 * 1024 * 1024;
export const MAX_BATCH_FILES = 200;
export const DEFAULT_UPLOAD_CONCURRENCY = 4;

/** Raster formats we accept out of a zip. SVG deliberately excluded. */
const ZIP_IMAGE_EXTS = /\.(jpe?g|png|webp|gif|heic|avif)$/i;

export function isSvgFile(f: File): boolean {
  return f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
}

function isZipFile(f: File): boolean {
  return f.name.toLowerCase().endsWith(".zip");
}

/** True for a file the raster upload lanes will accept. SVG is refused here
 *  (the server refuses it too) so the user reads one clear message rather than
 *  one upload error per file. */
export function isAllowedRasterImage(f: File): boolean {
  return f.type.startsWith("image/") && !isSvgFile(f);
}

/**
 * Turn a raw drop / file-input selection into the list that should actually
 * upload, plus every reason something was held back.
 *
 * Rules, all lifted verbatim from the Media page:
 *  • SVG is refused up front, once, with a count.
 *  • A `.zip` over 500 MB aborts the batch (it will not fit anywhere).
 *  • Images are extracted from zips up to a 100-image cap per zip; going over
 *    the cap is reported but does NOT abort — the first 100 still upload.
 *  • An unreadable zip aborts (we cannot tell partial from empty).
 *  • Over 200 files total aborts.
 */
export async function prepareUploadFiles(
  input: File[] | FileList,
  opts: {
    /** Zip expansion is Media-page-only today; other surfaces pass false. */
    allowZip?: boolean;
    loadZip?: ZipLoader;
    maxBatch?: number;
  } = {},
): Promise<PrepareResult> {
  const allowZip = opts.allowZip ?? false;
  const maxBatch = opts.maxBatch ?? MAX_BATCH_FILES;
  const rawFiles = Array.from(input);
  const rejections: PrepareRejection[] = [];

  const zips = allowZip ? rawFiles.filter(isZipFile) : [];
  const nonZip = rawFiles.filter((f) => !isZipFile(f));

  const svgCount = nonZip.filter(isSvgFile).length;
  if (svgCount > 0) rejections.push({ code: "svg_skipped", count: svgCount });

  let files = nonZip.filter(isAllowedRasterImage);

  if (zips.length > 0) {
    const loadZip = opts.loadZip ?? defaultZipLoader;
    let anyTruncated = false;
    try {
      for (const zip of zips) {
        if (zip.size > ZIP_MAX_BYTES) {
          rejections.push({ code: "zip_too_large" });
          return { files: [], rejections, aborted: true };
        }
        const z = await loadZip(zip);
        const extracted: File[] = [];
        let totalEligible = 0;
        for (const [name, entry] of Object.entries(z.files)) {
          if (entry.dir || !ZIP_IMAGE_EXTS.test(name)) continue;
          totalEligible += 1;
          if (extracted.length >= ZIP_IMAGE_CAP) continue;
          const blob = await entry.async("blob");
          const mime = /\.png$/i.test(name)
            ? "image/png"
            : /\.webp$/i.test(name)
              ? "image/webp"
              : "image/jpeg";
          extracted.push(new File([blob], name.split("/").pop() ?? name, { type: mime }));
        }
        if (totalEligible > ZIP_IMAGE_CAP) anyTruncated = true;
        files = [...files, ...extracted];
      }
    } catch {
      rejections.push({ code: "zip_unreadable" });
      return { files: [], rejections, aborted: true };
    }
    if (anyTruncated) rejections.push({ code: "zip_truncated", cap: ZIP_IMAGE_CAP });
  }

  if (files.length > maxBatch) {
    rejections.push({ code: "batch_too_large", max: maxBatch });
    return { files: [], rejections, aborted: true };
  }

  return { files, rejections, aborted: false };
}

async function defaultZipLoader(file: File) {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(file) as unknown as ReturnType<ZipLoader>;
}

/** Build the staging list for a batch. Every item starts `queued` at 0 bytes. */
export function createUploadItems<Extra = Record<string, never>>(
  files: File[],
  makeExtra: (file: File, index: number) => Extra,
  makeId: (index: number) => string = defaultItemId,
  makeBlobUrl: (file: File) => string = (f) => URL.createObjectURL(f),
): Array<MediaUploadItem<Extra>> {
  return files.map((file, i) => ({
    id: makeId(i),
    file,
    blobUrl: makeBlobUrl(file),
    status: "queued" as const,
    bytesSent: 0,
    bytesTotal: null,
    ...makeExtra(file, i),
  }));
}

function defaultItemId(): string {
  return Math.random().toString(36).slice(2);
}

/** Immutable single-item patch. Returns the SAME array when the id is absent,
 *  so a stale worker's late update cannot force a pointless re-render. */
export function patchUploadItem<Extra>(
  items: Array<MediaUploadItem<Extra>>,
  id: string,
  patch: Partial<MediaUploadItem<Extra>>,
): Array<MediaUploadItem<Extra>> {
  let found = false;
  const next = items.map((it) => {
    if (it.id !== id) return it;
    found = true;
    return { ...it, ...patch };
  });
  return found ? next : items;
}

/** Counts the UI renders as a summary line. One pass, one place. */
export function summarizeUploadItems<Extra>(
  items: Array<MediaUploadItem<Extra>>,
): { total: number; inFlight: number; ready: number; errors: number } {
  let inFlight = 0;
  let ready = 0;
  let errors = 0;
  for (const it of items) {
    if (it.status === "ready") ready += 1;
    else if (it.status === "error") errors += 1;
    else inFlight += 1;
  }
  return { total: items.length, inFlight, ready, errors };
}

/**
 * Bounded worker pool. Runs `worker` over `items` with at most `concurrency`
 * in flight, resolves once every worker has settled.
 *
 * Semantics that are load-bearing and therefore tested:
 *  • Never more than `concurrency` concurrently, at any instant.
 *  • A rejecting worker does NOT abort the batch — its siblings still run and
 *    the returned promise still resolves. (A batch upload that stops at the
 *    first bad file is exactly the "I dropped 30 photos and got 4" report.)
 *  • Resolves only after the LAST worker settles, never early on an empty
 *    queue with workers still active.
 *  • Resolves immediately on an empty list.
 */
export function runUploadPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number = DEFAULT_UPLOAD_CONCURRENCY,
): Promise<void> {
  const limit = Math.max(1, Math.floor(concurrency));
  const queue = [...items];
  let active = 0;
  return new Promise<void>((resolve) => {
    const tryNext = () => {
      if (queue.length === 0 && active === 0) {
        resolve();
        return;
      }
      while (active < limit && queue.length > 0) {
        const item = queue.shift()!;
        active += 1;
        // `.finally` on a rejected promise still runs, and we never re-throw:
        // a worker is responsible for recording its own failure on the item.
        void worker(item)
          .catch(() => undefined)
          .finally(() => {
            active -= 1;
            tryNext();
          });
      }
    };
    tryNext();
  });
}

/** Free every object URL in a batch. Cheap, but forgetting it leaks the whole
 *  decoded bitmap for the tab's lifetime on a 200-photo drop. */
export function revokeUploadItemUrls<Extra>(
  items: Array<MediaUploadItem<Extra>>,
  revoke: (url: string) => void = (u) => URL.revokeObjectURL(u),
): void {
  for (const it of items) revoke(it.blobUrl);
}
