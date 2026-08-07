"use server";

/**
 * Agency logo upload — signed pipeline (Wave 5.1, page-builder 8/10 program).
 *
 * The previous implementation was a raw-FormData server action: the whole
 * file rode through the Server Action body (4 MB cap / ~4.5 MB on Vercel, so
 * its advertised 10 MB limit was unreachable) and `image/svg+xml` bytes were
 * stored into the public bucket with no sanitization (stored XSS when the
 * public URL is opened directly).
 *
 * New shape, matching the photo pipeline (#981/#985/#986/#989 +
 * /api/admin/media/upload/init|register):
 *   raster:  client compresses -> actionCreateAgencyLogoUploadUrl mints a
 *            one-shot signed URL -> browser PUTs direct to storage ->
 *            actionFinalizeAgencyLogo verifies the object (path prefix,
 *            size, magic bytes) and persists the settings pointers.
 *   svg:     actionUploadAgencyLogoSvg takes the SVG *text* (small, well
 *            under any body cap), runs it through the same strict allowlist
 *            sanitizer the brand-mark field uses (sanitizeBrandMarkSvg), and
 *            only stores what the sanitizer accepted. Unsafe SVGs are
 *            rejected with the reasons, never stored.
 *
 * Client orchestration lives in lib/client/signed-upload.ts
 * (uploadAgencyLogo).
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { sanitizeSvgLogoBuffer } from "@/lib/site-admin/sanitize-svg-upload";

const BUCKET = "media-public";
const LOGO_PREFIX = "agency-logos";
/** Raster cap — post-compression bytes; mirrors MEDIA_IMAGE_MAX_BYTES. */
const MAX_RASTER_BYTES = 8 * 1024 * 1024;

const RASTER_EXTS = new Set(["png", "jpg", "webp"]);

export type AgencyLogoUploadResult =
  | { ok: true; logoUrl: string }
  | { ok: false; error: string };

export type AgencyLogoSignedUrlResult =
  | { ok: true; uploadUrl: string; storagePath: string }
  | { ok: false; error: string };

// ── Step 1 (raster): mint a one-shot signed upload URL ──────────────────

export async function actionCreateAgencyLogoUploadUrl(
  ext: string,
): Promise<AgencyLogoSignedUrlResult> {
  // The signed URL bakes `auth.tenantId` into the storage path, so this must
  // resolve the workspace being administered, not the operator's preferred
  // tenant — otherwise the object is minted under the wrong tenant's prefix.
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const cleanExt = ext.toLowerCase().replace(/^\./, "");
  if (!RASTER_EXTS.has(cleanExt)) {
    return { ok: false, error: "PNG, JPEG or WebP only for this path." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // UUID in path busts CDN cache on re-upload (same as the old action).
  const storagePath = `${LOGO_PREFIX}/${auth.tenantId}/${randomUUID()}.${cleanExt}`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    logServerError("admin-agency-logo-upload.sign", error);
    return { ok: false, error: "Could not start upload. Try again." };
  }

  return { ok: true, uploadUrl: data.signedUrl, storagePath };
}

// ── Step 2 (raster): verify the PUT object + persist pointers ───────────

export async function actionFinalizeAgencyLogo(
  storagePath: string,
): Promise<AgencyLogoUploadResult> {
  // Branding surface — graded above the workspace baseline to the
  // membership-role capability the Phase-5 matrix assigns it (admin/owner).
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Path-shape guard — refuse anything outside this tenant's logo prefix.
  const expectedPrefix = `${LOGO_PREFIX}/${tenantId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
    return { ok: false, error: "Storage path doesn't match this workspace." };
  }
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (!RASTER_EXTS.has(ext)) {
    return { ok: false, error: "PNG, JPEG or WebP only for this path." };
  }

  const admin = createServiceRoleClient();
  const storageClient = admin ?? supabase;

  // Defense-in-depth: download what the browser PUT there and check the
  // bytes really are the raster format the extension claims. A signed PUT
  // lets the client set any Content-Type, so without this an SVG could be
  // smuggled under a .png path and served as image/svg+xml.
  const { data: blob, error: dlErr } = await storageClient.storage
    .from(BUCKET)
    .download(storagePath);
  if (dlErr || !blob) {
    logServerError("admin-agency-logo-upload.verify-download", dlErr);
    return { ok: false, error: "Could not verify upload. Try again." };
  }
  if (blob.size === 0 || blob.size > MAX_RASTER_BYTES) {
    await storageClient.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "Logo must be a non-empty file under 8 MB." };
  }
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (!matchesRasterMagic(head, ext)) {
    await storageClient.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "File contents don't match the image format." };
  }

  const { data: urlData } = storageClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return persistAgencyLogoUrl({
    dbClient: admin ?? supabase,
    tenantId,
    tenantSlug: auth.tenantSlug,
    logoUrl: urlData.publicUrl,
    contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
  });
}

// ── SVG lane: sanitize the text, store only what passes ─────────────────

export async function actionUploadAgencyLogoSvg(
  svgText: string,
): Promise<AgencyLogoUploadResult> {
  const auth = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.branding.edit",
  });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const result = sanitizeSvgLogoBuffer(svgText);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const admin = createServiceRoleClient();
  const storageClient = admin ?? supabase;
  const storagePath = `${LOGO_PREFIX}/${tenantId}/${randomUUID()}.svg`;

  const { error: uploadError } = await storageClient.storage
    .from(BUCKET)
    .upload(storagePath, result.bytes, {
      contentType: "image/svg+xml",
      upsert: false,
    });
  if (uploadError) {
    logServerError("admin-agency-logo-upload.svg-storage", uploadError);
    return { ok: false, error: "Upload failed. Try again." };
  }

  const { data: urlData } = storageClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return persistAgencyLogoUrl({
    dbClient: admin ?? supabase,
    tenantId,
    tenantSlug: auth.tenantSlug,
    logoUrl: urlData.publicUrl,
    contentType: "image/svg+xml",
  });
}

// ── Shared persistence (settings + agency_branding sync + audit) ────────

async function persistAgencyLogoUrl(opts: {
  dbClient: SupabaseClient;
  tenantId: string;
  tenantSlug: string;
  logoUrl: string;
  contentType: string;
}): Promise<AgencyLogoUploadResult> {
  const { dbClient, tenantId, tenantSlug, logoUrl, contentType } = opts;

  const { data: agency } = await dbClient
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};
  const currentBranding: Record<string, unknown> =
    typeof currentSettings.branding === "object" && currentSettings.branding !== null
      ? (currentSettings.branding as Record<string, unknown>)
      : {};

  const { error: updateErr } = await dbClient
    .from("agencies")
    .update({
      settings: {
        ...currentSettings,
        branding: { ...currentBranding, logo_url: logoUrl },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("admin-agency-logo-upload.settings", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Sync logo_url into agency_branding.theme_json for public-readable access
  const { data: brandingRow } = await dbClient
    .from("agency_branding")
    .select("theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const currentTheme: Record<string, unknown> =
    typeof brandingRow?.theme_json === "object" && brandingRow.theme_json !== null
      ? (brandingRow.theme_json as Record<string, unknown>)
      : {};
  await dbClient
    .from("agency_branding")
    .upsert(
      { tenant_id: tenantId, theme_json: { ...currentTheme, logo_url: logoUrl }, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.logo.uploaded",
    summary: "Uploaded a new workspace logo",
    targetType: "agency",
    targetId: tenantId,
    metadata: { contentType },
  });

  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true, logoUrl };
}

// ── Magic-byte sniffing ─────────────────────────────────────────────────

function matchesRasterMagic(head: Uint8Array, ext: string): boolean {
  if (ext === "png") {
    return (
      head.length >= 8 &&
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    );
  }
  if (ext === "jpg") {
    return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (ext === "webp") {
    // RIFF....WEBP
    return (
      head.length >= 12 &&
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}
