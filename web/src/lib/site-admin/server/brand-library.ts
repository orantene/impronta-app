import "server-only";

/**
 * brand-library.ts — workspace BRAND media + brand-settings sync internals.
 *
 * Plain server module (NOT "use server"): holds every DB touch for the
 * Brand identity drawer's media manager and the settings→theme bridge, so
 * the action wrappers in lib/server-actions/admin-branding-media.ts stay
 * query-free (the no-untenanted-from ratchet lints action files; this
 * module follows the design.ts / branding.ts pattern where every query is
 * explicitly tenant-filtered).
 *
 * Brand imagery is WORKSPACE-owned media — never talent media: rows land in
 * media_assets with purpose='branding' + ownership_kind='agency' +
 * owner_tenant_id set, so the page-builder library (no purpose filter) and
 * the Media page's Brand & site lane both see them while talent surfaces
 * never do.
 */

import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tagFor } from "@/lib/site-admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { BRANDING_FOLDER, ensureSystemFolder } from "@/lib/media/system-folders";

const BUCKET = "media-public";
/** Post-compression cap — mirrors MEDIA_IMAGE_MAX_BYTES. */
const MAX_BYTES = 8 * 1024 * 1024;
export const BRANDING_RASTER_EXTS = new Set(["png", "jpg", "webp"]);

export type BrandAssetRole = "wordmark" | "favicon" | null;

export type BrandingMediaAsset = {
  id: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mime: string | null;
  originalFilename: string | null;
  createdAt: string;
  /** Which brand slot (if any) currently points at this asset. */
  role: BrandAssetRole;
};

export type BrandLibraryResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Branding folder (lazy get-or-create) ────────────────────────────────
//
// The get-or-create (including the unique-violation race) lives in
// `@/lib/media/system-folders` now, shared with the Lifestyle folder. This
// wrapper keeps the existing call sites and the name they read by.

export async function ensureBrandingFolder(
  admin: SupabaseClient,
  tenantId: string,
  createdBy: string | null,
): Promise<string | null> {
  return ensureSystemFolder(admin, tenantId, BRANDING_FOLDER, createdBy);
}

// ── Current brand slot references ───────────────────────────────────────

export type BrandRefs = {
  logoUrl: string | null;
  faviconUrl: string | null;
  logoAssetId: string | null;
  faviconAssetId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function loadBrandRefs(
  db: SupabaseClient,
  tenantId: string,
): Promise<BrandRefs> {
  const [{ data: agency }, { data: brandingRow }] = await Promise.all([
    db.from("agencies").select("settings").eq("id", tenantId).single(),
    db
      .from("agency_branding")
      .select("logo_media_asset_id, favicon_media_asset_id, theme_json")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  const branding = asRecord(asRecord(agency?.settings).branding);
  const theme = asRecord(brandingRow?.theme_json);
  return {
    logoUrl:
      typeof branding.logo_url === "string"
        ? branding.logo_url
        : typeof theme.logo_url === "string"
          ? theme.logo_url
          : null,
    faviconUrl:
      typeof branding.favicon_url === "string"
        ? branding.favicon_url
        : typeof theme.favicon_url === "string"
          ? theme.favicon_url
          : null,
    logoAssetId: (brandingRow?.logo_media_asset_id as string | null) ?? null,
    faviconAssetId: (brandingRow?.favicon_media_asset_id as string | null) ?? null,
  };
}

export function roleForAsset(
  refs: BrandRefs,
  asset: { id: string; publicUrl: string },
): BrandAssetRole {
  if (refs.faviconAssetId === asset.id || (refs.faviconUrl && refs.faviconUrl === asset.publicUrl)) {
    return "favicon";
  }
  if (refs.logoAssetId === asset.id || (refs.logoUrl && refs.logoUrl === asset.publicUrl)) {
    return "wordmark";
  }
  return null;
}

// ── List ────────────────────────────────────────────────────────────────

export async function listBrandingAssets(
  admin: SupabaseClient,
  tenantId: string,
): Promise<BrandLibraryResult<{ assets: BrandingMediaAsset[]; inUse: { logoUrl: string | null; faviconUrl: string | null } }>> {
  const [{ data: rows, error }, refs] = await Promise.all([
    admin
      .from("media_assets")
      .select(
        "id, bucket_id, storage_path, public_url, width, height, byte_size, file_size_bytes, mime, mime_type, original_filename, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("purpose", "branding")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    loadBrandRefs(admin, tenantId),
  ]);

  if (error) {
    logServerError("brand-library.list", error);
    return { ok: false, error: "Could not load brand images." };
  }

  type Row = {
    id: string;
    bucket_id: string;
    storage_path: string;
    public_url: string | null;
    width: number | null;
    height: number | null;
    byte_size: number | null;
    file_size_bytes: number | null;
    mime: string | null;
    mime_type: string | null;
    original_filename: string | null;
    created_at: string;
  };

  const assets: BrandingMediaAsset[] = ((rows ?? []) as unknown as Row[]).map((r) => {
    const publicUrl =
      r.public_url ??
      admin.storage.from(r.bucket_id).getPublicUrl(r.storage_path).data.publicUrl ??
      "";
    const base = { id: r.id, publicUrl };
    return {
      ...base,
      width: r.width,
      height: r.height,
      byteSize: r.byte_size ?? r.file_size_bytes,
      mime: r.mime ?? r.mime_type,
      originalFilename: r.original_filename,
      createdAt: r.created_at,
      role: roleForAsset(refs, base),
    };
  });

  return {
    ok: true,
    data: { assets, inUse: { logoUrl: refs.logoUrl, faviconUrl: refs.faviconUrl } },
  };
}

// ── Register an uploaded object as a branding asset ─────────────────────

export async function registerBrandingUpload(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    userId: string;
    storagePath: string;
    originalFilename?: string | null;
    sourceMediaAssetId?: string | null;
  },
): Promise<BrandLibraryResult<BrandingMediaAsset>> {
  const { tenantId, userId, storagePath } = input;
  const expectedPrefix = `tenant/${tenantId}/branding/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
    return { ok: false, error: "Storage path doesn't match this workspace." };
  }
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (!BRANDING_RASTER_EXTS.has(ext)) {
    return { ok: false, error: "PNG, JPEG or WebP only." };
  }

  // Defense-in-depth: download what the browser PUT there and check the
  // bytes match the claimed raster format (a signed PUT lets the client
  // set any Content-Type — see admin-agency-logo-upload.ts).
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
  if (dlErr || !blob) {
    logServerError("brand-library.verify-download", dlErr);
    return { ok: false, error: "Could not verify upload. Try again." };
  }
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "Image must be a non-empty file under 8 MB." };
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  if (!matchesRasterMagic(buf.subarray(0, 16), ext)) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "File contents don't match the image format." };
  }

  // Probe dimensions only — brand assets keep their exact bytes (logos and
  // transparent PNGs must not be re-encoded).
  let width: number | null = null;
  let height: number | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // Non-fatal — grid renders without dimensions.
  }

  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const { data: inserted, error: insErr } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      uploaded_by_user_id: userId,
      created_by: userId,
      bucket_id: BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      variant_kind: "original",
      approval_state: "approved",
      purpose: "branding",
      ownership_kind: "agency",
      owner_tenant_id: tenantId,
      // Brand imagery is workspace media — keep it out of talent surfaces.
      visible_on_master_profile: false,
      visible_in_talent_editor: false,
      sort_order: 0,
      width,
      height,
      file_size: blob.size,
      file_size_bytes: blob.size,
      byte_size: blob.size,
      mime,
      mime_type: mime,
      original_filename: input.originalFilename ?? null,
      source_media_asset_id: input.sourceMediaAssetId ?? null,
      metadata: { source: "branding-manager" },
    })
    .select("id, created_at")
    .single();

  if (insErr || !inserted) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    logServerError("brand-library.register", insErr);
    return { ok: false, error: "Could not record the uploaded image." };
  }

  // Auto-file into the Branding folder (lazy-created per tenant). Non-fatal.
  const folderId = await ensureBrandingFolder(admin, tenantId, userId);
  if (folderId) {
    await admin
      .from("media_folder_items")
      .upsert(
        { folder_id: folderId, asset_id: inserted.id as string, added_by: userId },
        { onConflict: "folder_id,asset_id" },
      );
  }

  return {
    ok: true,
    data: {
      id: inserted.id as string,
      publicUrl,
      width,
      height,
      byteSize: blob.size,
      mime,
      originalFilename: input.originalFilename ?? null,
      createdAt: inserted.created_at as string,
      role: null,
    },
  };
}

// ── Assign an asset to a brand slot (wordmark / favicon) ────────────────

export async function setBrandImageRole(
  admin: SupabaseClient,
  input: { tenantId: string; assetId: string; role: "wordmark" | "favicon" },
): Promise<BrandLibraryResult<{ publicUrl: string }>> {
  const { tenantId, assetId, role } = input;

  const { data: asset } = await admin
    .from("media_assets")
    .select("id, bucket_id, storage_path, public_url")
    .eq("tenant_id", tenantId)
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) return { ok: false, error: "Image not found in this workspace." };

  const publicUrl =
    (asset.public_url as string | null) ??
    admin.storage.from(asset.bucket_id as string).getPublicUrl(asset.storage_path as string).data
      .publicUrl;
  if (!publicUrl) return { ok: false, error: "Image has no public URL." };

  // 1. agencies.settings.branding (staff-side read model).
  const { data: agency } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  const currentSettings = asRecord(agency?.settings);
  const currentBranding = asRecord(currentSettings.branding);
  const settingsKey = role === "wordmark" ? "logo_url" : "favicon_url";
  const { error: settingsErr } = await admin
    .from("agencies")
    .update({
      settings: {
        ...currentSettings,
        branding: { ...currentBranding, [settingsKey]: publicUrl },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
  if (settingsErr) {
    logServerError("brand-library.role.settings", settingsErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // 2. agency_branding — public-readable mirror: theme_json piggyback URL
  //    (same idiom as logo_url; the storefront <head> reads favicon_url from
  //    loadPublicBranding().theme_json) + the typed *_media_asset_id column.
  const { data: brandingRow } = await admin
    .from("agency_branding")
    .select("theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const currentTheme = asRecord(brandingRow?.theme_json);
  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    theme_json: { ...currentTheme, [settingsKey]: publicUrl },
    updated_at: new Date().toISOString(),
  };
  if (role === "wordmark") patch.logo_media_asset_id = assetId;
  else patch.favicon_media_asset_id = assetId;
  const { error: brandErr } = await admin
    .from("agency_branding")
    .upsert(patch, { onConflict: "tenant_id" });
  if (brandErr) {
    // Settings already saved — log and keep going (public mirror is
    // non-fatal, same stance as updateAgencyBranding).
    logServerError("brand-library.role.mirror", brandErr);
  }

  // The storefront caches branding per tenant — bust so the new icon/logo
  // shows on the next request (same tags saveBranding busts).
  updateTag(tagFor(tenantId, "branding"));
  updateTag(tagFor(tenantId, "storefront"));

  return { ok: true, data: { publicUrl } };
}

// ── Delete (soft) with in-use guard ─────────────────────────────────────

export async function deleteBrandingAsset(
  admin: SupabaseClient,
  input: { tenantId: string; assetId: string },
): Promise<BrandLibraryResult<null>> {
  const { tenantId, assetId } = input;

  const { data: asset } = await admin
    .from("media_assets")
    .select("id, bucket_id, storage_path, public_url")
    .eq("tenant_id", tenantId)
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) return { ok: false, error: "Image not found in this workspace." };

  const publicUrl =
    (asset.public_url as string | null) ??
    admin.storage.from(asset.bucket_id as string).getPublicUrl(asset.storage_path as string).data
      .publicUrl ??
    "";
  const refs = await loadBrandRefs(admin, tenantId);
  const role = roleForAsset(refs, { id: assetId, publicUrl });
  if (role === "wordmark") {
    return { ok: false, error: "This image is your current wordmark. Pick a new wordmark first." };
  }
  if (role === "favicon") {
    return { ok: false, error: "This image is your current favicon. Pick a new favicon first." };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  if (error) {
    logServerError("brand-library.delete", error);
    return { ok: false, error: "Delete failed. Try again." };
  }
  return { ok: true, data: null };
}

/**
 * Ids among `ids` currently serving as the workspace wordmark or favicon.
 * Media delete paths call this to refuse removing an in-use brand slot
 * (deleting one would 404 the storefront header logo / browser-tab icon).
 */
export async function listProtectedBrandAssetIds(
  admin: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const [refs, { data: targetRows }] = await Promise.all([
    loadBrandRefs(admin, tenantId),
    admin.from("media_assets").select("id, public_url").in("id", ids).eq("tenant_id", tenantId),
  ]);
  const inUseUrls = new Set(
    [refs.logoUrl, refs.faviconUrl].filter((u): u is string => typeof u === "string" && u.length > 0),
  );
  const inUseIds = new Set(
    [refs.logoAssetId, refs.faviconAssetId].filter((v): v is string => typeof v === "string"),
  );
  return ((targetRows ?? []) as Array<{ id: string; public_url: string | null }>)
    .filter((r) => inUseIds.has(r.id) || (r.public_url !== null && inUseUrls.has(r.public_url)))
    .map((r) => r.id);
}

// ── Settings → theme bridge (colors + watermark + logo piggybacks) ──────

/**
 * Mirror the Brand identity drawer's saved fields into the public-readable
 * agency_branding row. Colors write the SAME design tokens the theme editor
 * (Website → Design) manages — `color.primary` / `color.accent` in
 * theme_json — because tokens/resolve.ts is the only runtime path from a
 * color to the DOM. Colors land in BOTH live and draft: publish copies
 * draft over live, so a live-only write would be reverted by the next
 * publish. Busts the branding/storefront/card-design tags when anything
 * render-relevant changed.
 */
export async function syncBrandSettingsToTheme(
  db: SupabaseClient,
  tenantId: string,
  v: {
    watermark_preset?: unknown;
    logo_url?: string | null;
    favicon_url?: string | null;
    primary_color?: string;
    accent_color?: string;
  },
): Promise<void> {
  const colorsChanged = v.primary_color !== undefined || v.accent_color !== undefined;
  const brandMarkChanged =
    v.logo_url !== undefined || v.favicon_url !== undefined;
  if (v.watermark_preset === undefined && !brandMarkChanged && !colorsChanged) return;

  const { data: brandingRow } = await db
    .from("agency_branding")
    .select("theme_json, theme_json_draft")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const currentTheme = asRecord(brandingRow?.theme_json);
  const currentDraft = asRecord(brandingRow?.theme_json_draft);
  const themeUpdate: Record<string, unknown> = { ...currentTheme };
  const draftUpdate: Record<string, unknown> = { ...currentDraft };
  if (v.watermark_preset !== undefined) themeUpdate.watermark_preset = v.watermark_preset;

  // D4 — logo_url / favicon_url are LEGACY_THEME_PASSTHROUGH_KEYS: they live
  // in theme_json but are NOT registry tokens, and publishDesign resolves
  // them as `{ ...liveLegacy, ...draftLegacy }` — the DRAFT slice wins.
  //
  // So an explicit clear MUST write `null` into the draft as well. Writing
  // it to live only means the very next publish copies the stale draft URL
  // back over the cleared value and the logo reappears — the mirror image
  // of the 2026-08-15 incident where an omission deleted the logo. Here an
  // omission would RESURRECT it. Either way the rule is the same: never let
  // these keys be decided by absence. Always write the value explicitly to
  // both slices.
  if (v.logo_url !== undefined) {
    themeUpdate.logo_url = v.logo_url;
    draftUpdate.logo_url = v.logo_url;
  }
  if (v.favicon_url !== undefined) {
    themeUpdate.favicon_url = v.favicon_url;
    draftUpdate.favicon_url = v.favicon_url;
  }
  if (v.primary_color !== undefined) {
    themeUpdate["color.primary"] = v.primary_color;
    draftUpdate["color.primary"] = v.primary_color;
  }
  if (v.accent_color !== undefined) {
    themeUpdate["color.accent"] = v.accent_color;
    draftUpdate["color.accent"] = v.accent_color;
  }
  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    theme_json: themeUpdate,
    updated_at: new Date().toISOString(),
  };
  if (colorsChanged || brandMarkChanged) {
    patch.theme_json_draft = draftUpdate;
    // Keep the M1 typed columns coherent — the admin chrome accent
    // (_layout-identity.ts) and guest-thread email branding read these.
    if (v.primary_color !== undefined) patch.primary_color = v.primary_color;
    if (v.accent_color !== undefined) patch.accent_color = v.accent_color;
  }
  // D4 — clearing a brand mark must also drop the typed FK, or
  // `loadBrandRefs` + the Brand images manager keep showing the asset as
  // still assigned to the role that no longer has a URL.
  if (v.logo_url === null) patch.logo_media_asset_id = null;
  if (v.favicon_url === null) patch.favicon_media_asset_id = null;

  // Non-fatal if this fails — agencies.settings is already saved.
  await db.from("agency_branding").upsert(patch, { onConflict: "tenant_id" });

  // The storefront <html> vars and the directory-card palette read
  // theme_json through tagged unstable_cache entries (reads.ts,
  // card-design-resolver.ts) — bust them or a saved color takes up to
  // 300 s to appear.
  if (colorsChanged || brandMarkChanged) {
    updateTag(tagFor(tenantId, "branding"));
    updateTag(tagFor(tenantId, "storefront"));
    updateTag(tagFor(tenantId, "card-design"));
  }
}

/** Theme extras the Brand identity drawer's loader needs (colors prefer the
 *  LIVE tokens; favicon/logo piggyback URLs). */
export async function readBrandThemeForSettings(
  db: SupabaseClient,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const { data } = await db
    .from("agency_branding")
    .select("theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return asRecord(data?.theme_json);
}

// ── Magic-byte sniffing (mirrors admin-agency-logo-upload) ──────────────

export function matchesRasterMagic(head: Uint8Array, ext: string): boolean {
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
    return (
      head.length >= 12 &&
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}
