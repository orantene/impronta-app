/**
 * platform-stock-admin.server.ts — the WRITE side of the lifestyle stock
 * library (platform admin only). Pairs with the read side in
 * platform-stock.ts. Every function here:
 *   - is gated by `isPlatformAdmin` (the caller passes the checked userId),
 *   - writes through the service role into the `tulala` stock tenant,
 *   - keeps every byte ≤ STOCK_MAX_BYTES (resizes with sharp, never rejects a
 *     photo for being too good),
 *   - records the manifest row (`platform_stock_images`) in the same call, so
 *     an asset without a manifest row cannot exist through this path.
 *
 * Retire is SOFT: `retired_at` hides the row from every shelf and from the
 * composer; the object and the `media_assets` row stay so a page that placed
 * the photo keeps rendering (the FK is ON DELETE RESTRICT on purpose).
 */

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { logServerError } from "@/lib/server/safe-error";

import { STOCK_FOLDER, resolveStockTenantId, type StockApproval, type StockProvenance, type StockRole } from "./platform-stock";
import { fileAssetInSystemFolder } from "./system-folders";

export const STOCK_MAX_BYTES = 300 * 1024;
export const STOCK_MAX_EDGE = 1600;
const BUCKET = "media-public";

export interface StockManifestInput {
  family: string;
  businessType: string | null;
  role: StockRole;
  source: "generated" | "licensed";
  licence: string;
  prompt?: string | null;
  supplier?: string | null;
  paletteHint?: string | null;
  altEs: string;
  altEn: string;
  sortOrder?: number;
  // ── Visual Asset Engine columns (03 §2); absent = the pre-engine defaults ──
  slot?: string | null;
  /** Default: `approved` for a licensed upload (a human chose it), `generated` for anything the engine made. */
  approval?: StockApproval;
  provenance?: StockProvenance;
  direction?: string | null;
  qaJson?: Record<string, unknown> | null;
  layerVersions?: Record<string, string> | null;
  tags?: Record<string, string>;
  originTenantId?: string | null;
  model?: string | null;
  modelSize?: string | null;
  modelQuality?: string | null;
  promptVersion?: string | null;
  measuredCostUsd?: number | null;
}

export type StockWriteResult = { ok: true; id: string; assetId: string; bytes: number } | { ok: false; error: string };

/** Re-encode to JPEG under the byte cap, stepping quality down, then size. */
export async function fitStockBytes(input: Buffer): Promise<{ bytes: Buffer; width: number; height: number }> {
  let img = sharp(input).rotate();
  const meta = await img.metadata();
  const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (edge > STOCK_MAX_EDGE) img = img.resize({ width: STOCK_MAX_EDGE, height: STOCK_MAX_EDGE, fit: "inside", withoutEnlargement: true });
  for (const quality of [82, 74, 66, 58, 50]) {
    const out = await img.clone().jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (out.data.length <= STOCK_MAX_BYTES) return { bytes: out.data, width: out.info.width, height: out.info.height };
  }
  const small = await img.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 50, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { bytes: small.data, width: small.info.width, height: small.info.height };
}

export async function storeStockImage(
  admin: SupabaseClient,
  input: { bytes: Buffer; manifest: StockManifestInput; createdBy: string | null },
): Promise<StockWriteResult> {
  try {
    const tenantId = await resolveStockTenantId(admin);
    if (!tenantId) return { ok: false, error: "The stock tenant (slug tulala) does not exist." };

    const fitted = await fitStockBytes(input.bytes);
    const storagePath = `tenant/${tenantId}/stock/${randomUUID()}.jpg`;

    // Row FIRST, object second: a failed insert then leaves nothing behind,
    // and a failed upload deletes the row it made. (The first seed run did
    // it the other way round and left 14 orphan objects in the bucket.)
    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        owner_tenant_id: tenantId,
        ownership_kind: "agency",
        purpose: "cms",
        storage_path: storagePath,
        bucket_id: BUCKET,
        width: fitted.width,
        height: fitted.height,
        file_size: fitted.bytes.length,
        file_size_bytes: fitted.bytes.length,
        mime: "image/jpeg",
        mime_type: "image/jpeg",
        alt: input.manifest.altEn,
        metadata: { source: "platform-stock", stock_category: input.manifest.family, stock_role: input.manifest.role, stock_business_type: input.manifest.businessType },
      } as never)
      .select("id")
      .single<{ id: string }>();
    if (assetError || !asset) return { ok: false, error: `Asset row failed: ${assetError?.message ?? "unknown"}` };

    const up = await admin.storage.from(BUCKET).upload(storagePath, fitted.bytes, { contentType: "image/jpeg", upsert: false });
    if (up.error) {
      await admin.from("media_assets").delete().eq("id", asset.id);
      return { ok: false, error: `Upload failed: ${up.error.message}` };
    }

    await fileAssetInSystemFolder(admin, { tenantId, assetId: asset.id, spec: STOCK_FOLDER, addedBy: input.createdBy });

    const { data: row, error: manifestError } = await admin
      .from("platform_stock_images")
      .insert({
        asset_id: asset.id,
        family: input.manifest.family,
        business_type: input.manifest.businessType,
        role: input.manifest.role,
        source: input.manifest.source,
        licence: input.manifest.licence,
        prompt: input.manifest.prompt ?? null,
        supplier: input.manifest.supplier ?? null,
        palette_hint: input.manifest.paletteHint ?? null,
        alt_es: input.manifest.altEs,
        alt_en: input.manifest.altEn,
        sort_order: input.manifest.sortOrder ?? 0,
        created_by: input.createdBy,
        slot: input.manifest.slot ?? (input.manifest.role === "gallery" ? null : input.manifest.role),
        approval: input.manifest.approval ?? (input.manifest.source === "licensed" ? "approved" : "generated"),
        provenance: input.manifest.provenance ?? input.manifest.source,
        direction: input.manifest.direction ?? null,
        qa_json: input.manifest.qaJson ?? null,
        layer_versions: input.manifest.layerVersions ?? null,
        tags: input.manifest.tags ?? {},
        origin_tenant_id: input.manifest.originTenantId ?? null,
        model: input.manifest.model ?? null,
        model_size: input.manifest.modelSize ?? null,
        model_quality: input.manifest.modelQuality ?? null,
        prompt_version: input.manifest.promptVersion ?? null,
        generated_at: input.manifest.source === "generated" ? new Date().toISOString() : null,
        measured_cost_usd: input.manifest.measuredCostUsd ?? null,
      } as never)
      .select("id")
      .single<{ id: string }>();
    if (manifestError || !row) return { ok: false, error: `Manifest row failed: ${manifestError?.message ?? "unknown"}` };

    return { ok: true, id: row.id, assetId: asset.id, bytes: fitted.bytes.length };
  } catch (error) {
    logServerError("platform-stock.store", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not store the image." };
  }
}

export async function setStockRetired(admin: SupabaseClient, id: string, retired: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("platform_stock_images")
    .update({ retired_at: retired ? new Date().toISOString() : null } as never)
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateStockManifest(
  admin: SupabaseClient,
  id: string,
  patch: Partial<Pick<StockManifestInput, "businessType" | "role" | "licence" | "prompt" | "supplier" | "paletteHint" | "altEs" | "altEn" | "sortOrder">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {};
  if (patch.businessType !== undefined) row.business_type = patch.businessType;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.licence !== undefined) row.licence = patch.licence;
  if (patch.prompt !== undefined) row.prompt = patch.prompt;
  if (patch.supplier !== undefined) row.supplier = patch.supplier;
  if (patch.paletteHint !== undefined) row.palette_hint = patch.paletteHint;
  if (patch.altEs !== undefined) row.alt_es = patch.altEs;
  if (patch.altEn !== undefined) row.alt_en = patch.altEn;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (Object.keys(row).length === 0) return { ok: true };
  const { error } = await admin.from("platform_stock_images").update(row as never).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
