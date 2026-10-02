# Folio (TH02) reference mockup

- Source: https://claude.ai/artifact/QHVfJH5oHTc2EkM2VKXpR2 (version 1790720296-f2ef), 18 files.
- Captured: 2026-09-30. `index.html` defines the theme; `kit.js` is the shared review kit; `img/` holds the photos; `demos.json` + `demos-tab.js` list the planned demo talents (no passwords).
- Reference demo: Mateo Ferrer, TAL-93011. His content must equal the mockup's (4 services, comp card, tagline, bio).
- Palettes: Default (stone), Light neutral, Dark contrast. Type: Instrument Serif (display), Archivo Narrow (labels), Archivo (body). Square corners, 1 px rules.

## Units (`data-w` and selectors)
| Section | Selector | `data-w` | Builder map status |
|---|---|---|---|
| Header | `.fo-hdr` | (masthead bar) | Existing widget |
| Cover | `.fo-name` + `.fo-spread .fo-cover` | `hero · magazine-cover` | New variant (stacked giant name over image) |
| Contents | `.fo-toc` | (anchor index) | Section preset |
| Chapters | `#ch1`, `#ch2` (`.fo-ch`) | `portfolio · chapter-sequence` | New widget (sticky chapter head on desktop) |
| Comp card | `.fo-comp` | `stats · measure-strip` | Existing widget + proposed per-field visibility |
| Rate card | `#rates` | `services_catalog · rate-card` | New variant (hairline rows, no photos) |
| Contact CTA | `.fo-end` | (statement footer) | Existing widget |
