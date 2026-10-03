/**
 * Folio demo page copy (Wave 2: per-demo cover lines, not one shared caption).
 *
 * The Folio design ships neutral wording on purpose. Every Folio demo fills it
 * through site-copy (`site-copy.ts`, `DemoSiteCopy.folio`). Same mechanism;
 * each demo gets its own cover / chapters / footer so Lucía ≠ Rafa ≠ Mateo.
 */
import type { FolioSiteCopy } from "./site-copy";

/** Mateo (reference) copy — kept as the default for unknown Folio codes. */
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

const BY_CODE: Readonly<Record<string, FolioSiteCopy>> = {
  "TAL-93011": FOLIO_DEMO_SITE_COPY,
  "TAL-93004": {
    chapters: [
      { heading: "Editorial", creditLine: "Luz natural · CDMX", tocCredit: "Exteriores y estudio" },
      { heading: "Campaña", creditLine: "Catálogo y UGC", tocCredit: "Marca y redes" },
    ],
    coverStatement: "Editorial, catalogue and campaigns in Mexico City.",
    ratesSubtitle: "Base rates in MXN. Ad use and travel are quoted separately.",
    footerCredit: "lucia-herrera.tulala.digital",
    footerContact: "For editorials, catalogue and campaigns. I reply the same day.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
  },
  "TAL-93109": {
    chapters: [
      { heading: "Lifestyle", creditLine: "Dallas · DFW", tocCredit: "On location" },
      { heading: "Commercial", creditLine: "Photo and video", tocCredit: "Brand days" },
    ],
    coverStatement: "Commercial and lifestyle work in Dallas.",
    ratesSubtitle: "Base rates in USD. Usage rights are quoted by media and term.",
    footerCredit: "priya-shah.tulala.digital",
    footerContact: "For lifestyle and commercial bookings. Clear quotes, same day.",
    shoeLabel: { en: "Shoe US", es: "Calzado US" },
  },
  "TAL-93110": {
    chapters: [
      { heading: "Activewear", creditLine: "Gym and beach · Miami", tocCredit: "Movement" },
      { heading: "Campaign", creditLine: "Fitness brands", tocCredit: "Full day" },
    ],
    coverStatement: "Fitness and activewear modeling in Miami.",
    ratesSubtitle: "Base rates in USD. Usage rights are quoted by media and term.",
    footerCredit: "andre-castillo.tulala.digital",
    footerContact: "For activewear, gym and wellness brands. Clear quotes.",
    shoeLabel: { en: "Shoe US", es: "Calzado US" },
  },
  "TAL-93111": {
    chapters: [
      { heading: "Pasarela", creditLine: "Shows · CDMX", tocCredit: "Ensayo y salida" },
      { heading: "Showroom", creditLine: "Presentaciones", tocCredit: "Compradores y prensa" },
    ],
    coverStatement: "Runway and collection presentations in Mexico City.",
    ratesSubtitle: "Base rates in MXN. Travel outside CDMX is quoted separately.",
    footerCredit: "noemi-castaneda.tulala.digital",
    footerContact: "For runway and showroom dates. I reply the same day.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
  },
  "TAL-93112": {
    chapters: [
      { heading: "Jewelry", creditLine: "Studio · Brooklyn", tocCredit: "Hands only" },
      { heading: "Product", creditLine: "Video demos", tocCredit: "Repeatable moves" },
    ],
    coverStatement: "Hand modeling for jewelry and product in New York.",
    ratesSubtitle: "Base rates in USD. Usage rights are quoted by media and term.",
    footerCredit: "daniel-kim.tulala.digital",
    footerContact: "Hands only. Clear rates by the hour or by the day.",
    shoeLabel: { en: "N/A", es: "N/A" },
  },
  "TAL-93113": {
    chapters: [
      { heading: "Lifestyle", creditLine: "San Miguel de Allende", tocCredit: "Hoteles y retrato" },
      { heading: "Editorial", creditLine: "Canas y arrugas", tocCredit: "Como son" },
    ],
    coverStatement: "Mature lifestyle and editorial portraits in San Miguel.",
    ratesSubtitle: "Base rates in MXN. Shoots outside San Miguel include travel.",
    footerCredit: "elena-garza-trevino.tulala.digital",
    footerContact: "For hotels, retreats and editorial portraits. Spanish or English.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
  },
  "TAL-93114": {
    chapters: [
      { heading: "Modelaje", creditLine: "Hoteles y playa · Vallarta", tocCredit: "Campaña" },
      { heading: "Música", creditLine: "Acústico y ceremonia", tocCredit: "En vivo" },
    ],
    coverStatement: "Model and singer for campaigns and live sets in Vallarta.",
    ratesSubtitle: "Base rates in MXN. Photo and music can be booked together.",
    footerCredit: "rafa-cuevas.tulala.digital",
    footerContact: "Photo by day, live music by night. Tell me the date and I will propose.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
  },
};

export function folioSiteCopyFor(profileCode: string): FolioSiteCopy {
  return BY_CODE[profileCode] ?? FOLIO_DEMO_SITE_COPY;
}
