// /api/media/bake-watermark — server-side logo compositing via sharp
//
// POST { mediaAssetId: string }
//
// Resolution order:
//   1. Check for existing baked variant (source_media_asset_id = this asset)
//   2. Load source from media-originals bucket (fallback: media-public)
//   3. Load agency logo from agencies.settings.branding.logo_url
//   4. Resolve watermark preset: per-image override → workspace default
//   5. Composite with sharp
//   6. Upload to media-public/{talent_id}/wm/{uuid}.jpg
//   7. Insert new media_assets row (variant_kind='watermarked', source_media_asset_id)
//   8. Return { ok: true, publicUrl }
//
// Designed for on-demand baking triggered by export flows.
// Not suitable for bulk use — call p-limit upstream for batches.

import { logServerError } from "@/lib/server/safe-error";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";

const MAX_LOGO_SIZE = 512; // px — cap logo dimension before compositing

export async function POST(req: NextRequest) {
  // Auth check
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const { supabase, tenantId } = auth;

  let mediaAssetId: string;
  try {
    const body = await req.json() as { mediaAssetId?: unknown };
    if (typeof body.mediaAssetId !== "string") throw new Error("bad input");
    mediaAssetId = body.mediaAssetId;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  // ─── 1. Load asset record ────────────────────────────────────────────────
  const { data: asset, error: assetErr } = await supabase
    .from("media_assets")
    .select("id, storage_path, bucket_id, owner_talent_profile_id, watermark_override_json, variant_kind")
    .eq("id", mediaAssetId)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ ok: false, error: "Asset not found." }, { status: 404 });
  }

  // ─── 2. Check for existing baked variant ────────────────────────────────
  const { data: existing } = await supabase
    .from("media_assets")
    .select("id, storage_path")
    .eq("source_media_asset_id", mediaAssetId)
    .eq("variant_kind", "watermarked")
    .is("deleted_at", null)
    .maybeSingle();

  // ─── 3. Load workspace branding + watermark preset ──────────────────────
  const { data: agency } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const branding = (agency?.settings as Record<string, unknown> | null)?.branding as Record<string, unknown> | undefined;
  const logoUrl = typeof branding?.logo_url === "string" ? branding.logo_url : null;

  if (!logoUrl) {
    return NextResponse.json({ ok: false, error: "No agency logo configured." }, { status: 400 });
  }

  type Preset = {
    enabled: boolean; position: string; size_pct: number;
    opacity: number; padding_pct: number; variant: string;
  };
  const workspacePreset = branding?.watermark_preset as Preset | undefined;
  const overridePreset  = asset.watermark_override_json as Preset | null | undefined;
  const preset: Preset | undefined = overridePreset ?? workspacePreset;

  if (!preset?.enabled) {
    return NextResponse.json({ ok: false, error: "Watermark not enabled for this asset." }, { status: 400 });
  }

  // ─── 4. Download source image ────────────────────────────────────────────
  const srcBucket = "media-originals";
  const { data: srcBlob, error: srcErr } = await supabase.storage
    .from(srcBucket)
    .download(asset.storage_path);

  if (srcErr || !srcBlob) {
    // Fallback to media-public
    const { data: fallbackBlob, error: fallbackErr } = await supabase.storage
      .from("media-public")
      .download(asset.storage_path);
    if (fallbackErr || !fallbackBlob) {
      return NextResponse.json({ ok: false, error: "Could not load source image." }, { status: 500 });
    }
    // Use fallback
    const result = await composeAndStore({
      supabase, asset, logoUrl, preset, tenantId,
      sourceBytes: Buffer.from(await fallbackBlob.arrayBuffer()),
      existingPath: existing?.storage_path,
    });
    return NextResponse.json(result);
  }

  const result = await composeAndStore({
    supabase, asset, logoUrl, preset, tenantId,
    sourceBytes: Buffer.from(await srcBlob.arrayBuffer()),
    existingPath: existing?.storage_path,
  });
  return NextResponse.json(result);
}

// ─── Composite helper ────────────────────────────────────────────────────────

async function composeAndStore({
  supabase, asset, logoUrl, preset, tenantId, sourceBytes, existingPath,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asset: any;
  logoUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preset: any;
  tenantId: string;
  sourceBytes: Buffer;
  existingPath?: string;
}): Promise<{ ok: boolean; publicUrl?: string; error?: string }> {
  try {
    const srcImg = sharp(sourceBytes);
    const { width: imgW = 1920, height: imgH = 1080 } = await srcImg.metadata();

    // Download and resize logo
    const logoResp = await fetch(logoUrl);
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

    // Resolve top-left pixel position from position key
    const pad = Math.round(shortEdge * (preset.padding_pct / 100));
    const posMap: Record<string, { top: number; left: number }> = {
      tl: { top: pad,                       left: pad },
      tc: { top: pad,                       left: Math.round((imgW - logoW) / 2) },
      tr: { top: pad,                       left: imgW - logoW - pad },
      ml: { top: Math.round((imgH - logoH) / 2), left: pad },
      mc: { top: Math.round((imgH - logoH) / 2), left: Math.round((imgW - logoW) / 2) },
      mr: { top: Math.round((imgH - logoH) / 2), left: imgW - logoW - pad },
      bl: { top: imgH - logoH - pad,        left: pad },
      bc: { top: imgH - logoH - pad,        left: Math.round((imgW - logoW) / 2) },
      br: { top: imgH - logoH - pad,        left: imgW - logoW - pad },
    };
    const { top, left } = posMap[preset.position] ?? posMap.br;

    // Blend opacity into logo alpha channel
    const logoWithAlpha = await sharp(logoResized)
      .ensureAlpha()
      .linear(preset.opacity, 0) // scale all channels including alpha
      .toBuffer();

    const outputBytes = await srcImg
      .composite([{ input: logoWithAlpha, top, left, blend: "over" }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // ── Upload ──
    const talentId = asset.owner_talent_profile_id ?? tenantId;
    const wmPath = existingPath ?? `${talentId}/wm/${crypto.randomUUID()}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from("media-public")
      .upload(wmPath, outputBytes, { contentType: "image/jpeg", upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from("media-public").getPublicUrl(wmPath);
    const publicUrl: string = urlData.publicUrl;

    // ── Upsert media_assets row ──
    if (existingPath) {
      // Already exists — just updated in storage, no new row needed
    } else {
      await supabase.from("media_assets").insert({
        bucket_id: "media-public",
        storage_path: wmPath,
        owner_talent_profile_id: asset.owner_talent_profile_id,
        variant_kind: "watermarked",
        source_media_asset_id: asset.id,
        approval_state: "approved",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return { ok: true, publicUrl };
  } catch (err) {
    logServerError("bake_watermark", err);
    return { ok: false, error: "Compositing failed." };
  }
}
