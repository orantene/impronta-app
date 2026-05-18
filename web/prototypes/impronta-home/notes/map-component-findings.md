# Map component — findings (do NOT rebuild)

The interactive Google Map "click a pin → reveal featured talent faces" component
**already exists in the repo**. It was located and re-verified.

## Primary component

**`web/src/components/home/location-map.tsx`** → `export function LocationMap(...)`
(verified at line 382; `@vis.gl/react-google-maps` import line 15;
`loc.featuredPreviews` consumed line 299;
`process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` line 397).

- Stack: **@vis.gl/react-google-maps** v1.8.3 (Google Maps JS).
- Wrapped by `web/src/components/home/location-section.tsx` → `LocationMapLazy`
  (lazy-loaded on agency/tenant homepages).
- Behaviour (exactly the remembered UX): dark/gold-themed Google map, animated
  gold pins; **click a pin → map pans + a portal overlay reveals an orbit of
  featured-talent avatars for that city + a "View Talents →" link** to the
  filtered directory. Graceful fallback if the API key is missing.
- Props: `locations: LocationItem[]` (`id, citySlug, displayName, countryCode,
  latitude, longitude, featuredPreviews`), `locale`, `copy: LocationSectionCopy`,
  `apiKey?`, `publicPathPrefix?`.
- Key/env: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser) / `GOOGLE_PLACES_API_KEY`
  (server) via `web/src/lib/env/google-maps-browser-key.ts`.
- Status: **production code**, not an experiment.

## Secondary / related (not the one to use)

- `web/src/app/(workspace)/[tenantSlug]/client/discover/map/DiscoverMapShell.tsx`
  — dense full-catalog discovery map (every talent pinned), different UX.
- `web/src/lib/google-places.ts` — Places autocomplete/geocoding for location
  *inputs*, not a visual map.
- Admin `ServiceAreaMap` (in `components/admin/shell/internal/drawers.tsx`) —
  non-interactive SVG travel-radius mini-map.

## Why it isn't embedded in the static prototype

`LocationMap` is a React component that needs the Google Maps JS SDK, a build
pipeline, and a referrer-allowed API key. A static, offline, double-click HTML
file cannot run it. So the prototype **mirrors its behaviour** instead of
rebuilding it.

## How the prototype is wired for the real drop-in

In `v5-editorial-placeholders/index.html` (and v4):

- Section "Talent near your event, shoot, production, or stay." = left map /
  right talent-faces preview panel. Clicking a pin (or hovering a zone) swaps
  the panel to that location's faces + an "Explore talent in {city} →" CTA —
  the same model as `LocationMap` + `featuredPreviews`.
- Drop-in points (search the file for these):
  - `<div id="talentMapMount">` — absolute-positioned mount target.
  - `.map.live` — class that hides the SVG fallback once the real map mounts.
  - `window.mountRealTalentMap(impl)` — call with an impl that renders
    `LocationMap` into the mount and forwards its pin click to `selectZone(id)`
    (the preview panel is already bound to `selectZone`).
  - Prototype zone `faces[]` map 1:1 to `LocationItem.featuredPreviews`.
- An HTML comment above `#map` repeats this with the component path.

**When this graduates to a real Next page:** render `<LocationMap locations=...
/>` into `#talentMapMount`, add `live` to `#map`, forward pin → `selectZone`.
No need to rebuild the section or the panel.
