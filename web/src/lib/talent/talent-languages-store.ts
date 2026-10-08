import "server-only";

/**
 * Talent-owned languages: the scoped reads/writes behind the
 * `loadTalentLanguages` / `updateTalentLanguages` server actions. Kept out of
 * the "use server" file so it stays free of raw `.from(...)` queries; every
 * query here is scoped to the SESSION user's own talent_profiles row.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import type { Locale } from "@/lib/site-admin/locales";

/** The signed-in user's own talent profile id, or null. */
export async function loadOwnTalentProfileId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();
  if (error) {
    logServerError("talent-languages.profile", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Persist the talent's language pair. Tolerates a missing `secondary_locales`
 * column (pre-migration) when there is no secondary to save.
 */
export async function writeTalentLanguages(
  talentProfileId: string,
  primary: Locale | null,
  secondary: readonly Locale[],
): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const updatedAt = new Date().toISOString();
  let { error } = await admin
    .from("talent_profiles")
    .update({ preferred_locale: primary, secondary_locales: [...secondary], updated_at: updatedAt })
    .eq("id", talentProfileId);
  if (error && isPostgrestMissingColumnError(error) && secondary.length === 0) {
    ({ error } = await admin
      .from("talent_profiles")
      .update({ preferred_locale: primary, updated_at: updatedAt })
      .eq("id", talentProfileId));
  }
  if (error) {
    logServerError("talent-languages.update", error);
    return false;
  }
  return true;
}
