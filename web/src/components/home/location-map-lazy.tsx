"use client";

import dynamic from "next/dynamic";
import type { Locale } from "@/i18n/config";
import type { LocaleUrlSettings } from "@/i18n/pathnames";
import type { LocationItem, LocationSectionCopy } from "./location-section";

const LocationMapClient = dynamic(
  () => import("./location-map").then((mod) => mod.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="mt-10 h-[350px] w-full overflow-hidden rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 sm:h-[450px]" />
    ),
  },
);

export function LocationMapLazy(props: {
  locations: LocationItem[];
  locale: Locale;
  copy: LocationSectionCopy;
  apiKey?: string;
  publicPathPrefix?: string;
  /** Tenant URL grammar, forwarded from the server render. */
  localeUrl?: LocaleUrlSettings;
}) {
  return <LocationMapClient {...props} />;
}
