import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";
import { getPublicTenantScope } from "@/lib/saas/scope";

export type SiteTheme = "dark" | "light";

export function normalizeSiteTheme(value: unknown): SiteTheme {
  return value === "light" ? "light" : "dark";
}

export async function getSiteTheme(): Promise<SiteTheme> {
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

    return normalizeSiteTheme(data?.value);
  } catch (error) {
    logServerError("settings/getSiteTheme", error);
    return "dark";
  }
}
