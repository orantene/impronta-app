import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { LocationMapLazy } from "./location-map-lazy";

export type LocationFeaturedPreview = {
  talentId: string;
  thumbnailUrl: string | null;
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

        {/* Horizontal scroll on mobile, wrap on desktop */}
        <div className="-mx-4 mt-10 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:overflow-x-visible sm:px-0 sm:pb-0">
          <div className="flex w-max gap-3 sm:w-auto sm:flex-wrap sm:justify-center sm:gap-4">
            {locations.map((loc) => (
              <Link
                key={loc.id}
                href={withLocalePath(
                  prefixPublicHref(
                    `/directory?location=${loc.citySlug}`,
                    publicPathPrefix,
                  ),
                  locale,
                  localeUrl,
                )}
                className="group flex shrink-0 items-center gap-2.5 rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-4 py-3 transition-all hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5"
              >
                <MapPin className="size-4 text-[var(--impronta-gold)]" />
                <div>
                  <span className="block text-sm font-medium text-foreground transition-colors group-hover:text-[var(--impronta-gold)]">
                    {loc.displayName}
                  </span>
                  <span className="text-xs text-[var(--impronta-muted)]">
                    {loc.talentCount === 1
                      ? copy.talentCountOne
                      : copy.talentCountMany.replace("{count}", String(loc.talentCount))}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <LocationMapLazy
          locations={locations}
          locale={locale}
          copy={copy}
          apiKey={mapsApiKey}
          publicPathPrefix={publicPathPrefix}
          localeUrl={localeUrl}
        />
      </div>
    </section>
  );
}
