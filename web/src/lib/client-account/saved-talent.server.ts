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
export async function loadSavedTalent(userId: string, tenantId: string | null): Promise<SavedTalent[]> {
  const admin = createServiceRoleClient();
  if (!admin || !userId) return [];
  const { data, error } = await admin
    .from("client_favorites")
    .select(`added_at, talent_profile_id, talent_profiles ( ${CATALOG_PROFILE_COLUMNS}, workflow_status, display_name, profile_code, home_city_text )`)
    .eq("client_user_id", userId)
    .order("added_at", { ascending: false })
    .limit(200);
  if (error) {
    logServerError("clientAccount.saved.list", error);
    return [];
  }
  const rows = (data ?? []) as unknown as SavedTalentRow[];
  if (tenantId === null) return shapeSavedTalent(rows, getAppUrl(), null);
  // A tenant's site shows only saved talents on that tenant's active roster.
  const ids = rows.map((r) => r.talent_profile_id);
  if (ids.length === 0) return [];
  const roster = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("talent_profile_id", ids);
  if (roster.error) {
    logServerError("clientAccount.saved.roster", roster.error);
    return [];
  }
  return shapeSavedTalent(rows, getAppUrl(), new Set((roster.data ?? []).map((r) => r.talent_profile_id)));
}
