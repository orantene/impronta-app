import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildTickerServiceWords } from "../ticker-services";

/**
 * Her published, approved, public services as ticker words in the visitor's
 * language (same visibility rules as the services menu). Any failure degrades
 * to no words, so the ticker keeps its literal items instead of erroring.
 */
export async function loadTalentTickerWords(
  talentProfileId: string,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin || !talentProfileId) return [];
  try {
    const { data, error } = await admin
      .from("talent_offerings")
      .select("title, title_i18n")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"])
      .order("sort_order", { ascending: true })
      .limit(24);
    if (error) {
      logServerError("talentSite.tickerServices", error);
      return [];
    }
    const lang = (locale ?? "en").trim().toLowerCase().slice(0, 2) || "en";
    return buildTickerServiceWords(
      (data ?? []) as { title: string; title_i18n: Record<string, string> | null }[],
      lang,
      chain,
    );
  } catch (err) {
    logServerError("talentSite.tickerServices", err);
    return [];
  }
}
