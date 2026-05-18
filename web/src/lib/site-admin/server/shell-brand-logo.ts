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
 *      `agencies.settings` is staff-only". Reading `agencies.settings`
 *      directly in the public render path is NOT done — it would require
 *      an RLS/RPC migration (out of scope).
 *   3. `null` → caller renders the text wordmark (`brand.label`).
 *
 * Cache resilience: this resolver does its OWN narrowly-scoped public read
 * of just `theme_json` under a distinct cache key, with a short TTL AND
 * the tenant `branding` tag. It deliberately does NOT reuse the shared
 * `loadPublicBranding` reader, whose `unstable_cache` is tagged-only with
 * no TTL — meaning a tenant whose logo was set outside the canonical
 * save path (e.g. a one-time data alignment, or a row cached by an older
 * deployment) would otherwise stay logo-less indefinitely until a
 * `saveBranding`/`publishDesign` busts the tag. The short TTL self-heals
 * within `SHELL_LOGO_TTL_SECONDS`; the `branding` tag still busts it
 * instantly on the canonical save path; and the distinct cache key means
 * a fresh deployment resolves correctly on the first request.
 *
 * `agency_branding.logo_media_asset_id` (needs a public media-URL
 * resolver) and `brand_mark_svg` (inline SVG, different render path than
 * an `<img src>`) are publicly readable but have no shell render path
 * today — documented future fallbacks, intentionally not implemented here.
 */

import { unstable_cache } from "next/cache";

import { tagFor } from "@/lib/site-admin/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

/** Short safety-net TTL (seconds). Canonical branding saves still bust the
 * tag instantly; this only bounds staleness for out-of-band writes. */
const SHELL_LOGO_TTL_SECONDS = 300;

function loadShellLogoUrl(tenantId: string): Promise<string | null> {
  return unstable_cache(
    async (): Promise<string | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("agency_branding")
        .select("theme_json")
        .eq("tenant_id", tenantId)
        .maybeSingle<{ theme_json: Record<string, unknown> | null }>();
      if (error || !data) return null;
      const themeJson = data.theme_json ?? {};
      const raw =
        typeof themeJson.logo_url === "string" ? themeJson.logo_url.trim() : "";
      return raw.length > 0 ? raw : null;
    },
    ["site-admin:shell-brand-logo", tenantId],
    {
      revalidate: SHELL_LOGO_TTL_SECONDS,
      tags: [tagFor(tenantId, "branding")],
    },
  )();
}

export async function resolveShellBrandLogoUrl(params: {
  tenantId: string;
  brandLogoUrl?: string | null;
}): Promise<string | null> {
  const explicit = params.brandLogoUrl?.trim();
  if (explicit) return explicit;
  if (!params.tenantId) return null;
  return loadShellLogoUrl(params.tenantId);
}
