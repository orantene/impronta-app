import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";
import { getPublicTenantScope } from "@/lib/saas/scope";

export type SiteTheme = "dark" | "light";

export function normalizeSiteTheme(value: unknown): SiteTheme {
  return value === "light" ? "light" : "dark";
}

/**
 * The tenant's explicitly chosen site theme, or NULL when none is set.
 *
 * Null and "dark" are different facts: null means nobody has themed this
 * workspace, and the caller should look at the tenant's own background mode
 * rather than stamping the platform default over a light design. A failed READ
 * still returns "dark" — an error is not an absent setting, and must not be
 * reinterpreted as one.
 */
export async function getSiteTheme(): Promise<SiteTheme | null> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return "dark";
  }

  try {
    const publicScope = await getPublicTenantScope();
    const q = supabase
      .from("settings")
      .select("value")
      .eq("key", "site_theme");
    const { data, error } = await (publicScope
      ? q.eq("tenant_id", publicScope.tenantId)
      : q.is("tenant_id", null)
    ).maybeSingle();

    if (error) {
      logServerError("settings/getSiteTheme", error);
      return "dark";
    }

    // ABSENCE IS NOT "DARK". `normalizeSiteTheme(undefined)` returns "dark",
    // which collapses "this tenant chose dark" and "nobody ever set a theme"
    // into the same answer — and the second case is every tenant that has not
    // been explicitly themed. The caller needs to tell them apart to fall back
    // to the tenant's own background polarity instead of a platform default.
    return data?.value == null ? null : normalizeSiteTheme(data.value);
  } catch (error) {
    logServerError("settings/getSiteTheme", error);
    return "dark";
  }
}
