import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";

/** Curated stacks loaded in root layout; see `globals.css` html[data-public-font-preset]. */
export type PublicFontPreset = "impronta" | "editorial";

export function normalizePublicFontPreset(value: unknown): PublicFontPreset {
  return value === "editorial" ? "editorial" : "impronta";
}

export async function getPublicFontPreset(): Promise<PublicFontPreset> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return "impronta";
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "public_font_preset")
      .maybeSingle();

    if (error) {
      logServerError("settings/getPublicFontPreset", error);
      return "impronta";
    }

    return normalizePublicFontPreset(data?.value);
  } catch (error) {
    logServerError("settings/getPublicFontPreset", error);
    return "impronta";
  }
}
