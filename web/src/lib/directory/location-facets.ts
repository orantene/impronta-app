/**
 * Canonical location facets for the public directory.
 *
 * ─── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 *
 * The country and city facets were built from `home_country_text` /
 * `home_city_text` — denormalized FREE TEXT on the discover matview — and the
 * grouping key was `country.toLowerCase()`. Case folded; diacritics did not.
 * Measured on production, 2026-09-05:
 *
 *     Mexico   41  ┐ folded together by .toLowerCase() and by .ilike()
 *     mexico    2  ┘
 *     México    4    A SECOND, RIVAL BUCKET
 *     Argentina 2
 *
 * So `?country=Mexico` returned 43 profiles and `?country=México` returned 4,
 * disjoint, with nothing on screen suggesting a second Mexico existed. Four
 * talents were unreachable from the bucket a buyer would actually click.
 *
 * Worse, the CITY facet composed its label from the two free-text fields
 * INDEPENDENTLY, so a row could pair a city with a country it is not in. The
 * live page carried `Buenos Aires, Mexico`, and a card read
 * `Playa Del Carmen, Argentina`.
 *
 * ─── WHY THIS READS THE FOREIGN KEY INSTEAD ─────────────────────────────────
 *
 * `talent_discover_index.residence_city_id` points at `locations`, which
 * carries `country_code` and a per-locale display name, and `countries` holds
 * exactly ONE Mexico row. Deriving both the city AND its country from that one
 * row makes the whole class of defect structurally impossible:
 *
 *   - one Mexico, because there is one row for it;
 *   - "Buenos Aires, Mexico" cannot be produced, because the country is read
 *     from the city's own row rather than from a second free-text field.
 *
 * It is also strictly BETTER coverage, which is the part worth checking before
 * trusting a migration away from free text. On production today 52 of the 53
 * listed profiles carry the city FK, while only 49 carry usable country text.
 * The single FK-less profile drops out of the location facets until its
 * residence is set — it has no city today either, so nothing that was
 * filterable becomes unfilterable.
 *
 * ─── OLD LINKS STILL WORK ───────────────────────────────────────────────────
 *
 * URL params stay human-readable (`?country=Mexico&city=Playa del Carmen`) and
 * are matched against the canonical values through `normalizeLocationKey`, so
 * an existing `?country=México` link now resolves to the one Mexico bucket and
 * returns all 50 rather than 4. Nothing that used to work stops working.
 */

/**
 * Fold a location string to a comparison key: strip diacritics, lowercase,
 * collapse whitespace.
 *
 * The diacritic strip is the whole point. `toLowerCase()` alone was already in
 * place and is exactly what let "México" survive as a rival bucket — a fold
 * that handles one axis of variation reads as if it handles them all.
 */
export function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type CanonicalLocation = {
  locationId: string;
  city: string;
  country: string | null;
  cityKey: string;
  countryKey: string | null;
};

/** `locations` row shape, as selected below. */
type LocationRow = {
  id: string;
  country_code: string | null;
  city_slug: string | null;
  display_name_i18n: Record<string, string> | null;
};

type CountryRow = { iso2: string; name_en: string | null; name_es: string | null };

/**
 * Build the id → canonical (city, country) map the facets and filters share.
 *
 * Both must read the SAME derivation or they drift, which is the failure the
 * free-text version had: the facet grouped one way (`toLowerCase`) and the
 * filter matched another (`ilike`, accent-sensitive), so a bucket could be
 * displayed that its own filter could not reproduce.
 */
export function buildLocationCatalog(
  locations: LocationRow[],
  countries: CountryRow[],
  locale: string,
): Map<string, CanonicalLocation> {
  const byIso = new Map<string, CountryRow>();
  for (const c of countries) byIso.set(c.iso2.toUpperCase(), c);

  const out = new Map<string, CanonicalLocation>();
  for (const loc of locations) {
    const i18n = loc.display_name_i18n ?? {};
    // Fall back through locale → en → the slug, so a location missing a
    // translation still yields a bucket rather than silently vanishing.
    const city =
      i18n[locale]?.trim() || i18n.en?.trim() || loc.city_slug?.trim() || null;
    if (!city) continue;

    const iso = loc.country_code?.toUpperCase() ?? null;
    const countryRow = iso ? byIso.get(iso) : undefined;
    const country =
      (locale === "es" ? countryRow?.name_es : countryRow?.name_en)?.trim() ||
      countryRow?.name_en?.trim() ||
      null;

    out.set(loc.id, {
      locationId: loc.id,
      city,
      country,
      cityKey: normalizeLocationKey(city),
      countryKey: country ? normalizeLocationKey(country) : null,
    });
  }
  return out;
}

/**
 * The location ids a `?country=` / `?city=` pair selects.
 *
 * Returns `[]` when the params match nothing — which callers must treat as "no
 * results", NOT as "no filter". A filter that silently becomes a no-op when it
 * cannot be resolved is how a scoped page quietly starts showing everything.
 */
export function resolveLocationFilterIds(
  catalog: Map<string, CanonicalLocation>,
  filter: { country?: string | null; city?: string | null },
): string[] {
  const countryKey = filter.country ? normalizeLocationKey(filter.country) : null;
  const cityKey = filter.city ? normalizeLocationKey(filter.city) : null;
  if (!countryKey && !cityKey) return [];

  const ids: string[] = [];
  for (const loc of catalog.values()) {
    if (countryKey && loc.countryKey !== countryKey) continue;
    if (cityKey && loc.cityKey !== cityKey) continue;
    ids.push(loc.locationId);
  }
  return ids;
}

export type LocationFacets = {
  countries: Array<{ value: string; count: number }>;
  cities: Array<{ city: string; country: string | null; count: number }>;
};

/**
 * Aggregate country and city facets from residence FKs.
 *
 * A city keeps its country on the row (`{city, country}`) because the same
 * city name can exist in two countries and the filter scopes by both. That is
 * unchanged; what changed is that the pair now comes from ONE row instead of
 * two independent strings.
 */
export function buildLocationFacets(
  rows: Array<{ residence_city_id: string | null }>,
  catalog: Map<string, CanonicalLocation>,
): LocationFacets {
  const countryAgg = new Map<string, { display: string; count: number }>();
  const cityAgg = new Map<
    string,
    { city: string; country: string | null; count: number }
  >();

  for (const row of rows) {
    if (!row.residence_city_id) continue;
    const loc = catalog.get(row.residence_city_id);
    if (!loc) continue;

    if (loc.country && loc.countryKey) {
      const cur = countryAgg.get(loc.countryKey);
      countryAgg.set(loc.countryKey, {
        display: cur?.display ?? loc.country,
        count: (cur?.count ?? 0) + 1,
      });
    }

    // JSON key so a separator character can never collide with a city name.
    const mapKey = JSON.stringify([loc.cityKey, loc.countryKey]);
    const cur = cityAgg.get(mapKey);
    cityAgg.set(mapKey, {
      city: cur?.city ?? loc.city,
      country: loc.country,
      count: (cur?.count ?? 0) + 1,
    });
  }

  return {
    countries: Array.from(countryAgg.values())
      .map(({ display, count }) => ({ value: display, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    cities: Array.from(cityAgg.values()).sort(
      (a, b) => b.count - a.count || a.city.localeCompare(b.city),
    ),
  };
}
