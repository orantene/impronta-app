import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTalentRatingSummary } from "@/lib/reviews/load-reviews";
import { logServerError } from "@/lib/server/safe-error";

type Db = Pick<SupabaseClient, "from">;

export interface HeroProofData {
  years: number | null;
  rating: number | null;
  count: number | null;
  demo: boolean;
}

const EMPTY: HeroProofData = { years: null, rating: null, count: null, demo: false };

/**
 * The facts behind the hero proof line (`formatHeroProofLine`): years of craft
 * from the profile's `experience.years_total` field, the published rating and
 * review count, and whether the talent is a demo. Read-only, three small
 * reads; any failure degrades to "no data" (a shorter line), never an error.
 */
export async function loadHeroProofData(db: Db, talentProfileId: string): Promise<HeroProofData> {
  if (!talentProfileId) return EMPTY;
  try {
    const [years, summary, demo] = await Promise.all([
      loadYears(db, talentProfileId),
      loadTalentRatingSummary(talentProfileId),
      loadIsDemo(db, talentProfileId),
    ]);
    return {
      years,
      rating: summary.count > 0 ? summary.average : null,
      count: summary.count > 0 ? summary.count : null,
      demo,
    };
  } catch (err) {
    logServerError("talentSite.heroProofData", err);
    return EMPTY;
  }
}

async function loadYears(db: Db, talentProfileId: string): Promise<number | null> {
  const { data, error } = await db
    .from("talent_profile_field_values")
    .select("value, profile_field_definitions!inner(field_key)")
    .eq("talent_profile_id", talentProfileId)
    .eq("profile_field_definitions.field_key", "experience.years_total")
    .limit(1);
  if (error) {
    logServerError("talentSite.heroProofYears", error);
    return null;
  }
  const raw = (data?.[0] as { value?: unknown } | undefined)?.value;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

async function loadIsDemo(db: Db, talentProfileId: string): Promise<boolean> {
  const { data, error } = await db.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle();
  if (error) {
    logServerError("talentSite.heroProofDemo", error);
    return false;
  }
  return (data as { is_demo?: boolean } | null)?.is_demo === true;
}
