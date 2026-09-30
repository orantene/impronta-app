/**
 * Demo talents built on the Maison v2 and Folio designs (Demo Foundation
 * guide, 2026-09-30). One list feeds both the gallery (gallery-meta demos, the
 * "Demo content" preview allow-list) and the apply script
 * (scripts/demo-talents/apply-theme-demos.mts), so a demo shown in the gallery
 * is always a demo whose site draft wears that design.
 *
 * `live: true` demos already have a published site; the script only rewrites
 * their draft. The rest stay unpublished: the preview reads their draft.
 * Pure data. `palette` points at a gallery-meta palette (the gallery swatch);
 * a Maison v2 demo's `style` (MAISON_V2_DEMO_STYLES) makes each demo a
 * visually distinct site through EDITABLE settings only: site tokens (colours,
 * fonts, shape), section variants and section order. Nothing is a fixed skin.
 */

export type ThemeDemoDesign = "maison-v2" | "folio";

export type ThemeDemoProfession =
  | "nails"
  | "lashes"
  | "brows"
  | "bridal_makeup"
  | "hair"
  | "barber"
  | "model"
  | "singer";

export type ThemeDemo = {
  design: ThemeDemoDesign;
  /** Gallery demo key (`?demo=<design>:<key>`). */
  key: string;
  name: { en: string; es: string };
  professions: ThemeDemoProfession[];
  /** Gallery palette key of the design. */
  palette: string;
  profileCode: string;
  siteSlug: string;
  displayName: string;
  live: boolean;
};

/** A photo from the demo's own media: the card portrait or a gallery shot. */
export type ThemeDemoMediaRef = { kind: "card" } | { kind: "gallery"; index: number };

/** Top-level Maison v2 home sections after the hero, by builder layer label. */
export type MaisonV2SectionKey = "work" | "menu" | "reviews" | "about" | "visit" | "faq";

export const MAISON_V2_SECTION_LABELS: Readonly<Record<MaisonV2SectionKey, string>> = {
  work: "Ticker and recent work",
  menu: "Menu",
  reviews: "Reviews",
  about: "About",
  visit: "Visit",
  faq: "FAQ",
};

/** A custom palette (stored as the site's custom_palette + look tokens). */
export type ThemeDemoCustomPalette = {
  name: { en: string; es: string };
  page: string;
  section: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  tint: string;
};

export type MaisonV2DemoStyle = {
  /** A custom palette; absent = the demo's built-in gallery `palette`. */
  customPalette?: ThemeDemoCustomPalette;
  /** Google Fonts families (catalogue names) for display + body. */
  fonts: { heading: string; body: string };
  /** Site style token overrides (shape, buttons, type), all theme-drawer editable. */
  tokens?: Record<string, string>;
  hero: {
    /** Which side the photo sits on (desktop). */
    media: "left" | "right";
    /** Desktop columns, copy first (e.g. "1.05fr 0.95fr"). */
    columns: string;
    /** Hero portrait: the talent (card), never a client shot (F21). */
    photo?: ThemeDemoMediaRef;
    /** Inset: a detail/work photo from the demo's own media (F20). */
    inset?: ThemeDemoMediaRef;
  };
  ticker: boolean;
  portfolio: { layout: "staggered" | "grid" | "filmstrip" | "masonry"; columns: 2 | 3 | 4 };
  menu: {
    thumbnails: boolean;
    categoryNav: "rail" | "pills" | "tabs";
    columns: 1 | 2;
  };
  /** Footer band: ink (dark statement) or surface (soft section colour). */
  footer: "ink" | "surface";
  /** Sections after the hero, in page order (all six, each once). */
  order: MaisonV2SectionKey[];
};

export const THEME_DEMOS: readonly ThemeDemo[] = [
  // Maison v2 (after the featured Alba demo)
  { design: "maison-v2", key: "nail-artist", name: { en: "Nail Artist", es: "Manicurista" }, professions: ["nails"], palette: "blush", profileCode: "TAL-93003", siteSlug: "camila-nails", displayName: "Camila Rivas", live: true },
  { design: "maison-v2", key: "lash-artist", name: { en: "Lash Artist", es: "Lashista" }, professions: ["lashes"], palette: "blush", profileCode: "TAL-93002", siteSlug: "renata-lashes", displayName: "Renata Salgado", live: true },
  { design: "maison-v2", key: "nails-lashes-linh", name: { en: "Nails & Lashes", es: "Uñas y pestañas" }, professions: ["nails", "lashes"], palette: "blush", profileCode: "TAL-93103", siteSlug: "linh-tran", displayName: "Linh Tran", live: false },
  { design: "maison-v2", key: "brow-artist", name: { en: "Brow Artist", es: "Cejas" }, professions: ["brows"], palette: "porcelain", profileCode: "TAL-93104", siteSlug: "leo-haddad", displayName: "Leo Haddad Brows", live: false },
  { design: "maison-v2", key: "makeup-artist", name: { en: "Makeup Artist", es: "Maquillista" }, professions: ["bridal_makeup"], palette: "noir-rose", profileCode: "TAL-93105", siteSlug: "sofia-rinaldi", displayName: "Sofía Rinaldi", live: false },
  { design: "maison-v2", key: "hair-stylist", name: { en: "Hair Stylist", es: "Estilista" }, professions: ["hair"], palette: "sage", profileCode: "TAL-93106", siteSlug: "marcus-bell", displayName: "Marcus Bell", live: false },
  { design: "maison-v2", key: "barber", name: { en: "Barber", es: "Barbero" }, professions: ["barber"], palette: "noir-rose", profileCode: "TAL-93107", siteSlug: "terrence-coleman", displayName: "Coleman Cuts", live: false },
  // Folio (after the featured Mateo demo)
  { design: "folio", key: "fashion-model-lucia", name: { en: "Fashion Model", es: "Modelo de moda" }, professions: ["model"], palette: "stone", profileCode: "TAL-93004", siteSlug: "lucia-herrera", displayName: "Lucía Herrera", live: true },
  { design: "folio", key: "commercial-model", name: { en: "Commercial Model", es: "Modelo comercial" }, professions: ["model"], palette: "light", profileCode: "TAL-93109", siteSlug: "priya-shah", displayName: "Priya Shah", live: false },
  { design: "folio", key: "fitness-model", name: { en: "Fitness Model", es: "Modelo fitness" }, professions: ["model"], palette: "dark", profileCode: "TAL-93110", siteSlug: "andre-castillo", displayName: "Andre Castillo", live: false },
  { design: "folio", key: "runway-model", name: { en: "Runway Model", es: "Modelo de pasarela" }, professions: ["model"], palette: "stone", profileCode: "TAL-93111", siteSlug: "noemi-castaneda", displayName: "Noemí Castañeda", live: false },
  { design: "folio", key: "hand-model", name: { en: "Hand Model", es: "Modelo de manos" }, professions: ["model"], palette: "light", profileCode: "TAL-93112", siteSlug: "daniel-kim", displayName: "Daniel Kim", live: false },
  { design: "folio", key: "mature-model", name: { en: "Mature Model", es: "Modelo senior" }, professions: ["model"], palette: "stone", profileCode: "TAL-93113", siteSlug: "elena-garza-trevino", displayName: "Elena Garza Treviño", live: false },
  { design: "folio", key: "model-singer", name: { en: "Model & Singer", es: "Modelo y cantante" }, professions: ["model", "singer"], palette: "dark", profileCode: "TAL-93114", siteSlug: "rafael-hernandez-cuevas", displayName: "Rafa Cuevas", live: false },
];

export function themeDemosFor(design: ThemeDemoDesign): ThemeDemo[] {
  return THEME_DEMOS.filter((d) => d.design === design);
}

/**
 * Per-demo Maison v2 styles (owner-approved 2026-09-30): one palette, font
 * pair, variant set and section order per demo, so no two demos (plus Alba,
 * who keeps Rosé) look alike. Barber and hair lead with the menu; makeup and
 * nails with the portfolio; lashes and brows bring reviews / the visit up.
 */
export const MAISON_V2_DEMO_STYLES: Readonly<Record<string, MaisonV2DemoStyle>> = {
  // Camila, nails (live): Blush, Cormorant Garamond + Jost, portfolio grid first.
  "TAL-93003": {
    fonts: { heading: "Cormorant Garamond", body: "Jost" },
    tokens: { "shape.card-radius": "18px", "shape.image-radius": "20px", "shape.image-radius-desktop": "28px" },
    hero: { media: "right", columns: "1.05fr 0.95fr" },
    ticker: true,
    portfolio: { layout: "grid", columns: 3 },
    menu: { thumbnails: true, categoryNav: "rail", columns: 2 },
    footer: "ink",
    order: ["work", "menu", "about", "reviews", "visit", "faq"],
  },
  // Renata, lashes (live): custom Lilac, Playfair + DM Sans, reviews right after the hero.
  "TAL-93002": {
    customPalette: {
      name: { en: "Lilac", es: "Lila" },
      page: "#F8F5FB",
      section: "#FFFFFF",
      line: "#E6DDEF",
      text: "#221A2B",
      muted: "#6F6479",
      accent: "#6B3FA0",
      onAccent: "#FFFFFF",
      tint: "#EEE5F7",
    },
    fonts: { heading: "Playfair Display", body: "DM Sans" },
    tokens: { "button.variant": "outline", "shape.feature-radius": "999px" },
    hero: { media: "left", columns: "0.95fr 1.05fr" },
    ticker: false,
    portfolio: { layout: "filmstrip", columns: 4 },
    menu: { thumbnails: false, categoryNav: "pills", columns: 1 },
    footer: "surface",
    order: ["reviews", "menu", "work", "visit", "about", "faq"],
  },
  // Linh, nails + lashes: custom Peach & Clay, Fraunces + Manrope, masonry first, reviews early.
  "TAL-93103": {
    customPalette: {
      name: { en: "Peach & Clay", es: "Durazno y barro" },
      page: "#FFF8F2",
      section: "#FFFFFF",
      line: "#F1DFD0",
      text: "#2E1F17",
      muted: "#7A6554",
      accent: "#A84B28",
      onAccent: "#FFFFFF",
      tint: "#FBE6D8",
    },
    fonts: { heading: "Fraunces", body: "Manrope" },
    tokens: { "shape.card-radius": "28px", "shape.image-radius": "30px", "shape.image-radius-desktop": "40px" },
    hero: { media: "right", columns: "1fr 1fr", photo: { kind: "card" }, inset: { kind: "gallery", index: 10 } },
    ticker: true,
    portfolio: { layout: "masonry", columns: 3 },
    menu: { thumbnails: true, categoryNav: "tabs", columns: 2 },
    footer: "ink",
    order: ["work", "reviews", "menu", "visit", "about", "faq"],
  },
  // Leo, brows: Porcelain & Ink, DM Serif Display + Inter, square corners, visit first.
  "TAL-93104": {
    fonts: { heading: "DM Serif Display", body: "Inter" },
    tokens: {
      "type.accent-style": "normal",
      "button.radius": "2px",
      "shape.card-radius": "2px",
      "shape.image-radius": "2px",
      "shape.image-radius-desktop": "2px",
      "shape.media-radius": "2px",
      "shape.thumb-radius": "2px",
      "shape.chip-radius": "2px",
      "shape.feature-radius": "2px",
    },
    hero: { media: "left", columns: "0.9fr 1.1fr", photo: { kind: "card" }, inset: { kind: "gallery", index: 10 } },
    ticker: false,
    portfolio: { layout: "grid", columns: 4 },
    menu: { thumbnails: false, categoryNav: "rail", columns: 1 },
    footer: "surface",
    order: ["visit", "menu", "reviews", "work", "about", "faq"],
  },
  // Sofía, makeup: Noir rose (dark), Cormorant + Montserrat, staggered portfolio + about first.
  "TAL-93105": {
    fonts: { heading: "Cormorant", body: "Montserrat" },
    tokens: { "type.display-weight": "400", "type.label-tracking": "0.24em" },
    hero: { media: "right", columns: "0.9fr 1.1fr", photo: { kind: "card" }, inset: { kind: "gallery", index: 10 } },
    ticker: true,
    portfolio: { layout: "staggered", columns: 3 },
    menu: { thumbnails: true, categoryNav: "rail", columns: 2 },
    footer: "surface",
    order: ["work", "about", "menu", "reviews", "visit", "faq"],
  },
  // Marcus, hair: Sage & Olive, Newsreader + Work Sans, menu first.
  "TAL-93106": {
    fonts: { heading: "Newsreader", body: "Work Sans" },
    tokens: { "shape.card-radius": "12px", "shape.image-radius": "14px", "shape.image-radius-desktop": "18px", "button.radius": "10px" },
    hero: { media: "left", columns: "1fr 1fr", photo: { kind: "card" }, inset: { kind: "gallery", index: 10 } },
    ticker: true,
    portfolio: { layout: "grid", columns: 3 },
    menu: { thumbnails: true, categoryNav: "pills", columns: 2 },
    footer: "ink",
    order: ["menu", "work", "reviews", "about", "visit", "faq"],
  },
  // Coleman, barber: custom Tobacco & Brass (dark), Oswald + Archivo, menu then visit.
  "TAL-93107": {
    customPalette: {
      name: { en: "Tobacco & Brass", es: "Tabaco y latón" },
      page: "#16130F",
      section: "#211C16",
      line: "#3A3127",
      text: "#F3ECE2",
      muted: "#B3A696",
      accent: "#C9973F",
      onAccent: "#16130F",
      tint: "#3A2D1C",
    },
    fonts: { heading: "Oswald", body: "Archivo" },
    tokens: {
      "type.accent-style": "normal",
      "type.display-weight": "500",
      "type.display-tracking": "0.01em",
      "button.radius": "4px",
      "shape.card-radius": "6px",
      "shape.image-radius": "6px",
      "shape.image-radius-desktop": "8px",
      "shape.media-radius": "6px",
      "shape.thumb-radius": "4px",
      "shape.feature-radius": "8px",
    },
    hero: { media: "right", columns: "1.1fr 0.9fr", photo: { kind: "card" }, inset: { kind: "gallery", index: 4 } },
    ticker: true,
    portfolio: { layout: "filmstrip", columns: 4 },
    menu: { thumbnails: false, categoryNav: "rail", columns: 2 },
    footer: "surface",
    order: ["menu", "visit", "work", "reviews", "about", "faq"],
  },
};
