import "server-only";

/**
 * watermark-bake.ts — THE watermark baking pipeline. One copy.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The sharp compositing pipeline was written for `/api/media/bake-watermark`
 * (phase 5 of the 2026-05 watermark plan) and then sat there with no caller for
 * three months. Phase 4 of the media-ownership plan needs the SAME pipeline
 * from a server action (bake on release approval), and a second copy of
 * "where does the logo go, which bucket, what row shape" is exactly how two
 * readers end up disagreeing — the `is_publicly_listed` lesson.
 *
 * So the pipeline moved here unchanged and the route became a thin wrapper.
 * Positioning, sizing, opacity, output format, storage path convention and the
 * derivative row shape are all byte-identical to what the route did; only the
 * plumbing around them is new.
 *
 * WHAT A BAKE PRODUCES
 * ────────────────────
 * A second `media_assets` row: `variant_kind='watermarked'`,
 * `source_media_asset_id` pointing at the original, ownership INHERITED from
 * the source via `derivedOwnershipStamp` (re-cropping or stamping someone's
 * photo never transfers ownership, plan §5a). Storage lands in the PUBLIC
 * bucket at `{talentId}/wm/{uuid}.jpg` — the derivative is meant to be served.
 *
 * IDEMPOTENT: a second bake of the same asset overwrites the same object and
 * reuses the same row. Callers may retry freely.
 *
 * `requirePresetEnabled` is the one behavioural knob. The route keeps the old
 * "watermark not enabled for this asset" refusal, because there a human asked
 * for a preview of a feature they may not have turned on. The release path
 * passes `false`: staff ticking "require watermark" on an approval IS the
 * enable, and refusing there would silently approve an unwatermarked release.
 */

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isAllowedLogoUrl } from "@/lib/media/logo-url-allowlist";
import { derivedOwnershipStamp } from "@/lib/media/ownership";
import { logServerError } from "@/lib/server/safe-error";

/** px cap on the logo's long edge before compositing. */
const MAX_LOGO_SIZE = 512;

const PUBLIC_BUCKET = "media-public";
const ORIGINALS_BUCKET = "media-originals";


/**
 * The workspace watermark preset. Structurally identical to the Zod shape in
 * `admin-workspace-settings.ts`, redeclared here rather than imported: that
 * module is `"use server"`, and re-exporting a type across a server-action
 * boundary is a known runtime-500 in this repo (Builder Lab polish #616).
 */
export type WatermarkPreset = {
  enabled: boolean;
  position: string;
  size_pct: number;
  opacity: number;
  padding_pct: number;
  variant: string;
};

/**
 * Used when a release demands a watermark but the workspace never configured
 * one. Mirrors DEFAULT_WATERMARK_PRESET in
 * `admin-workspace-settings-constants.ts`, with `enabled` flipped true —
 * "required" is the enable.
 */
export const RELEASE_FALLBACK_PRESET: WatermarkPreset = {
  enabled: true,
  position: "br",
  size_pct: 12,
  opacity: 0.6,
  padding_pct: 4,
  variant: "light",
};

export type BakeWatermarkResult =
  | { ok: true; publicUrl: string; variantAssetId: string | null; reused: boolean }
  | { ok: false; error: string };

type SourceAssetRow = {
  id: string;
  storage_path: string;
  owner_talent_profile_id: string | null;
  watermark_override_json: unknown;
  ownership_kind: string | null;
  owner_tenant_id: string | null;
};

/**
 * Does this workspace have what a bake needs? Cheap pre-flight so an approval
 * can refuse with a fixable sentence instead of half-approving and failing in
 * the image pipeline.
 */
export async function loadWatermarkBakeReadiness(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ logoUrl: string | null; preset: WatermarkPreset | null; planTier: string | null }> {
  const { data } = await client
    .from("agencies")
    .select("settings, plan_tier")
    .eq("id", tenantId)
    .maybeSingle();

  const row = data as { settings: unknown; plan_tier: string | null } | null;
  const branding = (row?.settings as Record<string, unknown> | null)?.branding as
    | Record<string, unknown>
    | undefined;

  return {
    logoUrl: typeof branding?.logo_url === "string" ? branding.logo_url : null,
    preset: (branding?.watermark_preset as WatermarkPreset | undefined) ?? null,
    planTier: row?.plan_tier ?? null,
  };
}

/**
 * Bake (or re-bake) the watermarked derivative of one asset.
 *
 * Never throws: every failure comes back as `{ ok: false, error }` so a caller
 * baking 50 photos can report "3 could not be watermarked" instead of losing
 * the whole approval.
 */
export async function bakeWatermarkedVariant(
  client: SupabaseClient,
  input: {
    assetId: string;
    tenantId: string;
    actorUserId: string | null;
    /** Refuse when the resolved preset has `enabled: false`. Default true. */
    requirePresetEnabled?: boolean;
  },
): Promise<BakeWatermarkResult> {
  const { data: asset } = await client
    .from("media_assets")
    .select(
      "id, storage_path, owner_talent_profile_id, watermark_override_json, ownership_kind, owner_tenant_id",
    )
    .eq("id", input.assetId)
    .is("deleted_at", null)
    .maybeSingle();

  const source = asset as SourceAssetRow | null;
  if (!source?.storage_path) return { ok: false, error: "Asset not found." };

  const existing = await loadWatermarkedVariantRow(client, input.assetId);

  const { logoUrl, preset: workspacePreset } = await loadWatermarkBakeReadiness(
    client,
    input.tenantId,
  );
  if (!logoUrl) return { ok: false, error: "No workspace logo configured." };

  const override = source.watermark_override_json as WatermarkPreset | null | undefined;
  const requireEnabled = input.requirePresetEnabled !== false;
  const preset = override ?? workspacePreset ?? (requireEnabled ? null : RELEASE_FALLBACK_PRESET);

  if (!preset) return { ok: false, error: "Watermark not enabled for this asset." };
  if (requireEnabled && !preset.enabled) {
    return { ok: false, error: "Watermark not enabled for this asset." };
  }

  const sourceBytes = await downloadSource(client, source.storage_path);
  if (!sourceBytes) return { ok: false, error: "Could not load source image." };

  return composeAndStore(client, {
    source,
    logoUrl,
    preset: preset.enabled ? preset : { ...preset, enabled: true },
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    sourceBytes,
    existing,
  });
}

/** The baked derivative row for an original, if one has been made. */
export async function loadWatermarkedVariantRow(
  client: SupabaseClient,
  sourceAssetId: string,
): Promise<{ id: string; storage_path: string } | null> {
  const { data } = await client
    .from("media_assets")
    .select("id, storage_path")
    .eq("source_media_asset_id", sourceAssetId)
    .eq("variant_kind", "watermarked")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { id: string; storage_path: string } | null) ?? null;
}

// ─── internals ──────────────────────────────────────────────────────────────

/** Originals bucket first (best quality), public bucket as the fallback. */
async function downloadSource(
  client: SupabaseClient,
  storagePath: string,
): Promise<Buffer | null> {
  for (const bucket of [ORIGINALS_BUCKET, PUBLIC_BUCKET]) {
    const { data } = await client.storage.from(bucket).download(storagePath);
    if (data) return Buffer.from(await data.arrayBuffer());
  }
  return null;
}

function logoPosition(
  preset: WatermarkPreset,
  box: { imgW: number; imgH: number; logoW: number; logoH: number; pad: number },
): { top: number; left: number } {
  const { imgW, imgH, logoW, logoH, pad } = box;
  const midTop = Math.round((imgH - logoH) / 2);
  const midLeft = Math.round((imgW - logoW) / 2);
  const map: Record<string, { top: number; left: number }> = {
    tl: { top: pad, left: pad },
    tc: { top: pad, left: midLeft },
    tr: { top: pad, left: imgW - logoW - pad },
    ml: { top: midTop, left: pad },
    mc: { top: midTop, left: midLeft },
    mr: { top: midTop, left: imgW - logoW - pad },
    bl: { top: imgH - logoH - pad, left: pad },
    bc: { top: imgH - logoH - pad, left: midLeft },
    br: { top: imgH - logoH - pad, left: imgW - logoW - pad },
  };
  return map[preset.position] ?? map.br;
}

async function composeAndStore(
  client: SupabaseClient,
  args: {
    source: SourceAssetRow;
    logoUrl: string;
    preset: WatermarkPreset;
    tenantId: string;
    actorUserId: string | null;
    sourceBytes: Buffer;
    existing: { id: string; storage_path: string } | null;
  },
): Promise<BakeWatermarkResult> {
  const { source, logoUrl, preset, tenantId, actorUserId, sourceBytes, existing } = args;
  try {
    const srcImg = sharp(sourceBytes);
    const { width: imgW = 1920, height: imgH = 1080 } = await srcImg.metadata();

    // A7 — never dial a tenant-supplied URL unchecked. See isAllowedLogoUrl.
    if (!isAllowedLogoUrl(logoUrl)) {
      logServerError("watermark-bake.logoUrl", `refused non-allowlisted logo host: ${logoUrl}`);
      return { ok: false, error: "Workspace logo is not a valid uploaded image." };
    }
    const logoResp = await fetch(logoUrl, { redirect: "error" });
    if (!logoResp.ok) throw new Error("Failed to fetch logo");
    const logoBytes = Buffer.from(await logoResp.arrayBuffer());

    const shortEdge = Math.min(imgW, imgH);
    const logoTargetW = Math.round(shortEdge * (preset.size_pct / 100));
    const logoResized = await sharp(logoBytes)
      .resize({ width: Math.min(logoTargetW, MAX_LOGO_SIZE), withoutEnlargement: true })
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoResized).metadata();
    const logoW = logoMeta.width ?? logoTargetW;
    const logoH = logoMeta.height ?? logoTargetW;

    const pad = Math.round(shortEdge * (preset.padding_pct / 100));
    const { top, left } = logoPosition(preset, { imgW, imgH, logoW, logoH, pad });

    // Opacity rides the logo's alpha channel.
    const logoWithAlpha = await sharp(logoResized)
      .ensureAlpha()
      .linear(preset.opacity, 0)
      .toBuffer();

    const outputBytes = await srcImg
      .composite([{ input: logoWithAlpha, top, left, blend: "over" }])
      .jpeg({ quality: 90 })
      .toBuffer();

    const talentId = source.owner_talent_profile_id ?? tenantId;
    const wmPath = existing?.storage_path ?? `${talentId}/wm/${crypto.randomUUID()}.jpg`;

    const { error: uploadErr } = await client.storage
      .from(PUBLIC_BUCKET)
      .upload(wmPath, outputBytes, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw uploadErr;

    const publicUrl = client.storage.from(PUBLIC_BUCKET).getPublicUrl(wmPath).data.publicUrl;

    if (existing) {
      // Storage was overwritten in place; the row still points at it. Touch
      // updated_at so "when was this re-baked" is answerable.
      await client
        .from("media_assets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { ok: true, publicUrl, variantAssetId: existing.id, reused: true };
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insertErr } = await client
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        bucket_id: PUBLIC_BUCKET,
        storage_path: wmPath,
        owner_talent_profile_id: source.owner_talent_profile_id,
        // A baked watermark is a DERIVATIVE — it inherits the original's owner
        // (plan §5a). Stamping it to the baking workspace would let "add a
        // watermark" silently transfer someone else's photo.
        ...derivedOwnershipStamp(source, actorUserId),
        variant_kind: "watermarked",
        source_media_asset_id: source.id,
        approval_state: "approved",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();

    if (insertErr) throw insertErr;

    return {
      ok: true,
      publicUrl,
      variantAssetId: (inserted as { id: string } | null)?.id ?? null,
      reused: false,
    };
  } catch (err) {
    logServerError("watermark-bake.compose", err);
    return { ok: false, error: "Compositing failed." };
  }
}
