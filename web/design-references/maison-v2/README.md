# Maison v2 reference mockup

- Source: https://claude.ai/artifact/NwPUiuw85SrcFWHjogZ13j (tabs: Experience, Dev handoff, Builder map)
- Captured: 2026-09-30, single-file export (`index.html`, about 264 KB). Images load from images.unsplash.com.
- Reference demo: Alba, TAL-93020 (Rosé palette). Her content must equal the mockup's.
- Device switch: `#devseg button[data-d=390|360|1440]`. Journey steps: `#steps button[data-step=N]`.

## Units (`data-w`)
| Section | Selector | `data-w` |
|---|---|---|
| Header | `.m-hdr` | `site_header · minimal` |
| Hero | `section.hero` | `hero · editorial-split` |
| Recent work | `#s-work` | `portfolio · filmstrip` |
| Menu | `#s-menu` | `services_catalog · list-thumbs + category-rail` |
| Reviews | `#s-revs` | `reviews · quote-cards` |
| About | `#s-about` | `about · portrait-arch` |
| FAQ | `#s-faq` | `faq · accordion` |
| Location | `#s-loc` | `location_map · editorial (no provider)`, `location_map · fallback`, `location · not provided` |
| Footer | `#s-foot` (`.ft`) | `footer · talent (light editorial)` |
| Bottom strip | `.bstrip` | `bottom_strip · shared by all themes` |
| Docks | | `selection_dock · idle/active`, `chat_dock · thread/service_browser` |
| Policy pages | `.ppage` | `policy_page · shared layout`, `booking conditions summary · from settings` |

Note: the id `s-loc` appears twice in the file (location variants); match by `data-w`, not id.
