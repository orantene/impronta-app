import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { CATALOG_PROFILE_COLUMNS, shapeSavedTalent, type SavedTalent, type SavedTalentRow } from "./saved-talent";

/**
 * The signed-in client's saved talent: `client_favorites` rows for THIS user only
 * (`client_user_id = userId`, never a request parameter), newest first, public talent only.
 * Reads degrade to an empty list (the table or a column missing is logged once per call).
 */
export async function loadSavedTalent(userId: string): Promise<SavedTalent[]> {
  const admin = createServiceRoleClient();
  if (!admin || !userId) return [];
  const { data, error } = await admin
    .from("client_favorites")
    .select(`added_at, talent_profile_id, talent_profiles ( ${CATALOG_PROFILE_COLUMNS}, display_name, profile_code, home_city_text )`)
    .eq("client_user_id", userId)
    .order("added_at", { ascending: false })
    .limit(200);
  if (error) {
    logServerError("clientAccount.saved.list", error);
    return [];
  }
  return shapeSavedTalent((data ?? []) as unknown as SavedTalentRow[], getAppUrl());
}
