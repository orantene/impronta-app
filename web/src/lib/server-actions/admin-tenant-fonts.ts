"use server";

/**
 * admin-tenant-fonts.ts — upload / list / delete TENANT BRAND FONTS.
 *
 * Thin auth + orchestration wrappers, following `admin-branding-media.ts`:
 * the raw queries live in `lib/site-admin/server/tenant-fonts-store.ts`, the
 * pure metadata model in `lib/site-admin/builder-node/tenant-fonts.ts`.
 *
 * Uploads ride the SIGNED pipeline (mint URL → client PUT → register), same
 * as every other media surface. The register step is where the hard rules
 * run: it downloads the just-uploaded object (fonts are ≤ 2 MB) and proves
 * the BYTES are a genuine woff2/woff by magic bytes + sfnt flavor — never by
 * extension or client MIME. Anything that fails is deleted from storage
 * before it is ever referenced. Quota: 12 files per tenant, checked at mint
 * AND register. Files live in `media-public` under
 * `tenant/<id>/fonts/<uuid>.<ext>` (the reaper-protected tenant-assets
 * prefix) with a font content-type, so an upload can never be replayed as
 * HTML/JS from our origin; metadata lands in
 * `agency_branding.theme_json.custom_fonts`, the public-readable,
 * `branding`-tagged row the storefront head already reads.
 */

import { randomUUID } from "node:crypto";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import {
  readTenantFontFamilies,
  writeTenantFontFamilies,
} from "@/lib/site-admin/server/tenant-fonts-store";
import {
  TENANT_FONT_MAX_BYTES,
  TENANT_FONT_MAX_FILES,
  countTenantFontFiles,
  isTenantFontCategory,
  isValidTenantFontWeight,
  sanitizeTenantFontFamilyName,
  sniffTenantFontFormat,
  type TenantFontFamily,
} from "@/lib/site-admin/builder-node/tenant-fonts";

const BUCKET = "media-public";
const CAPABILITY = "agency.site_admin.branding.edit";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── List ────────────────────────────────────────────────────────────────

export async function actionListTenantFonts(): Promise<ActionResult<TenantFontFamily[]>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const { families } = await readTenantFontFamilies(admin, auth.tenantId);
  return { ok: true, data: families };
}

// ── Upload step 1: mint a signed URL ────────────────────────────────────

export async function actionCreateTenantFontUploadUrl(
  ext: string,
): Promise<{ ok: true; uploadUrl: string; storagePath: string } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };

  const cleanExt = ext.toLowerCase().replace(/^\./, "");
  if (cleanExt !== "woff2" && cleanExt !== "woff") {
    return { ok: false, error: "woff2 or woff only." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { families } = await readTenantFontFamilies(admin, auth.tenantId);
  if (countTenantFontFiles(families) >= TENANT_FONT_MAX_FILES) {
    return {
      ok: false,
      error: `A workspace can store up to ${TENANT_FONT_MAX_FILES} font files. Remove one first.`,
    };
  }

  const storagePath = `tenant/${auth.tenantId}/fonts/${randomUUID()}.${cleanExt}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    logServerError("tenant-fonts.sign", error);
    return { ok: false, error: "Could not start the upload. Try again." };
  }
  return { ok: true, uploadUrl: data.signedUrl, storagePath };
}

// ── Upload step 2: verify the BYTES, then register ──────────────────────

export async function actionRegisterTenantFont(input: {
  storagePath: string;
  family: string;
  category?: string;
  weight?: number;
  /** Set for a variable file: the face covers [weight, weightMax]. */
  weightMax?: number | null;
  style?: string;
}): Promise<ActionResult<TenantFontFamily[]>> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Path must be inside THIS tenant's font prefix — the caller cannot
  // register (or later delete) an object belonging to anyone else.
  const ownPrefix = `tenant/${auth.tenantId}/fonts/`;
  if (!input.storagePath.startsWith(ownPrefix) || input.storagePath.includes("..")) {
    return { ok: false, error: "Invalid upload path." };
  }

  const family = sanitizeTenantFontFamilyName(input.family);
  if (!family) {
    return { ok: false, error: "Give the font a family name (letters, digits, spaces)." };
  }
  const category = isTenantFontCategory(input.category) ? input.category : "sans";
  const style = input.style === "italic" ? "italic" : "normal";
  const weightMin = input.weight ?? 400;
  const weightMax = input.weightMax ?? null;
  if (
    !isValidTenantFontWeight(weightMin) ||
    (weightMax !== null && !isValidTenantFontWeight(weightMax))
  ) {
    return { ok: false, error: "Weight must be between 1 and 1000." };
  }
  const weight: number | [number, number] =
    weightMax !== null && weightMax > weightMin ? [weightMin, weightMax] : weightMin;

  const refuse = async (error: string): Promise<ActionResult<TenantFontFamily[]>> => {
    await admin.storage.from(BUCKET).remove([input.storagePath]);
    return { ok: false, error };
  };

  // The load-bearing check: download what actually landed in storage and
  // prove it is a woff2/woff wrapping a real sfnt flavor.
  const { data: blob, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(input.storagePath);
  if (downloadError || !blob) {
    logServerError("tenant-fonts.verify-download", downloadError);
    return { ok: false, error: "The uploaded file could not be verified. Try again." };
  }
  if (blob.size > TENANT_FONT_MAX_BYTES) {
    return refuse("Font files are capped at 2 MB. Use a woff2 subset.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const format = sniffTenantFontFormat(bytes);
  if (!format) {
    return refuse("That file is not a woff2 or woff font.");
  }
  const expectedExt = input.storagePath.slice(input.storagePath.lastIndexOf(".") + 1);
  if (format !== expectedExt) {
    return refuse("The file's format does not match its extension.");
  }

  const { families, theme } = await readTenantFontFamilies(admin, auth.tenantId);
  if (countTenantFontFiles(families) >= TENANT_FONT_MAX_FILES) {
    return refuse(
      `A workspace can store up to ${TENANT_FONT_MAX_FILES} font files. Remove one first.`,
    );
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(input.storagePath);
  const next = families.map((f) => ({ ...f, files: [...f.files] }));
  let entry = next.find((f) => f.family.toLowerCase() === family.toLowerCase());
  if (!entry) {
    entry = { family, category, files: [] };
    next.push(entry);
  }
  entry.files.push({
    path: input.storagePath,
    url: urlData.publicUrl,
    format,
    weight,
    style,
    bytes: blob.size,
  });

  if (!(await writeTenantFontFamilies(admin, auth.tenantId, theme, next))) {
    return refuse("Could not save the font metadata. Try again.");
  }

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "settings",
    action: "settings.brand_fonts.uploaded",
    summary: `Uploaded brand font ${family}`,
    targetType: "storage_object",
    targetId: input.storagePath,
    metadata: { family, format, weight, style },
  });

  return { ok: true, data: next };
}

// ── Delete ──────────────────────────────────────────────────────────────

export async function actionDeleteTenantFontFamily(
  family: string,
): Promise<ActionResult<TenantFontFamily[]>> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { families, theme } = await readTenantFontFamilies(admin, auth.tenantId);
  const target = families.find((f) => f.family.toLowerCase() === family.toLowerCase());
  if (!target) return { ok: false, error: "Font not found in this workspace." };

  // Every path is inside this tenant's own prefix by construction; assert it
  // anyway so a corrupted metadata row can never delete someone else's object.
  const ownPrefix = `tenant/${auth.tenantId}/fonts/`;
  const paths = target.files.map((f) => f.path).filter((p) => p.startsWith(ownPrefix));
  const next = families.filter((f) => f !== target);
  if (!(await writeTenantFontFamilies(admin, auth.tenantId, theme, next))) {
    return { ok: false, error: "Could not update the font list. Try again." };
  }
  if (paths.length > 0) {
    const { error } = await admin.storage.from(BUCKET).remove(paths);
    if (error) logServerError("tenant-fonts.delete", error);
  }

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "settings",
    action: "settings.brand_fonts.deleted",
    summary: `Removed brand font ${target.family}`,
    targetType: "storage_object",
    targetId: paths[0] ?? target.family,
    metadata: { family: target.family, files: paths.length },
  });

  return { ok: true, data: next };
}
