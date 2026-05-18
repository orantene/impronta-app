import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { logServerError } from "@/lib/server/safe-error";

/**
 * roster_cities derivation — distinct residence cities across THIS tenant's
 * roster, with distinct-talent counts.
 *
 * Tenant isolation (query-layer, not RLS-only): `listTalentIdsOnTenantRoster`
 * resolves only this tenant's active site-visible roster; the profile query
 * is constrained `.in("id", roster)`. A profile off this tenant's roster
 * cannot contribute a city or a count. Zero-safe.
 */

export type DerivedLocation = {
  locationId: string;
  label: string;
  region: string | null;
  count: number;
};

type Row = {
  id: string;
  residence_city:
    | {
        id: string;
        display_name_en: string | null;
        display_name_es: string | null;
        country_code: string | null;
      }
    | {
        id: string;
        display_name_en: string | null;
        display_name_es: string | null;
        country_code: string | null;
      }[]
    | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function fetchTenantRosterCities(params: {
  tenantId: string;
  maxItems: number;
  locale: string;
}): Promise<DerivedLocation[]> {
  const { tenantId, maxItems, locale } = params;
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return [];

  try {
    const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
    if (roster.length === 0) return [];

    const { data, error } = await supabase
      .from("talent_profiles")
      .select(
        `id, residence_city:locations!residence_city_id ( id, display_name_en, display_name_es, country_code )`,
      )
      .in("id", roster)
      .is("deleted_at", null);

    if (error) {
      logServerError("location_discovery/fetchTenantRosterCities", error);
      return [];
    }

    const byCity = new Map<
      string,
      { label: string; region: string | null; talents: Set<string> }
    >();

    for (const r of (data ?? []) as Row[]) {
      const city = one(r.residence_city);
      if (!city?.id) continue;
      const label =
        (locale === "es" ? city.display_name_es : city.display_name_en) ??
        city.display_name_en ??
        "";
      if (!label) continue;
      const slot =
        byCity.get(city.id) ??
        { label, region: city.country_code ?? null, talents: new Set() };
      slot.talents.add(r.id);
      byCity.set(city.id, slot);
    }

    return [...byCity.entries()]
      .map(([locationId, v]) => ({
        locationId,
        label: v.label,
        region: v.region,
        count: v.talents.size,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, maxItems);
  } catch (error) {
    logServerError("location_discovery/fetchTenantRosterCities", error);
    return [];
  }
}
