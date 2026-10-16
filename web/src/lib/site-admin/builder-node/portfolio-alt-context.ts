import "server-only";

import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * One cheap single-row read (display name + home city text) for the zero-cost
 * alt suggestion (TUL-588). Trade is not read here: it lives in taxonomy terms
 * and would need a join, so `trade` stays null until a cheap source exists.
 */
export async function loadPortfolioAltContext(talentProfileId: string): Promise<{
  displayName: string | null;
  altContext: { trade: string | null; city: string | null };
}> {
  const empty = { displayName: null, altContext: { trade: null, city: null } };
  const admin = createServiceRoleClient();
  if (!admin) return empty;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("display_name, home_city_text")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return empty;
  const row = data as { display_name: string | null; home_city_text: string | null };
  return {
    displayName: row.display_name?.trim() || null,
    altContext: { trade: null, city: cityLabelFromPlaceText(row.home_city_text) },
  };
}
