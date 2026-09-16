# Templates & Imagery — 04 Looks v2 design bar (D-TPL-36)

**Owner, 2026-09-16, in person:** the ten v1 Looks are "old fashioned, bad looking"; the bar is "breathtaking … engagement, modern tech world … animation, slider, buttons, banners, colors". Recorded as D-TPL-36. This file is the bar every v2 Look is judged against, the references it comes from, and the builder vocabulary it is built with. Paths under `web/`.

## 1. Why v1 failed (honest)

The Looks were static stacks (`section → heading → paragraph → button`, a boxed hero card, three link cards, a 4-up gallery grid) on cream canvases. The renderer already shipped a modern vocabulary and the Looks used none of it: `carousel` (hero variant with Ken Burns, grain, crossfade, shared copy), `marquee`, `sticky_scroll`, `stats`, `before_after`, `video`, background media (video / slideshow / YouTube), 15 entrance presets with load / scroll / hover triggers, hover lanes (scale, translate, shadow, filter, parent-hover), `editorial-sticky` transparent header, `mesh-noir` / `aurora` backgrounds, pill radii, display type. v1 also carried a renderer defect for dark themes: the native kinds' secondary text was a fixed dark `rgba(18,18,18,…)`, invisible on a dark canvas (fixed in this branch: it now mixes from `--token-color-ink`).

## 2. References (looked at, 2026-09-16, 1440)

| Site | What to take |
|---|---|
| noma.dk | Full-bleed hero with the place itself, transparent header that turns solid on scroll, a single strong line + one button, large editorial image tiles, generous but not empty rhythm. |
| zumarestaurant.com | Full-viewport **video** hero, one centred line over it, dark canvas, oversized statement band ("contemporary Japanese cuisine") as the first thing after the hero, tabs for locations, light type on dark. |
| award-tier pattern (Awwwards restaurant category, repeated across nominees) | Ken Burns / slideshow heroes when there is no video, scroll-reveal on every section, marquee strip of words, sticky "story" sections that pin a picture while copy scrolls, peeking carousel galleries, hover lift + image zoom on cards, pill buttons, one accent colour against near-black or off-white. |

## 3. The bar (every v2 Look, every family)

1. **Hero is the whole viewport**, the tenant's own picture (Visual Asset Engine, PR #1994), slow Ken Burns + crossfade over 2–3 frames, grain, vignette scrim, the business name at display size, one line, two pill buttons. Header transparent over it.
2. **Motion on everything**: every section rises into view (`style.animationPreset` on scroll, staggered children), cards lift on hover, pictures zoom inside their frames, marquee runs, hero drifts. Reduced motion is honoured by the renderer.
3. **A statement**: one oversized line on a contrast band right after the hero (copy key `home.statement`, per Look, never a fact).
4. **A story, not link cards**: `sticky_scroll` with a pinned picture and three blocks (`home.story.n.*`), or lifting cards when the Look is light and airy.
5. **Gallery as a rail**: peeking slides, arrows, autoplay, 3 / 2 / 1 per view by device.
6. **Colour with intent**: one accent against near-black (dining, events, agency, craft) or against off-white with a saturated accent (beauty, wellness, education); no beige-on-beige. Palette from the owner's logo still recolours the Look (D-TPL-10, `candidatePalettesFromHexes`).
7. **Type with scale**: display preset for the name, editorial scale, uppercase tracked eyebrows.
8. **Rhythm**: no empty band taller than the content in it; `density.section-padding: airy` at most.
9. **Honesty unchanged**: no facts the brief did not state (marquee = the business's own words and nav words), every image a resolved slot or dropped (D-TPL-4), no type words in Look copy (static test).
10. **Evidence**: 1440 + 390 screenshots after a scroll pass **and a screen recording** of the hero, the reveals and the story, on the QA tenant; the owner judges the recording.

## 4. How it is built

`looks/v2-sections.ts`: `cinematicHero`, `marqueeBand`, `stickyStory`, `railGallery`, `liftCard`, `zoomPicture`, `reveal()` / `stagger()`. `LookRecipe` (`looks/shared.ts`) gained `hero: "cinematic"`, `gallery: "rail"`, `motion`, `marquee`, `statement`, `story: "sticky"`, `lift`; a v1 Look with none of them builds byte-for-byte as before. `instantiateSite` now resolves `look://image/<slot>` markers inside nested props (hero slides, `sticky_scroll.imageUrl`) and drops picture-led nodes whose picture did not resolve.

## 5. Order

1. `ember` (dining) — flagship, default for the dining family. **This branch.**
2. beauty, wellness flagships.
3. The remaining families, then retire or restyle the v1 Looks that no family defaults to.
