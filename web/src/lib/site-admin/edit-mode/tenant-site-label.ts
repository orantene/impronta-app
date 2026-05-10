import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public-facing site name for the storefront tenant — used in edit chrome
 * so operators see **product** (Tulala Builder) vs **tenant site** clearly.
 */
export async function loadTenantSiteLabelForEditChrome(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: identity } = await supabase
    .from("agency_business_identity")
    .select("public_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const publicName = (identity?.public_name as string | undefined)?.trim();
  if (publicName) return publicName;

  const { data: agency } = await supabase
    .from("agencies")
    .select("display_name, slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (!agency) return null;
  const display = (agency.display_name as string | undefined)?.trim();
  if (display) return display;
  const slug = (agency.slug as string | undefined)?.trim();
  return slug || null;
}
