"use server";

/**
 * Talent Max Site — LOGO server actions.
 *
 * Split out of `site-management-actions.ts` for the 800-line max-lines
 * budget once D7 added the signed-upload lane. Same auth (`gate()` —
 * owner + Max), same table (`talent_sites.logo_url`), same bucket.
 *
 * Transports, in the order the client tries them:
 *   - raster  → createMaxSiteLogoUploadUrlAction + finalizeMaxSiteLogoAction
 *               (signed PUT; clears the ~4 MB Server Action body cap that
 *               made the advertised 10 MB allowance unreachable)
 *   - SVG     → uploadMaxSiteLogoSvgAction (text in, sanitized server-side
 *               BEFORE anything lands in the public bucket)
 *   - legacy  → uploadMaxSiteLogoAction (multipart; small files only)
 *
 * Every successful lane now also writes the `media_assets` ledger row the
 * old code never wrote, so replaced logos stop being invisible orphans.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sanitizeSvgLogoBuffer } from "@/lib/site-admin/sanitize-svg-upload";
import { talentOwnedStamp } from "@/lib/media/ownership";
import { gate } from "./site-action-gate";
import type { MaxSiteActionResult } from "./site-management-types";

// ── Logo upload ──────────────────────────────────────────────────────────────

const LOGO_ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const LOGO_BUCKET = "media-public";
const LOGO_RASTER_EXTS = ["png", "jpg", "webp"] as const;
type LogoRasterExt = (typeof LOGO_RASTER_EXTS)[number];

const RASTER_EXT_MIME: Readonly<Record<LogoRasterExt, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** Magic-byte sniff so a renamed .exe can't be finalized as a logo. */
function matchesRasterMagic(buf: Buffer, ext: LogoRasterExt): boolean {
  if (ext === "png") {
    return (
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (ext === "jpg") {
    return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  // webp: "RIFF"...."WEBP"
  return (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

function logoStoragePath(talentProfileId: string, ext: string): string {
  return `talent-site-logos/${talentProfileId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * D7 — record the logo in `media_assets` so it stops being an orphan.
 *
 * Before this, the Max-site logo was the only upload surface in the app
 * that wrote bytes into `media-public` and never wrote a row. The storage
 * reaper walks `media_assets` to decide what is unreferenced, so every
 * logo a talent replaced was invisible-but-billed forever, and the talent's
 * own media views never showed it. The row is TALENT-owned (the talent
 * uploaded it to their own site), purpose 'branding'.
 *
 * Failure here is deliberately non-fatal: the logo is already stored and
 * `talent_sites.logo_url` is the thing that renders. A missing ledger row
 * is a bookkeeping problem, not a broken logo.
 */
async function recordMaxSiteLogoAsset(input: {
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>;
  talentProfileId: string;
  userId: string;
  storagePath: string;
  publicUrl: string;
  mime: string;
  byteSize: number;
}): Promise<void> {
  const { error } = await input.admin.from("media_assets").insert([
    {
      talent_profile_id: input.talentProfileId,
      owner_talent_profile_id: input.talentProfileId,
      ...talentOwnedStamp(input.userId),
      bucket_id: LOGO_BUCKET,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      variant_kind: "original",
      approval_state: "approved",
      purpose: "branding",
      sort_order: 0,
      file_size: input.byteSize,
      file_size_bytes: input.byteSize,
      byte_size: input.byteSize,
      mime: input.mime,
      mime_type: input.mime,
      visible_on_master_profile: false,
      visible_in_talent_editor: false,
      metadata: { source: "talent-max-site-logo" },
    },
  ]);
  if (error) logServerError("maxSiteManager.logo.assetRow", error);
}

async function persistMaxSiteLogoUrl(input: {
  logoUrl: string;
  userId: string;
  talentProfileId: string;
}): Promise<MaxSiteActionResult<{ logoUrl: string }>> {
  const { logoUrl, userId, talentProfileId } = input;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };
  // Owner-RLS scoped, same as every other write in this file.
  const { error, count } = await sb
    .from("talent_sites")
    .update(
      { logo_url: logoUrl, updated_at: new Date().toISOString(), updated_by: userId },
      { count: "exact" },
    )
    .eq("talent_profile_id", talentProfileId);
  if (error) {
    logServerError("maxSiteManager.logo.db", error);
    return { ok: false, code: "server_error", error: "Could not save the logo." };
  }
  if (!count) return { ok: false, code: "site_not_found", error: "Site not found." };
  return { ok: true, data: { logoUrl } };
}

/**
 * LEGACY multipart lane, kept for small files only.
 *
 * D7: this action promised "under 10 MB" while riding a Server Action body
 * capped at 4 MB (next.config.ts `serverActions.bodySizeLimit`), so any
 * real logo failed with an opaque 413 the UI never rendered. The working
 * transport is now `createMaxSiteLogoUploadUrlAction` +
 * `finalizeMaxSiteLogoAction` (raster) and `uploadMaxSiteLogoSvgAction`
 * (SVG text). This entry point stays so an already-loaded client bundle
 * keeps working, and it now writes the media_assets row too.
 */
export async function uploadMaxSiteLogoAction(
  formData: FormData,
): Promise<MaxSiteActionResult<{ logoUrl: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, code: "invalid_input", error: "No file provided." };
  }
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, code: "invalid_input", error: "PNG, SVG, JPEG or WebP only." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, code: "invalid_input", error: "Logo must be under 10 MB." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const storagePath = logoStoragePath(g.talentProfileId, ext);
  // Public-bucket SVG is stored XSS unless sanitized (Wave 5.1): store only what the allowlist sanitizer accepts.
  const body = ext === "svg" ? sanitizeSvgLogoBuffer(await file.text()) : ({ ok: true, bytes: await file.arrayBuffer() } as const);
  if (!body.ok) return { ok: false, code: "invalid_input", error: body.error };
  const bytes = body.bytes;
  const byteSize =
    bytes instanceof Buffer ? bytes.byteLength : (bytes as ArrayBuffer).byteLength;

  const { error: uploadErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) {
    logServerError("maxSiteManager.logo.upload", uploadErr);
    return { ok: false, code: "server_error", error: "Upload failed. Try again." };
  }

  const { data: urlData } = admin.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  const saved = await persistMaxSiteLogoUrl({
    logoUrl,
    userId: g.userId,
    talentProfileId: g.talentProfileId,
  });
  if (!saved.ok) return saved;

  await recordMaxSiteLogoAsset({
    admin,
    talentProfileId: g.talentProfileId,
    userId: g.userId,
    storagePath,
    publicUrl: logoUrl,
    mime: file.type,
    byteSize,
  });
  return saved;
}

/**
 * D7 raster lane, step 1 — mint a one-shot signed upload URL so the bytes
 * go browser → storage directly and never touch the 4 MB Server Action
 * body cap. Call `finalizeMaxSiteLogoAction` with the returned path.
 */
export async function createMaxSiteLogoUploadUrlAction(
  ext: string,
): Promise<MaxSiteActionResult<{ uploadUrl: string; storagePath: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const normalized = ext.toLowerCase().replace(/^\./, "").replace("jpeg", "jpg");
  if (!(LOGO_RASTER_EXTS as readonly string[]).includes(normalized)) {
    return { ok: false, code: "invalid_input", error: "PNG, JPEG or WebP only." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const storagePath = logoStoragePath(g.talentProfileId, normalized);
  const { data, error } = await admin.storage
    .from(LOGO_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    logServerError("maxSiteManager.logo.signedUrl", error);
    return { ok: false, code: "server_error", error: "Could not start upload. Try again." };
  }
  return {
    ok: true,
    data: { uploadUrl: data.signedUrl, storagePath: data.path ?? storagePath },
  };
}

/**
 * D7 raster lane, step 2 — re-verify the bytes the browser actually PUT
 * (path prefix, real size, magic bytes), then persist `logo_url` AND the
 * `media_assets` ledger row. Nothing the client claimed is trusted.
 */
export async function finalizeMaxSiteLogoAction(
  storagePath: string,
): Promise<MaxSiteActionResult<{ logoUrl: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  const prefix = `talent-site-logos/${g.talentProfileId}/`;
  if (!storagePath.startsWith(prefix)) {
    return { ok: false, code: "invalid_input", error: "Upload path doesn't match your site." };
  }
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (!(LOGO_RASTER_EXTS as readonly string[]).includes(ext)) {
    return { ok: false, code: "invalid_input", error: "PNG, JPEG or WebP only." };
  }
  const rasterExt = ext as LogoRasterExt;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const { data: blob, error: dlErr } = await admin.storage
    .from(LOGO_BUCKET)
    .download(storagePath);
  if (dlErr || !blob) {
    logServerError("maxSiteManager.logo.finalize.download", dlErr);
    return { ok: false, code: "server_error", error: "Could not verify upload. Try again." };
  }
  const buf = Buffer.from(await blob.arrayBuffer());

  if (buf.byteLength === 0 || buf.byteLength > LOGO_MAX_BYTES) {
    await admin.storage.from(LOGO_BUCKET).remove([storagePath]);
    return { ok: false, code: "invalid_input", error: "Logo must be under 10 MB." };
  }
  if (!matchesRasterMagic(buf, rasterExt)) {
    await admin.storage.from(LOGO_BUCKET).remove([storagePath]);
    return { ok: false, code: "invalid_input", error: "That file isn't a PNG, JPEG or WebP image." };
  }

  const { data: urlData } = admin.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  const saved = await persistMaxSiteLogoUrl({
    logoUrl,
    userId: g.userId,
    talentProfileId: g.talentProfileId,
  });
  if (!saved.ok) {
    await admin.storage.from(LOGO_BUCKET).remove([storagePath]);
    return saved;
  }

  await recordMaxSiteLogoAsset({
    admin,
    talentProfileId: g.talentProfileId,
    userId: g.userId,
    storagePath,
    publicUrl: logoUrl,
    mime: RASTER_EXT_MIME[rasterExt],
    byteSize: buf.byteLength,
  });
  return saved;
}

/**
 * D7 SVG lane — the markup rides as text (SVGs are small) so the strict
 * allowlist sanitizer runs BEFORE anything lands in the public bucket. A
 * signed PUT would put un-sanitized markup on a public URL the instant it
 * completed. Mirrors `actionUploadAgencyLogoSvg`.
 */
export async function uploadMaxSiteLogoSvgAction(
  svgText: string,
): Promise<MaxSiteActionResult<{ logoUrl: string }>> {
  const g = await gate();
  if (!g.ok) return g;

  if (!svgText.trim()) {
    return { ok: false, code: "invalid_input", error: "No file provided." };
  }
  const sanitized = sanitizeSvgLogoBuffer(svgText);
  if (!sanitized.ok) {
    return { ok: false, code: "invalid_input", error: sanitized.error };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const storagePath = logoStoragePath(g.talentProfileId, "svg");
  const { error: uploadErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, sanitized.bytes, {
      contentType: "image/svg+xml",
      upsert: false,
    });
  if (uploadErr) {
    logServerError("maxSiteManager.logo.svgUpload", uploadErr);
    return { ok: false, code: "server_error", error: "Upload failed. Try again." };
  }

  const { data: urlData } = admin.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  const saved = await persistMaxSiteLogoUrl({
    logoUrl,
    userId: g.userId,
    talentProfileId: g.talentProfileId,
  });
  if (!saved.ok) {
    await admin.storage.from(LOGO_BUCKET).remove([storagePath]);
    return saved;
  }

  await recordMaxSiteLogoAsset({
    admin,
    talentProfileId: g.talentProfileId,
    userId: g.userId,
    storagePath,
    publicUrl: logoUrl,
    mime: "image/svg+xml",
    byteSize: sanitized.bytes.byteLength,
  });
  return saved;
}

/** Remove the site logo (clears `talent_sites.logo_url`). */
export async function removeMaxSiteLogoAction(): Promise<MaxSiteActionResult> {
  const g = await gate();
  if (!g.ok) return g;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };
  const { error } = await sb
    .from("talent_sites")
    .update({ logo_url: null, updated_at: new Date().toISOString(), updated_by: g.userId })
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maxSiteManager.logo.remove", error);
    return { ok: false, code: "server_error", error: "Could not remove the logo." };
  }
  return { ok: true };
}

