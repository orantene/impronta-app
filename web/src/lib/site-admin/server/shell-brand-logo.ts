/**
 * Phase 4 — shared brand-logo resolver for the modern site shell.
 *
 * Used by `site_header` + `site_footer` Components so the public shell
 * shows the tenant's canonical brand logo without each section having to
 * re-implement the fallback. Tenant-safe (only reads the passed tenant's
 * publicly-readable branding) and source-of-truth-preserving (no new logo
 * store, no hardcoded URL).
 *
 * Fallback order:
 *   1. section `brand.logoUrl` — explicit operator override in the shell
 *      editor always wins.
 *   2. `agency_branding.theme_json.logo_url` — the PUBLIC projection of
 *      the staff-only `agencies.settings.branding.logo_url`. The canonical
 *      settings-save path (`server-actions/admin-workspace-settings.ts`)
 *      mirrors `logo_url` into `agency_branding.theme_json` on every save
 *      precisely because "`agency_branding` is publicly readable;
 *      `agencies.settings` is staff-only". So reading the mirror keeps the
 *      acceptance ("settings logo = public shell logo; future changes
 *      propagate") while staying on a publicly-readable source. Reading
 *      `agencies.settings` directly in the public render path is NOT done
 *      — it would require an RLS/RPC migration (out of scope).
 *   3. `null` → caller renders the text wordmark (`brand.label`).
 *
 * `agency_branding.logo_media_asset_id` (needs a public media-URL
 * resolver) and `brand_mark_svg` (inline SVG, different render path than
 * an `<img src>`) are publicly readable but have no shell render path
 * today — documented future fallbacks, intentionally not implemented here.
 */

import { loadPublicBranding } from "./reads";

export async function resolveShellBrandLogoUrl(params: {
  tenantId: string;
  brandLogoUrl?: string | null;
}): Promise<string | null> {
  const explicit = params.brandLogoUrl?.trim();
  if (explicit) return explicit;
  if (!params.tenantId) return null;

  const branding = await loadPublicBranding(params.tenantId);
  const themeJson = (branding?.theme_json ?? {}) as Record<string, unknown>;
  const mirrored =
    typeof themeJson.logo_url === "string" ? themeJson.logo_url.trim() : "";
  return mirrored.length > 0 ? mirrored : null;
}
