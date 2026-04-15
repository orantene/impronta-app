"use client";

import dynamic from "next/dynamic";
import type { Locale } from "@/i18n/config";
import type { LocationItem, LocationSectionCopy } from "./location-section";

const LocationMapClient = dynamic(
  () => import("./location-map").then((mod) => mod.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="mt-10 h-[350px] w-full overflow-hidden rounded-xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 sm:h-[450px]" />
    ),
  },
);

export function LocationMapLazy(props: {
  locations: LocationItem[];
  locale: Locale;
  copy: LocationSectionCopy;
  apiKey?: string;
}) {
  return <LocationMapClient {...props} />;
}
