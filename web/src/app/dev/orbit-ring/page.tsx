/**
 * Dev harness for the location orbit ring.
 *
 * The ring normally lives inside a Google Map, and the Maps browser key does
 * not authorise localhost -- the map returns RefererNotAllowedMapError and
 * renders nothing, so the ring cannot be seen or tuned on a dev machine at all.
 * The ring itself is plain React and has no Maps dependency, so this page mounts
 * it directly on the same dark ground it sits on in production.
 *
 * Dev-only route, in the existing `app/dev/*` family. Not linked from anywhere.
 */

"use client";

import { useState } from "react";

import { LocationMapPinPreview } from "@/components/home/location-map-pin-preview";
import type {
  LocationFeaturedPreview,
  LocationSectionCopy,
} from "@/components/home/location-section";

const COPY: LocationSectionCopy = {
  sectionKicker: "Where we work",
  sectionTitle: "Local faces, international reach",
  talentCountOne: "{count} talent",
  talentCountMany: "{count} talent",
  viewTalents: "View talents",
  mapLoadErrorTitle: "",
  mapLoadErrorBody: "",
  mapLoadErrorOpenConsole: "",
  mapPinPreviewAria: "Talent working in {city}",
  mapPinPreviewPhotoAlt: "Talent photo",
};

/**
 * Twelve faces, matching the busiest real ring. Remote placeholder portraits so
 * the counter-rotation is judged against actual faces -- a coloured circle
 * looks upright at every angle and would prove nothing.
 */
const ITEMS: LocationFeaturedPreview[] = [
  { talentId: "dev-0", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/eae359e0-636f-44d1-b326-78467373bbeb/gallery/01407da8-db42-4c77-bf59-82cb3b385d40.jpg", name: "Anto", profileCode: "dev-code-0" },
  { talentId: "dev-1", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/514fe737-3f73-4b24-b34f-43e9ffd27aca/hero/c8eabc5a-c96b-4061-9fc8-96dec6bcd54a.jpg", name: "Tina", profileCode: "dev-code-1" },
  { talentId: "dev-2", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/514fe737-3f73-4b24-b34f-43e9ffd27aca/gallery/a19c71fa-be04-41a4-bb6b-4c565db8a0d1.jpg", name: "Nalea", profileCode: "dev-code-2" },
  { talentId: "dev-3", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/a0faa883-0a78-44d7-8f47-d0a69092301e/gallery/95551db4-d8bb-443a-adc0-ebac726aaf7d.jpg", name: "Annher", profileCode: "dev-code-3" },
  { talentId: "dev-4", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/42b0d16f-de76-49f3-bc98-f80b5bba377d/hero/1e2e6267-523f-4fb8-856d-b1586447da05.jpg", name: "Sofia", profileCode: "dev-code-4" },
  { talentId: "dev-5", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/f4408612-baaf-46d4-967b-a924a1f450a1/hero/783a758a-648c-4ee0-a7a2-15cad6cb6668.jpg", name: "Carmen", profileCode: "dev-code-5" },
  { talentId: "dev-6", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/1d6bcec0-874d-427d-90ce-9f9c8f0e8929/gallery/f43b5a52-02da-4afc-91aa-1bbef6824474.jpg", name: "Luis", profileCode: "dev-code-6" },
  { talentId: "dev-7", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/c81c1651-918d-4869-941b-4655e01620d7/gallery/f1c26299-9f32-4691-9659-628dc999ddec.jpg", name: "Marco", profileCode: "dev-code-7" },
  { talentId: "dev-8", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/7d4c1db2-073f-4819-aee9-0309ee792066/hero/f9cf9e21-f8be-4437-8f07-86aaad4bb4ba.jpg", name: "Chris", profileCode: "dev-code-8" },
  { talentId: "dev-9", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/1d6bcec0-874d-427d-90ce-9f9c8f0e8929/card/b384df06-fb20-4501-90fe-7240dd84459d.jpg", name: "Mia", profileCode: "dev-code-9" },
  { talentId: "dev-10", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/878cb63f-6999-4ed3-8469-35e5a2a1c17a/card/623f00fc-1dbf-48b1-8fe2-88b553cbf995.jpg", name: "Rosa", profileCode: "dev-code-10" },
  { talentId: "dev-11", thumbnailUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/29f37f50-d65c-46f7-a3f1-273e847e7c2d/gallery/fa39ea33-e5e5-4fec-a486-da3402b797ea.jpg", name: "Elena", profileCode: "dev-code-11" },
];

export default function OrbitRingDevPage() {
  const [picked, setPicked] = useState<LocationFeaturedPreview | null>(null);
  return (
    <main style={{ background: "#0a0a0a", minHeight: "100vh", color: "#eee" }}>
      <div style={{ padding: "28px 32px" }}>
        <h1 style={{ fontSize: 15, letterSpacing: "0.18em", textTransform: "uppercase", color: "#c9a227" }}>
          Orbit ring · dev harness
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginTop: 8, maxWidth: 680, lineHeight: 1.6 }}>
          Faces stay upright as the ring turns, hang from their top edge so the
          weight reads as being in the body, and can be dragged and thrown.
          Tap a face for its name. Not reachable from the site.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0 80px" }}>
        <div
          style={{
            position: "relative",
            width: 640,
            height: 420,
            borderRadius: 12,
            border: "1px solid rgba(201,162,39,0.25)",
            background:
              "radial-gradient(60% 60% at 50% 45%, rgba(201,162,39,0.05), rgba(0,0,0,0) 70%), #0d0d0d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LocationMapPinPreview
            items={ITEMS}
            copy={COPY}
            locationLabel="Playa del Carmen"
            onSelect={setPicked}
            selectedTalentId={picked?.talentId ?? null}
          />
        </div>
      </div>

      {/* Mirrors what LocationMap renders under the real map: the picked
          talent's profile link, which PERSISTS after the floating name fades. */}
      <div style={{ display: "flex", justifyContent: "center", minHeight: 38 }}>
        {picked ? (
          <a
            href={`/t/${picked.profileCode}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              border: "1px solid rgba(201,162,39,0.45)",
              color: "#c9a227",
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            {picked.name} <span aria-hidden>&rarr;</span>
          </a>
        ) : (
          <span style={{ fontSize: 11, color: "#555" }}>
            Tap a face — the name floats and fades, this link stays.
          </span>
        )}
      </div>
    </main>
  );
}
