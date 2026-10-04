import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** Primary + secondary talent_type labels (EN) for trade-app placement. */
export async function loadTalentTypeLabels(talentProfileId: string): Promise<string[]> {
  const id = talentProfileId?.trim();
  if (!id) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("talent_profiles")
      .select(
        `talent_profile_taxonomy ( is_primary, display_order, taxonomy_terms ( kind, name_i18n ) )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      if (error) logServerError("talentSite.trades.profile", error);
      return [];
    }
    type TaxRow = {
      is_primary: boolean | null;
      display_order: number | null;
      taxonomy_terms: { kind: string | null; name_i18n: { en?: string } | null } | null;
    };
    const raw = data as unknown as { talent_profile_taxonomy: TaxRow[] | null };
    const rows = raw.talent_profile_taxonomy ?? [];
    return rows
      .filter((t) => t.taxonomy_terms?.kind === "talent_type")
      .sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) ||
          (a.display_order ?? 0) - (b.display_order ?? 0),
      )
      .map((t) => t.taxonomy_terms?.name_i18n?.en?.trim() ?? "")
      .filter(Boolean);
  } catch (err) {
    logServerError("talentSite.trades.profile", err);
    return [];
  }
}
