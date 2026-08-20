/**
 * import-stock-images.ts — put a folder of images into the shared Tulala Stock
 * library, where EVERY tenant can use them.
 *
 *   npx tsx scripts/import-stock-images.ts ~/Desktop/impronta-ai-images
 *   npx tsx scripts/import-stock-images.ts ~/Desktop/impronta-ai-images --apply
 *   npx tsx scripts/import-stock-images.ts <dir> --apply --category=editorial
 *
 * DRY RUN IS THE DEFAULT: it lists what it would upload, with dimensions, and
 * writes nothing.
 *
 * WHY A SCRIPT AND NOT AN UPLOAD BUTTON. Stock is curated by the platform, not
 * by tenants — see platform-stock.ts. A tenant must never be able to add to the
 * shelf everyone else reads from, so the write path lives here, behind the
 * service role, rather than in any UI a tenant can reach.
 *
 * ALT TEXT. Every image gets alt text from `<name>.txt` beside it if present,
 * otherwise from the filename. It is NOT invented: a stock image with a
 * confident description of a scene nobody has looked at is exactly the failure
 * the alt-text pass cleaned up across this site.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  PLATFORM_STOCK_TENANT_SLUG,
  STOCK_FOLDER,
  resolveStockTenantId,
} from "../src/lib/media/platform-stock";
import { ensureSystemFolder, fileAssetInSystemFolder } from "../src/lib/media/system-folders";

const BUCKET = "media-public";
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** Intrinsic size, read from the file header. Never guessed. */
export function readImageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: IHDR is always the first chunk.
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk the segments to the first SOF.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry the dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Alt text from a sidecar `.txt`, else a readable form of the filename. */
export function altTextFor(dir: string, file: string): string {
  const sidecar = join(dir, `${basename(file, extname(file))}.txt`);
  if (existsSync(sidecar)) {
    const text = readFileSync(sidecar, "utf8").trim();
    if (text) return text;
  }
  return basename(file, extname(file)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const { loadEnvLocal } = await import("./load-env-local.mjs");
  loadEnvLocal();

  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const category = args.find((a) => a.startsWith("--category="))?.split("=")[1] ?? null;

  if (!dir) {
    console.error("Usage: npx tsx scripts/import-stock-images.ts <dir> [--apply] [--category=name]");
    process.exit(1);
  }
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`Not a directory: ${root}`);
    process.exit(1);
  }

  const files = readdirSync(root)
    .filter((f) => EXTS.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.log(`No images in ${root} (looked for ${[...EXTS].join(", ")}).`);
    return;
  }

  if (!apply) console.log("DRY RUN — nothing will be uploaded.\n");
  console.log(`Source: ${root}`);
  console.log(`Images: ${files.length}${category ? `  category=${category}` : ""}\n`);

  const supabase = serviceClient();
  const tenantId = await resolveStockTenantId(supabase);
  if (!tenantId) {
    console.error(
      `No tenant with slug "${PLATFORM_STOCK_TENANT_SLUG}" — that tenant owns the shared library.`,
    );
    process.exit(1);
  }

  let uploaded = 0;
  for (const file of files) {
    const buf = readFileSync(join(root, file));
    const size = readImageSize(buf);
    const alt = altTextFor(root, file);
    const dims = size ? `${size.width}x${size.height}` : "?";
    console.log(`  ${file}  ${dims}  ${(buf.length / 1024).toFixed(0)}KB  "${alt.slice(0, 48)}"`);
    if (!apply) continue;

    const ext = extname(file).toLowerCase();
    const storagePath = `tenant/${tenantId}/stock/${randomUUID()}${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: CONTENT_TYPE[ext] ?? "application/octet-stream",
      upsert: false,
    });
    if (up.error) {
      console.error(`    upload failed: ${up.error.message}`);
      continue;
    }
    const { data: asset, error } = await supabase
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        ownership_kind: "agency",
        purpose: "cms",
        storage_path: storagePath,
        bucket_id: BUCKET,
        width: size?.width ?? null,
        height: size?.height ?? null,
        alt_text: alt,
        metadata: { source: "platform-stock-import", ...(category ? { stock_category: category } : {}) },
      } as never)
      .select("id")
      .single();
    if (error || !asset) {
      console.error(`    insert failed: ${error?.message}`);
      continue;
    }
    const filed = await fileAssetInSystemFolder(supabase, {
      tenantId,
      assetId: (asset as { id: string }).id,
      spec: STOCK_FOLDER,
      addedBy: null,
    });
    if (!filed) {
      // Unfiled means UNSHARED: platform-stock.ts reads the folder, not the
      // tenant. Say so rather than leaving a silent orphan on the shelf.
      console.error(`    uploaded but NOT filed into ${STOCK_FOLDER.name} — it will not appear as stock.`);
      continue;
    }
    uploaded += 1;
  }

  if (!apply) {
    await ensureSystemFolder(supabase, tenantId, STOCK_FOLDER, null).then(() => undefined);
    console.log(`\nRe-run with --apply to upload these ${files.length} image(s).`);
    return;
  }
  console.log(`\nImported ${uploaded}/${files.length} into "${STOCK_FOLDER.name}".`);
  console.log("Every tenant can now use them.");
}

const executedDirectly = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href
  : false;
if (executedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
