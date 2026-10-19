# Frame reference mockup (DRAFT)

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
