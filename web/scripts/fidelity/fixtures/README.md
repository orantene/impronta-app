# Fidelity fixtures

Real photography for the fidelity harness. Honest Asset scoring needs real
photos — initials-in-a-box / abstract SVG shapes read "unfinished" and score low.

These are **not duplicated binaries**. `scripts/fidelity/fixtures.ts` resolves a
stable alias (e.g. `portraitWarm`, `lifestyleServices`) to an absolute `file://`
URL pointing at a photo that already ships in `web/public/`
(`public/talent-templates/*.webp`, `public/marketing/photos/*.jpg`). `capture.ts`
loads the page via `page.goto("file://…")`, so these `file://` image srcs paint
reliably and offline (large `data:` URIs hang `setContent` — do not use them).

Usage from a design tree:

```ts
import { fidelityPhotoUrl } from "./fixtures";

{ kind: "image", props: { src: fidelityPhotoUrl("portraitWarm"), alt: "…" } }
```

The resolver throws if the underlying file is missing, so a renamed/removed asset
fails the capture loudly instead of painting a broken image and quietly tanking
the Asset score. To add a photo, drop it in `web/public/…` and add an alias to
`FIDELITY_PHOTOS` in `fixtures.ts`.
