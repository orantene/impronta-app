/**
 * Phase 5 / M1 — cached public reads for identity + branding.
 *
 * Admin forms read through a regular SSR client (uncached, always fresh).
 * The storefront and middleware read through these wrappers, which:
 *   - use the cookie-less public client (RLS `agency_business_identity_public_select`
 *     + `agency_branding_public_select` govern visibility),
 *   - cache per tenant via `unstable_cache`,
 *   - tag entries with `tagFor()` so writes bust them via `updateTag`.
 *
 * NOTE: `agency_business_identity_public_select` is scoped by
 * `current_tenant_id()` GUC, set by the request middleware during tenant
 * resolution. Reads from other contexts return `null`.
 *
 * These functions MUST NOT read `headers()`/`cookies()` — the arg-based
 * tenantId is the only per-request input.
 */

import { unstable_cache } from "next/cache";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { tagFor } from "@/lib/site-admin";

import type { IdentityRow } from "./identity";
import type { BrandingRow } from "./branding";

const IDENTITY_READ_COLUMNS = `
  tenant_id,
  public_name,
  legal_name,
  tagline,
  footer_tagline,
  contact_email,
  contact_phone,
  whatsapp,
  address_city,
  address_country,
  service_area,
  social_instagram,
  social_tiktok,
  social_facebook,
  social_linkedin,
  social_youtube,
  social_x,
  default_locale,
  supported_locales,
  seo_default_title,
  seo_default_description,
  seo_default_share_image_media_asset_id,
  primary_cta_label,
  primary_cta_href,
  version,
  updated_by,
  created_at,
  updated_at
`;

const BRANDING_READ_COLUMNS = `
  tenant_id,
  primary_color,
  secondary_color,
  accent_color,
  neutral_color,
  logo_media_asset_id,
  logo_dark_media_asset_id,
  favicon_media_asset_id,
  og_image_media_asset_id,
  font_preset,
  heading_font,
  body_font,
  brand_mark_svg,
  theme_json,
  theme_preset_slug,
  version,
  updated_by,
  created_at,
  updated_at
`;

/**
 * Cached storefront read of the public identity row.
 *
 * Returns `null` if:
 *   - Supabase env is missing (test / preview-less),
 *   - no row exists yet for this tenant,
 *   - RLS hides the row (current_tenant_id() GUC not set in this context).
 */
export function loadPublicIdentity(
  tenantId: string,
): Promise<IdentityRow | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<IdentityRow | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("agency_business_identity")
        .select(IDENTITY_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .maybeSingle<IdentityRow>();
      if (error) {
        console.warn("[site-admin/reads] identity load failed", {
          tenantId,
          error: error.message,
        });
        return null;
      }
      return data ?? null;
    },
    ["site-admin:identity:public", tenantId],
    { tags: [tagFor(tenantId, "identity")] },
  )();
}

/**
 * Cached storefront read of the branding row.
 *
 * `agency_branding_public_select` allows unrestricted read so storefront
 * styling works on any tenant route; the cache barrier keeps per-tenant hits
 * out of the hot path.
 */
export function loadPublicBranding(
  tenantId: string,
): Promise<BrandingRow | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<BrandingRow | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("agency_branding")
        .select(BRANDING_READ_COLUMNS)
        .eq("tenant_id", tenantId)
        .maybeSingle<BrandingRow>();
      if (error) {
        console.warn("[site-admin/reads] branding load failed", {
          tenantId,
          error: error.message,
        });
        return null;
      }
      return data ?? null;
    },
    ["site-admin:branding:public", tenantId],
    { tags: [tagFor(tenantId, "branding")] },
  )();
}

// ---- uncached, request-scoped reads (admin + server action prelude) ------

/**
 * Uncached admin read — always fresh. Uses the caller-supplied staff client,
 * so RLS `is_staff_of_tenant` governs access. Returns `null` when no row
 * exists yet.
 */
export async function loadIdentityForStaff(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
): Promise<IdentityRow | null> {
  const { data, error } = await supabase
    .from("agency_business_identity")
    .select(IDENTITY_READ_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle<IdentityRow>();
  if (error) {
    console.warn("[site-admin/reads] staff identity load failed", {
      tenantId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}

export async function loadBrandingForStaff(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
): Promise<BrandingRow | null> {
  const { data, error } = await supabase
    .from("agency_branding")
    .select(BRANDING_READ_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle<BrandingRow>();
  if (error) {
    console.warn("[site-admin/reads] staff branding load failed", {
      tenantId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}
