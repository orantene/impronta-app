# Mono reference mockup (DRAFT)

- **Status:** DRAFT for PM review (TUL-328). Authored by the developer from the
  theme's existing tokens and sections (`buildMonoPayload` + `gallery-meta.ts`),
  with the Folio/Gridline kit as the bar. Not an Oran artifact. Mono stays out of
  `FINISHED_GALLERY_SLUGS` until the PM approves this pack and the design gap
  (no-nav header, inline 3-tap slot picker) closes.
- **Demo talent in the mockup:** Pablo Serrano, personal trainer (TAL-93010). The
  training session and 10-session package are his live services; the mobility
  assessment is a draft service.
- **Palettes:** Paper & Black (default), Cobalt, Carbon.
- **Type:** Inter Tight 800 for the statement and names, Inter for body.
- **Sections** (`data-w` units in `renderSite`):
  - minimal header (no nav links);
  - centered type-only statement;
  - compact price list with search and category pills (no photos);
  - three-question FAQ;
  - about, last.
- **Images:** copies of repo stock photos, used only in the booking sheet and chat.
- **Still missing before it can be finished:** `parity-map.json`, `content.json`, and
  a Factory publish followed by `npm run theme:pull-authored -- --design mono`.
- **Viewing locally:** serve `web/design-references` and open `/mono/`. `kit.js`
  drives the 390/360/1440 device switch and the journeys.
