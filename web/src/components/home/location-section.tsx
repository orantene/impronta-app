import type { Locale } from "@/i18n/config";
import type { LocaleUrlSettings } from "@/i18n/pathnames";
import { LocationCityBoard } from "./location-city-board";

export type LocationFeaturedPreview = {
  talentId: string;
  thumbnailUrl: string | null;
  /**
   * Shown as the floating label when a visitor taps a face in the orbit ring.
   * Null when the profile has no display name, in which case the ring shows no
   * label rather than inventing one.
   */
  name: string | null;
  /**
   * `talent_profiles.profile_code` -- the EXACT code the public profile route
   * keys on. The href is assembled at the call site so it picks up the tenant
   * path prefix and locale grammar (see featured-talent-section.tsx). Null when
   * the profile has no code, in which case the ring offers no profile link.
   */
  profileCode: string | null;
};

export type LocationItem = {
  id: string;
  citySlug: string;
  displayName: string;
  countryCode: string;
  talentCount: number;
  latitude: number | null;
  longitude: number | null;
  featuredPreviews: LocationFeaturedPreview[];
};

export type LocationSectionCopy = {
  sectionKicker: string;
  sectionTitle: string;
  talentCountOne: string;
  talentCountMany: string;
  viewTalents: string;
  mapLoadErrorTitle: string;
  mapLoadErrorBody: string;
  mapLoadErrorOpenConsole: string;
  mapPinPreviewAria: string;
  mapPinPreviewPhotoAlt: string;
};

export function LocationSection({
  locations,
  locale,
  copy,
  mapsApiKey,
  publicPathPrefix = "",
  localeUrl,
}: {
  locations: LocationItem[];
  locale: Locale;
  copy: LocationSectionCopy;
  /** Maps JS API key; from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or server fallback `GOOGLE_PLACES_API_KEY`. */
  mapsApiKey?: string;
  publicPathPrefix?: string;
  /**
   * Tenant URL grammar for locale prefixing: the tenant's DEFAULT locale is
   * served unprefixed, every other supported locale under `/{code}`. Omitting it
   * falls back to the PLATFORM grammar, which inverts the prefixing on any
   * tenant whose default locale is not the platform default, so every link
   * emitted here would 308-redirect on click.
   */
  localeUrl?: LocaleUrlSettings;
}) {
  if (locations.length === 0) return null;

  return (
    <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {copy.sectionKicker}
        </h2>
        <p className="mt-2 text-center text-2xl font-light tracking-wide text-foreground sm:text-3xl">
          {copy.sectionTitle}
        </p>

        <LocationCityBoard
          locations={locations}
          locale={locale}
          copy={copy}
          mapsApiKey={mapsApiKey}
          publicPathPrefix={publicPathPrefix}
          localeUrl={localeUrl}
        />
      </div>
    </section>
  );
}
