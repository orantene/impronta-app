import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveCountryIso } from "./staff-phone-country";

/** Workspace country: agency_business_identity.address_country. Null on any miss. */
export async function loadWorkspacePhoneCountry(tenantId: string): Promise<string | null> {
  try {
    const db = createServiceRoleClient();
    if (!db) return null;
    const { data, error } = await db
      .from("agency_business_identity")
      .select("address_country")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    return resolveCountryIso(data?.address_country);
  } catch (err) {
    logServerError("staffPhoneCountry.workspace", err);
    return null;
  }
}

/** Talent/Profesional country: talent_profiles.residence_country_id -> countries.iso2. */
export async function loadTalentPhoneCountry(talentProfileId: string): Promise<string | null> {
  try {
    const db = createServiceRoleClient();
    if (!db) return null;
    const { data: tp, error: tpErr } = await db
      .from("talent_profiles")
      .select("residence_country_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (tpErr) throw tpErr;
    if (!tp?.residence_country_id) return null;
    const { data: c, error: cErr } = await db.from("countries").select("iso2").eq("id", tp.residence_country_id).maybeSingle();
    if (cErr) throw cErr;
    return resolveCountryIso(c?.iso2);
  } catch (err) {
    logServerError("staffPhoneCountry.talent", err);
    return null;
  }
}
