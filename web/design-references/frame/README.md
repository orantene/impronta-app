# Frame reference mockup (DRAFT, superseded by the owner original)

> 2026-10-19 (O1): the source of truth is the owner screenshot `TH08-Frame.jpg`
> (1440px, kept outside the repo). The design in code was re-ported from it
> (`collection/frame-defaults.ts`, `frame-hero.ts`, `frame.golden.test.ts`):
> IBM Plex Sans Condensed / Plex Sans / Plex Mono, warm grey page, one red, dark
> hero panel, tag-filtered contact sheet. This dev-authored `index.html` and
> `kit.js` are kept only until the pack is rebuilt from the original; do not use
> them to judge fidelity.

- **Status:** DRAFT for PM review (TUL-328). Authored by the developer from the
  theme's existing tokens and sections (`buildFramePayload` + `gallery-meta.ts`),
  with the Folio/Gridline kit as the bar. Not an Oran artifact. Frame stays out of
  `FINISHED_GALLERY_SLUGS` until the PM approves this pack and the design gap
  (W-12 contact sheet tag filter and loupe) closes.
- **Demo talent in the mockup:** Tomás Aguilar, portrait photographer (TAL-93009).
  The portrait session and brand portrait are his live services; the corporate
  headshot is a draft service.
- **Palettes:** Gallery White (default), Darkroom, Film & Amber.
- **Type:** Space Grotesk 600 uppercase for headings, Inter for body.
- **Sections** (`data-w` units in `renderSite`):
  - header plus filter-bar navigation (one sticky block);
  - split hero, 40% text and 60% image;
  - 4-column contact sheet with captions (2 columns on phone);
  - service cards with category tabs;
  - contact band;
  - about.
- **Images:** copies of repo stock photos (`public/talent-templates/demo/impronta-2026`),
  standing in until the demo shoot.
- **Still missing before it can be finished:** `parity-map.json`, `content.json`, and
  a Factory publish followed by `npm run theme:pull-authored -- --design frame`.
- **Viewing locally:** serve `web/design-references` and open `/frame/`. `kit.js`
  drives the 390/360/1440 device switch and the journeys.
