/**
 * tenant-fonts-store.ts — the DB/storage I/O for tenant-uploaded brand fonts.
 *
 * Split out of `lib/server-actions/admin-tenant-fonts.ts` the same way
 * `brand-library.ts` backs `admin-branding-media.ts`: every raw `.from()`
 * lives HERE, keeping the action file free of untenanted queries per the
 * no-untenanted-from ratchet. Both functions take the tenantId that the
 * action's membership guard resolved; every query filters on it.
 *
 * The metadata model itself (parse/serialize/validation/@font-face) is pure
 * and lives in `lib/site-admin/builder-node/tenant-fonts.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { updateTag } from "next/cache";

import { tagFor } from "@/lib/site-admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  THEME_JSON_CUSTOM_FONTS_KEY,
  parseTenantFonts,
  serializeTenantFonts,
  type TenantFontFamily,
} from "@/lib/site-admin/builder-node/tenant-fonts";

export async function readTenantFontFamilies(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ families: TenantFontFamily[]; theme: Record<string, unknown> }> {
  const { data } = await admin
    .from("agency_branding")
    .select("theme_json")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const theme =
    data?.theme_json && typeof data.theme_json === "object"
      ? (data.theme_json as Record<string, unknown>)
      : {};
  return { families: parseTenantFonts(theme), theme };
}

export async function writeTenantFontFamilies(
  admin: SupabaseClient,
  tenantId: string,
  theme: Record<string, unknown>,
  families: TenantFontFamily[],
): Promise<boolean> {
  const { error } = await admin.from("agency_branding").upsert(
    {
      tenant_id: tenantId,
      theme_json: {
        ...theme,
        [THEME_JSON_CUSTOM_FONTS_KEY]: serializeTenantFonts(families),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) {
    logServerError("tenant-fonts.write", error);
    return false;
  }
  // The storefront head reads theme_json through the tagged branding cache.
  updateTag(tagFor(tenantId, "branding"));
  updateTag(tagFor(tenantId, "storefront"));
  return true;
}
