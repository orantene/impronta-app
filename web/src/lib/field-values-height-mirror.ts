import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/** Keep `talent_profiles.height_cm` aligned with governed `field_values` for the height_cm definition. */
export async function mirrorHeightCmToTalentProfile(
  supabase: SupabaseClient,
  talentProfileId: string,
  heightCm: number | null,
): Promise<{ ok: true } | { ok: false }> {
  const { error } = await supabase
    .from("talent_profiles")
    .update({ height_cm: heightCm, updated_at: new Date().toISOString() })
    .eq("id", talentProfileId);
  if (error) {
    logServerError("field-values/mirrorHeightCm", error);
    return { ok: false };
  }
  return { ok: true };
}
