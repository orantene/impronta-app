import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/** The profile's display name (first name as a second try), "" on any failure. */
export async function loadTalentDisplayName(talentProfileId: string): Promise<string> {
  const admin = createServiceRoleClient();
  if (!admin || !talentProfileId) return "";
  try {
    const { data } = await admin
      .from("talent_profiles")
      .select("display_name, first_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    const row = data as { display_name: string | null; first_name: string | null } | null;
    return row?.display_name?.trim() || row?.first_name?.trim() || "";
  } catch {
    return "";
  }
}
