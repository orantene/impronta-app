"use server";

/**
 * admin-branding-media.ts — workspace BRAND media library actions.
 *
 * Powers the "Brand images" manager in Settings → Brand identity. Thin
 * auth + audit wrappers only — every query lives in
 * lib/site-admin/server/brand-library.ts (keeps this action file free of
 * raw .from() per the no-untenanted-from ratchet).
 *
 * Uploads ride the signed pipeline (client compress → signed PUT →
 * register) because Server Action bodies cap at 4 MB. Client orchestration:
 * lib/client/signed-upload.ts (uploadBrandingMedia).
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import {
  BRANDING_RASTER_EXTS,
  deleteBrandingAsset,
  listBrandingAssets,
  registerBrandingUpload,
  setBrandImageRole,
  type BrandingMediaAsset,
} from "@/lib/site-admin/server/brand-library";

export type { BrandAssetRole, BrandingMediaAsset } from "@/lib/site-admin/server/brand-library";

const BUCKET = "media-public";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── List ────────────────────────────────────────────────────────────────

export type ListBrandingMediaData = {
  assets: BrandingMediaAsset[];
  inUse: { logoUrl: string | null; faviconUrl: string | null };
};

export async function actionListBrandingMedia(): Promise<ActionResult<ListBrandingMediaData>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return listBrandingAssets(admin, auth.tenantId);
}

// ── Upload step 1: mint a signed URL ────────────────────────────────────

export async function actionCreateBrandingMediaUploadUrl(
  ext: string,
): Promise<{ ok: true; uploadUrl: string; storagePath: string } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const cleanExt = ext.toLowerCase().replace(/^\./, "");
  if (!BRANDING_RASTER_EXTS.has(cleanExt)) {
    return { ok: false, error: "PNG, JPEG or WebP only." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const storagePath = `tenant/${auth.tenantId}/branding/${randomUUID()}.${cleanExt}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    logServerError("branding-media.sign", error);
    return { ok: false, error: "Could not start upload. Try again." };
  }
  return { ok: true, uploadUrl: data.signedUrl, storagePath };
}

// ── Upload step 2: verify + register the media_assets row ───────────────

export async function actionRegisterBrandingMediaUpload(input: {
  storagePath: string;
  originalFilename?: string | null;
  /** Set when this upload is a crop of an existing asset (provenance + revert). */
  sourceMediaAssetId?: string | null;
}): Promise<ActionResult<BrandingMediaAsset>> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const result = await registerBrandingUpload(admin, {
    tenantId: auth.tenantId,
    userId: auth.user.id,
    storagePath: input.storagePath,
    originalFilename: input.originalFilename ?? null,
    sourceMediaAssetId: input.sourceMediaAssetId ?? null,
  });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "settings",
    action: "settings.brand_media.uploaded",
    summary: `Uploaded a brand image${input.originalFilename ? ` (${input.originalFilename})` : ""}`,
    targetType: "media_asset",
    targetId: result.data.id,
    metadata: { storagePath: input.storagePath },
  });

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return result;
}

// ── Assign an asset to a brand slot (wordmark / favicon) ────────────────

export async function actionSetBrandImageRole(
  assetId: string,
  role: "wordmark" | "favicon",
): Promise<ActionResult<{ publicUrl: string }>> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const result = await setBrandImageRole(admin, { tenantId: auth.tenantId, assetId, role });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "settings",
    action: "settings.brand_media.role_set",
    summary: role === "wordmark" ? "Set the workspace wordmark" : "Set the site favicon",
    targetType: "media_asset",
    targetId: assetId,
    metadata: { role },
  });

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return result;
}

// ── Delete (soft) with in-use guard ─────────────────────────────────────

export async function actionDeleteBrandingMediaAsset(
  assetId: string,
): Promise<ActionResult<null>> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const result = await deleteBrandingAsset(admin, { tenantId: auth.tenantId, assetId });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "settings",
    action: "settings.brand_media.deleted",
    summary: "Deleted a brand image",
    targetType: "media_asset",
    targetId: assetId,
  });

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}
