/**
 * Folio demo page copy (Wave 2: per-demo cover lines, not one shared caption).
 *
 * The Folio design ships neutral wording on purpose. Every Folio demo fills it
 * through site-copy (`site-copy.ts`, `DemoSiteCopy.folio`). Same mechanism;
 * each demo gets its own cover / chapters / footer so Lucía ≠ Rafa ≠ Mateo.
 *
 * TUL-494: Spanish-primary demos write Spanish base props and `overlays.en`
 * so `/en` never falls back to Spanish (and English-primary demos get
 * `overlays.es` when they carry a Spanish pack). Place names use a localized
 * city label ("Ciudad de México" / "Mexico City").
 */
import type { FolioSiteCopy, FolioSiteCopyOverlay } from "./site-copy";

/** Mateo EN chrome (second language on the Spanish-primary reference demo). */
const MATEO_EN: FolioSiteCopyOverlay = {
  chapters: [
    { heading: "Editorial", creditLine: "Demo studio credit · CDMX", tocCredit: "Studio, hard light" },
    { heading: "Runway", creditLine: "Demo show credit · 3 exits", tocCredit: "Exits and details" },
  ],
  coverStatement: "Editorial, runway and campaigns.",
  ratesSubtitle: "Base rates in MXN. Ad use and travel are quoted separately.",
  footerCredit: "",
  footerContact: "For editorials, runway and campaigns. I reply the same day.",
};

/** Mateo (reference) copy — Spanish primary, EN via overlays. */
export const FOLIO_DEMO_SITE_COPY: FolioSiteCopy = {
  chapters: [
    { heading: "Editorial", creditLine: "Créditos ficticios de demo · Estudio en CDMX", tocCredit: "Estudio, luz dura" },
    { heading: "Runway", creditLine: "Show ficticio de demo · 3 salidas", tocCredit: "Salidas y detalles" },
  ],
  coverStatement: "Editorial, runway y campañas.",
  ratesSubtitle: "Tarifas base en MXN. El uso en pauta y los viajes se cotizan aparte.",
  footerCredit: "",
  footerContact: "Para editoriales, runway y campañas. Respondo en el día.",
  shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
  overlays: { en: MATEO_EN },
};

const BY_CODE: Readonly<Record<string, FolioSiteCopy>> = {
  "TAL-93011": FOLIO_DEMO_SITE_COPY,
  "TAL-93004": {
    chapters: [
      { heading: "Editorial", creditLine: "Luz natural · CDMX", tocCredit: "Exteriores y estudio" },
      { heading: "Campaña", creditLine: "Catálogo y UGC", tocCredit: "Marca y redes" },
    ],
    coverStatement: "Editorial, catálogo y campañas en la Ciudad de México.",
    ratesSubtitle: "Tarifas base en MXN. El uso en pauta y los viajes se cotizan aparte.",
    footerCredit: "",
    footerContact: "Para editoriales, catálogo y campañas. Respondo en el día.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
    overlays: {
      en: {
        chapters: [
          { heading: "Editorial", creditLine: "Natural light · CDMX", tocCredit: "Outdoors and studio" },
          { heading: "Campaign", creditLine: "Catalog and UGC", tocCredit: "Brand and social" },
        ],
        coverStatement: "Editorial, catalogue and campaigns in Mexico City.",
        ratesSubtitle: "Base rates in MXN. Ad use and travel are quoted separately.",
        footerContact: "For editorials, catalogue and campaigns. I reply the same day.",
      },
    },
  },
  "TAL-93109": {
    chapters: [
      { heading: "Lifestyle", creditLine: "Dallas · DFW", tocCredit: "On location" },
      { heading: "Commercial", creditLine: "Photo and video", tocCredit: "Brand days" },
    ],
    coverStatement: "Commercial and lifestyle work in Dallas.",
    ratesSubtitle: "Base rates in USD. Usage rights are quoted by media and term.",
    footerCredit: "",
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
    footerCredit: "",
    footerContact: "For activewear, gym and wellness brands. Clear quotes.",
    shoeLabel: { en: "Shoe US", es: "Calzado US" },
  },
  "TAL-93111": {
    chapters: [
      { heading: "Pasarela", creditLine: "Shows · CDMX", tocCredit: "Ensayo y salida" },
      { heading: "Showroom", creditLine: "Presentaciones", tocCredit: "Compradores y prensa" },
    ],
    coverStatement: "Pasarela y presentaciones de colección en la Ciudad de México.",
    ratesSubtitle: "Tarifas base en MXN. Los viajes fuera de CDMX se cotizan aparte.",
    footerCredit: "",
    footerContact: "Para fechas de pasarela y showroom. Respondo en el día.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
    overlays: {
      en: {
        chapters: [
          { heading: "Runway", creditLine: "Shows · CDMX", tocCredit: "Rehearsal and exit" },
          { heading: "Showroom", creditLine: "Presentations", tocCredit: "Buyers and press" },
        ],
        coverStatement: "Runway and collection presentations in Mexico City.",
        ratesSubtitle: "Base rates in MXN. Travel outside CDMX is quoted separately.",
        footerContact: "For runway and showroom dates. I reply the same day.",
      },
    },
  },
  "TAL-93112": {
    chapters: [
      { heading: "Jewelry", creditLine: "Studio · Brooklyn", tocCredit: "Hands only" },
      { heading: "Product", creditLine: "Video demos", tocCredit: "Repeatable moves" },
    ],
    coverStatement: "Hand modeling for jewelry and product in New York.",
    ratesSubtitle: "Base rates in USD. Usage rights are quoted by media and term.",
    footerCredit: "",
    footerContact: "Hands only. Clear rates by the hour or by the day.",
    shoeLabel: { en: "N/A", es: "N/A" },
  },
  "TAL-93113": {
    chapters: [
      { heading: "Lifestyle", creditLine: "San Miguel de Allende", tocCredit: "Hoteles y retrato" },
      { heading: "Editorial", creditLine: "Canas y arrugas", tocCredit: "Como son" },
    ],
    coverStatement: "Retratos lifestyle y editoriales maduros en San Miguel.",
    ratesSubtitle: "Tarifas base en MXN. Las sesiones fuera de San Miguel incluyen traslado.",
    footerCredit: "",
    footerContact: "Para hoteles, retiros y retratos editoriales. Español o inglés.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
    overlays: {
      en: {
        chapters: [
          { heading: "Lifestyle", creditLine: "San Miguel de Allende", tocCredit: "Hotels and portrait" },
          { heading: "Editorial", creditLine: "Grey hair and lines", tocCredit: "As they are" },
        ],
        coverStatement: "Mature lifestyle and editorial portraits in San Miguel.",
        ratesSubtitle: "Base rates in MXN. Shoots outside San Miguel include travel.",
        footerContact: "For hotels, retreats and editorial portraits. Spanish or English.",
      },
    },
  },
  "TAL-93114": {
    chapters: [
      { heading: "Modelaje", creditLine: "Hoteles y playa · Vallarta", tocCredit: "Campaña" },
      { heading: "Música", creditLine: "Acústico y ceremonia", tocCredit: "En vivo" },
    ],
    coverStatement: "Modelo y cantante para campañas y sets en vivo en Vallarta.",
    ratesSubtitle: "Tarifas base en MXN. Foto y música se pueden reservar juntas.",
    footerCredit: "",
    footerContact: "Foto de día, música en vivo de noche. Dime la fecha y te propongo.",
    shoeLabel: { en: "Shoe MX", es: "Calzado MX" },
    overlays: {
      en: {
        chapters: [
          { heading: "Modeling", creditLine: "Hotels and beach · Vallarta", tocCredit: "Campaign" },
          { heading: "Music", creditLine: "Acoustic and ceremony", tocCredit: "Live" },
        ],
        coverStatement: "Model and singer for campaigns and live sets in Vallarta.",
        ratesSubtitle: "Base rates in MXN. Photo and music can be booked together.",
        footerContact: "Photo by day, live music by night. Tell me the date and I will propose.",
      },
    },
  },
};

export function folioSiteCopyFor(profileCode: string): FolioSiteCopy {
  return BY_CODE[profileCode] ?? FOLIO_DEMO_SITE_COPY;
}
