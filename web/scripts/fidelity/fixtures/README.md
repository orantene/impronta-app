# Fidelity fixtures

Real photography for the fidelity harness. Honest Asset scoring needs real
photos — initials-in-a-box, abstract SVG shapes, and UI wireframe mockups read
"unfinished" and score low.

These are **not duplicated binaries**. `scripts/fidelity/fixtures.ts` resolves a
stable alias (e.g. `studioScene`, `vocalistPortrait`) to a **root-relative** src
(e.g. `/marketing/photos/talent-services-hero.jpg`) pointing at a genuine
photograph that already ships in `web/public/marketing/photos/*.jpg`.

Why root-relative and not `file://` / `data:`: the renderer validates every
image `src` via `isSafeBuilderImageSrc`, which accepts ONLY `http(s)` or
root-relative `/…` and **drops** `file://` and `data:` (a `data:` SVG renders
nothing — it returns `null`). So `capture.ts` and the e2e golden spec serve
`web/public` over a localhost static server (`server.ts`) and navigate via http;
the server maps `/marketing/…` back to `web/public/marketing/…`. Offline,
deterministic, and the renderer guard is never loosened.

The `public/talent-templates/*.webp` files are deliberately NOT aliased here —
they are template-preview wireframes (grey placeholder boxes + dummy headlines),
exactly the placeholder imagery the Asset axis penalises.

Usage from a design tree:

```ts
import { fidelityPhotoSrc } from "../fixtures";

{ kind: "image", props: { src: fidelityPhotoSrc("vocalistPortrait"), alt: "…" } }
```

The same root-relative src is also embedded in a design's `dataSources.collections`
records so a P3 repeater can bind `{{imageUrl}}` to a real photo per card.

The resolver throws if the underlying file is missing, so a renamed/removed asset
fails the capture loudly instead of painting a broken image and quietly tanking
the Asset score. To add a photo, drop it in `web/public/marketing/photos/…` and
add an alias to `FIDELITY_PHOTOS` in `fixtures.ts`.
