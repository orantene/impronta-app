# Solace reference mockup (DRAFT)

- **Status:** DRAFT for PM review (TUL-328). Authored by the developer from the
  theme's existing tokens and sections (`buildSolacePayload` + `gallery-meta.ts`),
  with the Folio/Gridline kit as the bar. Not an Oran artifact. Solace stays out of
  `FINISHED_GALLERY_SLUGS` until the PM approves this pack and the design gap
  (W-10 rotating word, studio/villa toggle) closes.
- **Demo talent in the mockup:** Valeria Ortiz, dance instructor (TAL-93001). The
  private class, 4-class package and first-dance choreography are her live services.
- **Palettes:** Linen & Clay (default), Eucalyptus, Dusk.
- **Type:** Cormorant Garamond 300 for headings, Inter for body.
- **Sections** (`data-w` units in `renderSite`):
  - overlay nav over the cover;
  - full-bleed cover (wide photo on desktop, tall photo on phone);
  - centered about;
  - single-column services with round photos;
  - two-photo space pair;
  - centered contact with FAQ.
- **Images:** copies of repo stock photos (`public/talent-templates/demo/impronta-2026`),
  standing in until the demo shoot.
- **Viewing locally:** serve `web/design-references` and open `/solace/`. `kit.js`
  drives the 390/360/1440 device switch and the journeys.
- **Pack files:** `parity-map.json` (section map keyed by the mockup `data-w` units, with the
  expectations the parity tool checks) and `content.json` (the reference demo's content,
  taken from the mockup) are in place. Both are drafted from the mockup, not from an
  Oran artifact.
- **Status:** ready for Oran's pack approval. Not yet done: Factory publish, then
  `npm run theme:pull-authored -- --design solace`; the design gap in
  `COLLECTION_DESIGN_GAPS` stays open until then.
