import "server-only";

import { sanitizeStoredVerificationToken } from "@/lib/talent/google-site-verification";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** The talent's Search Console token, or null (unset, unmigrated, or any read error). */
export async function loadTalentGoogleSiteVerification(talentProfileId: string): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data, error } = await admin
      .from("talent_sites")
      .select("google_site_verification")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("talent.googleSiteVerification.load", error);
      return null;
    }
    return sanitizeStoredVerificationToken((data as { google_site_verification?: unknown } | null)?.google_site_verification);
  } catch (err) {
    logServerError("talent.googleSiteVerification.load", err);
    return null;
  }
}
