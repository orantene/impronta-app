import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type DashboardTheme = "dark" | "light";

export function normalizeDashboardTheme(value: unknown): DashboardTheme {
  return value === "dark" ? "dark" : "light";
}

export async function getDashboardTheme(
  supabase: SupabaseClient,
): Promise<DashboardTheme> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "dashboard_theme")
      .maybeSingle();

    if (error) {
      logServerError("settings/getDashboardTheme", error);
      return "light";
    }

    return normalizeDashboardTheme(data?.value);
  } catch (error) {
    logServerError("settings/getDashboardTheme", error);
    return "light";
  }
}
