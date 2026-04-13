import { Suspense } from "react";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import {
  loadTalentDashboardData,
  loadTalentTaxonomyEditorData,
} from "@/lib/talent-dashboard-data";
import { createClient } from "@/lib/supabase/server";
import { TalentMyProfileClient } from "@/app/(dashboard)/talent/my-profile/talent-my-profile-client";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";

export default async function TalentMyProfilePage() {
  const supabase = await createClient();
  const [result, tax] = await Promise.all([
    loadTalentDashboardData(),
    loadTalentTaxonomyEditorData(),
  ]);
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;

  const { profile, fieldCatalog, fieldValues } = result.data;
  const locationIds = [
    profile.residence_city_id ?? profile.location_id,
    profile.origin_city_id,
  ].filter(Boolean) as string[];

  const { data: cities } =
    supabase && locationIds.length > 0
      ? await supabase
          .from("locations")
          .select("id, city_slug, display_name_en, display_name_es, latitude, longitude, countries!locations_country_id_fkey(id, iso2, name_en, name_es)")
          .in("id", locationIds)
      : { data: [] as Array<{
          id: string;
          city_slug: string;
          display_name_en: string;
          display_name_es: string | null;
          latitude: number | null;
          longitude: number | null;
          countries: { id: string; iso2: string; name_en: string; name_es: string | null } | { id: string; iso2: string; name_en: string; name_es: string | null }[] | null;
        }> };

  const byCityId = new Map(
    ((cities ?? []) as Array<{
      id: string;
      city_slug: string;
      display_name_en: string;
      display_name_es: string | null;
      latitude: number | null;
      longitude: number | null;
      countries: { id: string; iso2: string; name_en: string; name_es: string | null } | { id: string; iso2: string; name_en: string; name_es: string | null }[] | null;
    }>).map((row) => {
      const country = Array.isArray(row.countries) ? row.countries[0] ?? null : row.countries;
      const selection = {
        country: country
          ? ({
              id: country.id,
              iso2: country.iso2,
              name_en: country.name_en,
              name_es: country.name_es,
            } satisfies CountrySuggestion)
          : null,
        city: {
          id: row.id,
          slug: row.city_slug,
          name_en: row.display_name_en,
          name_es: row.display_name_es,
          lat: row.latitude,
          lng: row.longitude,
          country_iso2: country?.iso2 ?? "",
          country_name_en: country?.name_en ?? "",
          country_name_es: country?.name_es ?? null,
        } satisfies CitySuggestion,
      };
      return [row.id, selection] as const;
    }),
  );

  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading profile…</p>}>
      <TalentMyProfileClient
        dashboard={result.data}
        taxonomy={tax.ok ? tax.data : null}
        initialResidence={
          byCityId.get(profile.residence_city_id ?? profile.location_id ?? "") ?? {
            country: null,
            city: null,
          }
        }
        initialOrigin={
          profile.origin_city_id
            ? (byCityId.get(profile.origin_city_id) ?? { country: null, city: null })
            : { country: null, city: null }
        }
        fieldCatalog={fieldCatalog}
        fieldValues={fieldValues}
        talentProfileId={profile.id}
      />
    </Suspense>
  );
}
