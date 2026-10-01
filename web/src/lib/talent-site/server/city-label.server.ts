import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalCityName, citySlug, hasAccent } from "../city-label";

type Admin = Pick<SupabaseClient, "from">;

/**
 * `label` with its canonical accents for `locale`, from the `locations` row
 * that shares its slug ("Cancun" gives "Cancún"). The label is returned as
 * is when it already carries an accent, matches no location, or the read
 * fails, so this can only improve a city, never change it.
 */
export async function canonicalCityLabel(admin: Admin, label: string | null | undefined, locale: string, hints: ReadonlyArray<string | null | undefined> = []): Promise<string> {
  const text = label?.trim() ?? "";
  if (!text || hasAccent(text)) return text;
  const slug = citySlug(text);
  if (!slug) return text;
  const { data, error } = await admin.from("locations").select("display_name_i18n").eq("city_slug", slug).limit(4);
  if (error) {
    logServerError("talentSite.canonicalCityLabel", error);
    return text;
  }
  const maps = ((data ?? []) as { display_name_i18n: Record<string, string | null> | null }[]).map((r) => r.display_name_i18n);
  return canonicalCityName(text, maps, locale, hints);
}
