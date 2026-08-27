"use client";

import { useCallback, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import type { Locale } from "@/i18n/config";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { LocationMapLazy } from "./location-map-lazy";
import type { LocationItem, LocationSectionCopy } from "./location-section";

/**
 * The city chips and the map, sharing one selection.
 *
 * The chips used to be plain links straight to `/directory?location=…`, so
 * clicking a city left the page entirely and the map below it -- the thing the
 * section is built around -- was never used. A chip now flies the map to that
 * city's pin and opens its orbit ring; the ring's own "view talents" link is
 * what goes on to the directory. The journey is the same, it just happens in
 * the section instead of skipping it.
 *
 * THE CHIPS ARE STILL REAL LINKS. `href` is intact, so they are crawlable,
 * middle-clickable and cmd-clickable, and they still work with JavaScript off.
 * Only an unmodified left-click is intercepted -- the one case where staying
 * on the page is better than leaving it.
 */
export function LocationCityBoard({
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
  mapsApiKey?: string;
  publicPathPrefix?: string;
  localeUrl?: LocaleUrlSettings;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);

  const handleChipClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, loc: LocationItem) => {
      // Let the browser do its normal thing for every deliberate
      // open-somewhere-else gesture.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      // A city with no coordinates cannot be flown to, so that chip keeps its
      // original behaviour and navigates rather than doing nothing at all.
      if (loc.latitude == null || loc.longitude == null) return;

      event.preventDefault();
      setSelectedId((current) => (current === loc.id ? null : loc.id));
      // Bring the map into view: on a phone the chips sit above the fold and
      // the map does not, so without this the chip would appear to do nothing.
      mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [],
  );

  return (
    <>
      {/* Horizontal scroll on mobile, wrap on desktop */}
      <div className="-mx-4 mt-10 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:overflow-x-visible sm:px-0 sm:pb-0">
        <div className="flex w-max gap-3 sm:w-auto sm:flex-wrap sm:justify-center sm:gap-4">
          {locations.map((loc) => {
            const active = selectedId === loc.id;
            return (
              <a
                key={loc.id}
                href={withLocalePath(
                  prefixPublicHref(
                    `/directory?location=${loc.citySlug}`,
                    publicPathPrefix,
                  ),
                  locale,
                  localeUrl,
                )}
                onClick={(event) => handleChipClick(event, loc)}
                aria-pressed={active}
                className={`group flex shrink-0 items-center gap-2.5 rounded-[var(--site-radius)] border bg-[var(--impronta-surface)] px-4 py-3 transition-all hover:bg-[var(--impronta-gold)]/5 ${
                  active
                    ? "border-[var(--impronta-gold)]"
                    : "border-[var(--impronta-gold-border)] hover:border-[var(--impronta-gold)]/40"
                }`}
              >
                <MapPin className="size-4 text-[var(--impronta-gold)]" />
                <div>
                  <span
                    className={`block text-sm font-medium transition-colors group-hover:text-[var(--impronta-gold)] ${
                      active ? "text-[var(--impronta-gold)]" : "text-foreground"
                    }`}
                  >
                    {loc.displayName}
                  </span>
                  <span className="text-xs text-[var(--impronta-muted)]">
                    {loc.talentCount === 1
                      ? copy.talentCountOne
                      : copy.talentCountMany.replace(
                          "{count}",
                          String(loc.talentCount),
                        )}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      <div ref={mapWrapRef}>
        <LocationMapLazy
          locations={locations}
          locale={locale}
          copy={copy}
          apiKey={mapsApiKey}
          publicPathPrefix={publicPathPrefix}
          localeUrl={localeUrl}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
        />
      </div>
    </>
  );
}
