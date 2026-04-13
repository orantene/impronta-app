import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";

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
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "site_theme")
      .maybeSingle();

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
