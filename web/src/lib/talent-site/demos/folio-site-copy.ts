/**
 * Folio demo page copy.
 *
 * The Folio design ships neutral wording on purpose (chapter titles, credits, the cover
 * line, the rates note and the closing lines are design-owned editable defaults, never a
 * talent's claims). Every Folio demo shows the mockup's model wording the way a talent
 * would write it in the builder: through the site-copy mechanism (`site-copy.ts`,
 * `DemoSiteCopy.folio`). This text lives here and nowhere in the design payload.
 * Same strings the demos always showed, so they look the same; the ES site reads them
 * through `design-label-locale.ts`.
 */
import type { FolioSiteCopy } from "./site-copy";

export const FOLIO_DEMO_SITE_COPY: FolioSiteCopy = {
  chapters: [
    { heading: "Editorial", creditLine: "Demo studio credit · CDMX", tocCredit: "Studio, hard light" },
    { heading: "Runway", creditLine: "Demo show credit · 3 exits", tocCredit: "Exits and details" },
  ],
  coverStatement: "Editorial, runway and campaigns.",
  ratesSubtitle: "Base rates in MXN. Ad use and travel are quoted separately.",
  footerCredit: "mateoferrer.tulala.digital",
  footerContact: "For editorials, runway and campaigns. I reply the same day.",
  shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
};
