/**
 * Centralized image bank.
 *
 * All URLs point at known-working Unsplash photo IDs. We reuse a small
 * palette of wedding/editorial/lifestyle IDs across categories so every
 * tile renders something on-brand even if service-specific photos aren't
 * in the bank.
 *
 * Field-model mapping:
 *   - In a real CMS, these become `media` rows with { src, alt, focal_point,
 *     srcset }. The prototype uses plain URLs with a scoped helper.
 */

const UN = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// Verified-rendering Unsplash photo IDs (wedding / editorial / lifestyle).
const PHOTO = {
  bouquet: "1519741497674-611481863552",       // photographer + bouquet close-up
  bridalHair: "1523263685509-57c1d050d19b",    // bridal hair/beauty
  makeupBrushes: "1522673607200-164d1b6ce486", // makeup brushes flat-lay
  dressHanging: "1465495976277-4387d4b0e4a6",  // wedding dress hanging
  receptionTable: "1511795409834-ef04bbd61622",// reception table setup
  coupleField: "1469371670807-013ccf25f16a",   // couple outdoors countryside
  ceremony: "1529636120-19e1b96a8e84",         // ceremony installation
  floralDetail: "1525895308024-ea2e7ff8e0b8",  // bouquet detail
  ringsFlorals: "1511285560929-80b456fea0bc",  // rings on florals
  bride: "1519225421980-715cb0215aed",         // bride portrait
  brideVeil: "1606490194859-07c18c9f0968",     // bride with veil
  tableBlur: "1583939003579-730e3918a45a",     // soft-focus florals
  tulum: "1510414842594-a61c69b5ae57",         // Tulum beach
  cabos: "1565967511849-76a60a516170",         // Pacific cliffs
  cdmx: "1518105779142-d975f22f1b0a",          // Mexico City
  europe: "1548013146-72479768bada",           // Mediterranean
  riviera: "1507525428034-b723cf961d3e",       // tropical beach
};

// Portrait pool (known-working Unsplash portraits).
const PORTRAIT = {
  a: "1494790108377-be9c29b29330",
  b: "1531123897727-8f129e1688ce",
  c: "1438761681033-6461ffad8d80",
  d: "1544005313-94ddf0286df2",
  e: "1534528741775-53994a69daeb",
  f: "1529626455594-4ff0802cfb7e",
  g: "1524504388940-b1c1722653e1",
  h: "1506863530036-1efeddceb993",
  i: "1500648767791-00dcc994a43e",
  j: "1557555187-23d685287bc3",
  k: "1503023345310-bd7c1de61c7d",
  l: "1489424731084-a5d8b219a5bb",
};

export const IMAGERY = {
  // ── Hero / emotional full-bleed ─────────────────────────────────
  heroHome: UN(PHOTO.bouquet, 2200),
  heroDirectory: UN(PHOTO.receptionTable, 2000),
  heroAbout: UN(PHOTO.coupleField, 2000),
  heroContact: UN(PHOTO.ringsFlorals, 2000),
  heroServices: UN(PHOTO.floralDetail, 2000),

  // ── Service / category art ──────────────────────────────────────
  serviceMakeup: UN(PHOTO.makeupBrushes, 1200),
  serviceHair: UN(PHOTO.bridalHair, 1200),
  servicePhoto: UN(PHOTO.bouquet, 1200),
  serviceVideo: UN(PHOTO.dressHanging, 1200),
  servicePlanning: UN(PHOTO.receptionTable, 1200),
  serviceFloral: UN(PHOTO.floralDetail, 1200),
  serviceContent: UN(PHOTO.bride, 1200),
  serviceMusic: UN(PHOTO.ceremony, 1200),

  // ── Gallery strip (mix of lifestyle + detail) ───────────────────
  galleryA: UN(PHOTO.bride, 1400),
  galleryB: UN(PHOTO.tableBlur, 1400),
  galleryC: UN(PHOTO.makeupBrushes, 1200),
  galleryD: UN(PHOTO.ceremony, 1400),
  galleryE: UN(PHOTO.brideVeil, 1400),
  galleryF: UN(PHOTO.receptionTable, 1400),
  galleryG: UN(PHOTO.ringsFlorals, 1200),
  galleryH: UN(PHOTO.dressHanging, 1400),

  // ── Destination ambient ─────────────────────────────────────────
  destTulum: UN(PHOTO.tulum, 1400),
  destCabos: UN(PHOTO.cabos, 1400),
  destCdmx: UN(PHOTO.cdmx, 1400),
  destRiviera: UN(PHOTO.riviera, 1400),
  destEurope: UN(PHOTO.europe, 1400),

  // ── Portrait pool for mock professionals ────────────────────────
  portraitA: UN(PORTRAIT.a, 900),
  portraitB: UN(PORTRAIT.b, 900),
  portraitC: UN(PORTRAIT.c, 900),
  portraitD: UN(PORTRAIT.d, 900),
  portraitE: UN(PORTRAIT.e, 900),
  portraitF: UN(PORTRAIT.f, 900),
  portraitG: UN(PORTRAIT.g, 900),
  portraitH: UN(PORTRAIT.h, 900),
  portraitI: UN(PORTRAIT.i, 900),
  portraitJ: UN(PORTRAIT.j, 900),
  portraitK: UN(PORTRAIT.k, 900),
  portraitL: UN(PORTRAIT.l, 900),

  // ── About editorial ─────────────────────────────────────────────
  aboutStudio: UN(PHOTO.coupleField, 1400),
  aboutTable: UN(PHOTO.receptionTable, 1400),
  aboutDetail: UN(PHOTO.floralDetail, 1400),
  aboutMood: UN(PHOTO.bride, 1400),

  // ── Portfolio pool (reused across profiles) ─────────────────────
  portfolioA: UN(PHOTO.tableBlur, 1200),
  portfolioB: UN(PHOTO.ceremony, 1200),
  portfolioC: UN(PHOTO.brideVeil, 1200),
  portfolioD: UN(PHOTO.receptionTable, 1200),
  portfolioE: UN(PHOTO.floralDetail, 1200),
  portfolioF: UN(PHOTO.ringsFlorals, 1200),
  portfolioG: UN(PHOTO.bride, 1200),
  portfolioH: UN(PHOTO.dressHanging, 1200),
};

export const galleryMontage = [
  IMAGERY.galleryA,
  IMAGERY.galleryB,
  IMAGERY.galleryC,
  IMAGERY.galleryD,
  IMAGERY.galleryE,
  IMAGERY.galleryF,
  IMAGERY.galleryG,
  IMAGERY.galleryH,
];
