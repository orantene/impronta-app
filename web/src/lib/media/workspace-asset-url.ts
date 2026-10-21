/**
 * workspace-asset-url.ts — is this image URL one of THIS workspace's own assets? (TUL-1635)
 *
 * `updateAgencyBranding` took any `https` URL for the logo and favicon and wrote it into the
 * settings and into the public theme, which every storefront page then loads. That is an
 * arbitrary third-party URL on every page (a tracking pixel, a swapped image, another workspace's
 * file). The only places this product stores a workspace image are its own storage bucket, so a
 * URL is accepted only when it is:
 *
 *   1. https, on the configured Supabase project's storage (`isAllowedLogoUrl`), AND
 *   2. either the workspace's own logo-upload prefix (`agency-logos/<tenantId>/`, written by the
 *      Branding drawer's signed upload, which makes no gallery row by design), OR the public URL
 *      of a LIVE `media_assets` row of this tenant (the Media Gallery).
 *
 * `null` (clear the logo) and `undefined` (leave it alone) never reach this check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAllowedLogoUrl } from "@/lib/media/logo-url-allowlist";

const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";
/** The Branding drawer's signed logo upload lands here (admin-agency-logo-upload.ts). */
const LOGO_UPLOAD_PREFIX = "agency-logos";

export const WORKSPACE_ASSET_URL_ERROR = "Use an image from your own Media Gallery.";

export type WorkspaceAssetUrlCheck = { ok: true } | { ok: false; error: string };

export type ParsedStorageUrl = { bucket: string; path: string };

/** Bucket and object path of a public Supabase storage URL, or null when it is not one. */
export function parsePublicStorageUrl(rawUrl: string): ParsedStorageUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return null;
  let rest: string;
  try {
    rest = decodeURIComponent(parsed.pathname.slice(PUBLIC_OBJECT_PREFIX.length));
  } catch {
    return null;
  }
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!path || path.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return null;
  return { bucket, path };
}

/** True for an object under this workspace's own logo-upload prefix. */
export function isOwnLogoUploadPath(parsed: ParsedStorageUrl, tenantId: string): boolean {
  return parsed.bucket === "media-public" && parsed.path.startsWith(`${LOGO_UPLOAD_PREFIX}/${tenantId}/`);
}

export async function assertWorkspaceAssetUrl(
  db: SupabaseClient,
  tenantId: string,
  rawUrl: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): Promise<WorkspaceAssetUrlCheck> {
  const refuse: WorkspaceAssetUrlCheck = { ok: false, error: WORKSPACE_ASSET_URL_ERROR };
  if (!isAllowedLogoUrl(rawUrl, supabaseUrl)) return refuse;
  const parsed = parsePublicStorageUrl(rawUrl);
  if (!parsed) return refuse;
  if (isOwnLogoUploadPath(parsed, tenantId)) return { ok: true };

  // A gallery asset: a live row of THIS tenant, matched by its public URL or its bucket + path.
  // Two plain equality queries, never `.or()` with the URL spliced in: a URL can hold commas and
  // parentheses, which would be read as extra filter clauses.
  const live = () => db.from("media_assets").select("id").eq("tenant_id", tenantId).is("deleted_at", null);
  const [byUrl, byPath] = await Promise.all([
    live().eq("public_url", rawUrl).limit(1),
    live().eq("bucket_id", parsed.bucket).eq("storage_path", parsed.path).limit(1),
  ]);
  if (byUrl.error || byPath.error) return { ok: false, error: "Could not check that image. Try again." };
  return (byUrl.data ?? []).length + (byPath.data ?? []).length > 0 ? { ok: true } : refuse;
}

/** The URL without its query string or fragment, so a tracking or cache-busting suffix is never stored. */
export function canonicalStorageUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Every non-null id must be a LIVE media asset of THIS tenant. `saveBranding` stores
 * logo / dark logo / favicon / share-image asset ids sent by the client; a uuid shape check let
 * workspace A point its logo at workspace B's asset. A read error refuses.
 */
export async function assertOwnedAssetIds(
  db: SupabaseClient,
  tenantId: string,
  ids: ReadonlyArray<string | null | undefined>,
): Promise<WorkspaceAssetUrlCheck> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (wanted.length === 0) return { ok: true };
  const { data, error } = await db
    .from("media_assets")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("id", wanted);
  if (error) return { ok: false, error: "Could not check those images. Try again." };
  const found = new Set((data ?? []).map((r) => (r as { id: string }).id));
  return wanted.every((id) => found.has(id)) ? { ok: true } : { ok: false, error: WORKSPACE_ASSET_URL_ERROR };
}
