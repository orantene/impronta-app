/**
 * TUL-1904: the language an account discount's coupon is named in, so the
 * discount line on the customer's invoice reads in their language. Talent use
 * `talent_profiles.preferred_locale`; a workspace uses
 * `agency_business_identity.default_locale`. Any failure returns null (English).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadAccountDiscountLocale(
  admin: SupabaseClient,
  subject: { tenantId: string | null; talentProfileId: string | null },
): Promise<string | null> {
  try {
    if (subject.talentProfileId) {
      const { data } = await admin
        .from("talent_profiles")
        .select("preferred_locale")
        .eq("id", subject.talentProfileId)
        .maybeSingle<{ preferred_locale: string | null }>();
      return data?.preferred_locale ?? null;
    }
    if (subject.tenantId) {
      const { data } = await admin
        .from("agency_business_identity")
        .select("default_locale")
        .eq("tenant_id", subject.tenantId)
        .maybeSingle<{ default_locale: string | null }>();
      return data?.default_locale ?? null;
    }
  } catch {
    // best effort: English fallback
  }
  return null;
}
