"use client";

import dynamic from "next/dynamic";
import type { DiscoverMapPoint } from "./shared";

const MapClient = dynamic(
  () => import("./MarketingDirectoryMapClient").then((m) => m.MarketingDirectoryMapClient),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-[22px]"
        style={{
          height: "clamp(240px, 38vh, 420px)",
          background: "var(--plt-bg-deep)",
          border: "1px solid var(--plt-hairline)",
        }}
      />
    ),
  },
);

/** Lazy boundary so the Google Maps bundle only loads in the map view. */
export function MarketingDirectoryMap(props: {
  points: DiscoverMapPoint[];
  apiKey: string | null;
  unmappedCount: number;
  onBackToGrid: () => void;
}) {
  return <MapClient {...props} />;
}
