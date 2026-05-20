/**
 * backfill-media-resize.ts — recompress existing media-public objects.
 *
 * Purpose: when sharp-on-upload (`web/src/lib/server/media-resize.ts`)
 * landed, only new uploads got the resize treatment. Files uploaded
 * before that shipped are still 5–15 MB camera originals living in the
 * public bucket, dominating Supabase egress on every directory paint.
 *
 * This script walks `media_assets` (image rows in `media-public`),
 * downloads each, runs the same sharp pipeline new uploads use, and —
 * when the result is smaller — overwrites the storage object in place
 * AND updates the matching DB row's `file_size_bytes` / `width` /
 * `height` / `mime_type`. Storage paths stay stable, so signed URLs and
 * existing cached references continue to resolve.
 *
 * Safety:
 *   - DRY-RUN by default. Pass `--apply` to write.
 *   - Caps a single run with `--limit N` (default 200). Re-run until done.
 *   - Skips rows already small (`file_size_bytes < 250_000`) — those
 *     were either small to begin with or already backfilled.
 *   - Skips non-images, soft-deleted rows, and `source_media_asset_id`
 *     crop-derivative rows (their parent already lives in storage).
 *   - Logs every action (path + before/after bytes) so you can see what
 *     happened and roll back manually if a single asset goes wrong.
 *
 * Run from `web/`:
 *   npx tsx scripts/backfill-media-resize.ts                  # dry-run
 *   npx tsx scripts/backfill-media-resize.ts --apply          # actually write
 *   npx tsx scripts/backfill-media-resize.ts --apply --limit 50   # smaller batch
 *
 * Re-run idempotently — every pass picks up the next N candidates.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}

const DRY = !process.argv.includes("--apply");
const LIMIT = (() => {
  const idx = process.argv.indexOf("--limit");
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 200;
})();

const svc = createClient(url, key, { auth: { persistSession: false } });

// Mirrors web/src/lib/server/media-resize.ts. Duplicated rather than
// imported because that file uses next/server. Keep in sync if you
// change the sizing strategy there.
const MAX_LONG_EDGE: Record<string, number> = {
  hero: 1400,
  card: 900,
  gallery: 1800,
  lightbox: 1800,
  polaroid: 800,
  banner: 1800,
  watermarked: 1800,
  public_watermarked: 1800,
};
const DEFAULT_LONG_EDGE = 1800;
const JPEG_QUALITY = 82;

// Skip rows already this size or smaller — assumed already-resized
// (or natively small). 250 KB is well above the resized output for a
// typical talent headshot (~80 KB JPEG q=82 at 900px), and well below
// the smallest camera original we've seen.
const ALREADY_SMALL_BYTES = 250 * 1024;

type AssetRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
};

type ResizeResult = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  byteSize: number;
};

async function resize(input: Buffer, variantKind: string | null): Promise<ResizeResult> {
  const longEdge = MAX_LONG_EDGE[variantKind ?? ""] ?? DEFAULT_LONG_EDGE;
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const hasAlpha = meta.hasAlpha === true;

  const base = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

  const pipeline = hasAlpha
    ? base.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true })
    : base.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:2:0" });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    mimeType: hasAlpha ? "image/png" : "image/jpeg",
    width: info.width,
    height: info.height,
    byteSize: info.size,
  };
}

function fmt(bytes: number | null): string {
  if (bytes == null) return "?";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function main(): Promise<void> {
  console.log(
    `[media-resize backfill] ${DRY ? "DRY-RUN — no writes. " : "APPLY mode. "}limit=${LIMIT}`,
  );
  console.log(`Pass --apply to write. Pass --limit N to change batch size.`);

  // Candidates: image rows in media-public that are still chunky, not
  // crop-derived, not soft-deleted. Ordered largest-first so we recover
  // the most bytes per call.
  const { data: rows, error } = await svc
    .from("media_assets")
    .select("id, bucket_id, storage_path, variant_kind, mime_type, file_size_bytes, width, height, source_media_asset_id, deleted_at")
    .eq("bucket_id", "media-public")
    .is("deleted_at", null)
    .is("source_media_asset_id", null)
    .or(`file_size_bytes.gt.${ALREADY_SMALL_BYTES},file_size_bytes.is.null`)
    .order("file_size_bytes", { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    console.error("[media-resize backfill] query failed:", error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []) as AssetRow[];
  console.log(`[media-resize backfill] ${candidates.length} candidate rows`);

  let processed = 0;
  let skippedNotImage = 0;
  let skippedAlreadySmall = 0;
  let skippedNoGain = 0;
  let written = 0;
  let failed = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const row of candidates) {
    const mime = (row.mime_type ?? "").toLowerCase();
    if (mime && !mime.startsWith("image/")) {
      skippedNotImage += 1;
      continue;
    }
    // SVG / animated GIF — skip per resize-helper policy.
    if (mime === "image/svg+xml" || mime === "image/gif") {
      skippedNotImage += 1;
      continue;
    }

    const before = row.file_size_bytes ?? 0;
    if (before > 0 && before < ALREADY_SMALL_BYTES) {
      skippedAlreadySmall += 1;
      continue;
    }

    // Download the current object. signedUrl avoids public-cache hits.
    const dl = await svc.storage.from("media-public").download(row.storage_path);
    if (dl.error || !dl.data) {
      console.warn(`[skip] ${row.storage_path} — download failed: ${dl.error?.message ?? "no data"}`);
      failed += 1;
      continue;
    }

    let inputBuffer: Buffer;
    try {
      const arr = await dl.data.arrayBuffer();
      inputBuffer = Buffer.from(arr);
    } catch (e) {
      console.warn(`[skip] ${row.storage_path} — buffer conversion failed: ${(e as Error).message}`);
      failed += 1;
      continue;
    }

    let resized: ResizeResult;
    try {
      resized = await resize(inputBuffer, row.variant_kind);
    } catch (e) {
      console.warn(`[skip] ${row.storage_path} — sharp failed: ${(e as Error).message}`);
      failed += 1;
      continue;
    }

    const after = resized.byteSize;
    totalBefore += inputBuffer.byteLength;
    totalAfter += after;

    if (after >= inputBuffer.byteLength * 0.95) {
      // Resize didn't help — within 5% of original. Skip the write so
      // we don't churn storage for nothing.
      skippedNoGain += 1;
      console.log(`[skip-no-gain] ${row.storage_path}  ${fmt(inputBuffer.byteLength)} → ${fmt(after)}`);
      continue;
    }

    console.log(
      `${DRY ? "[would-write]" : "[write]"} ${row.storage_path}  ${fmt(inputBuffer.byteLength)} → ${fmt(after)}  (${row.variant_kind ?? "?"} ${resized.width}×${resized.height})`,
    );

    if (!DRY) {
      // Overwrite at the same path; signed URLs stay valid.
      const up = await svc.storage.from("media-public").upload(row.storage_path, resized.buffer, {
        contentType: resized.mimeType,
        upsert: true,
      });
      if (up.error) {
        console.warn(`[fail] ${row.storage_path} — upload failed: ${up.error.message}`);
        failed += 1;
        continue;
      }

      const { error: updErr } = await svc
        .from("media_assets")
        .update({
          file_size_bytes: after,
          width: resized.width,
          height: resized.height,
          mime_type: resized.mimeType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updErr) {
        console.warn(`[fail-db] ${row.storage_path} — row update failed: ${updErr.message}`);
        failed += 1;
        continue;
      }

      written += 1;
    }
    processed += 1;
  }

  console.log(`\n[media-resize backfill] done.`);
  console.log(`  processed:           ${processed}`);
  console.log(`  written:             ${written}${DRY ? " (DRY)" : ""}`);
  console.log(`  skipped (not image): ${skippedNotImage}`);
  console.log(`  skipped (small):     ${skippedAlreadySmall}`);
  console.log(`  skipped (no gain):   ${skippedNoGain}`);
  console.log(`  failed:              ${failed}`);
  console.log(`  storage delta:       ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saved ${fmt(Math.max(0, totalBefore - totalAfter))})`);
  if (DRY) {
    console.log(`\n  (DRY-RUN — re-run with --apply to write.)`);
  } else if (candidates.length === LIMIT) {
    console.log(`\n  Hit the limit (${LIMIT}). Re-run to continue.`);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
