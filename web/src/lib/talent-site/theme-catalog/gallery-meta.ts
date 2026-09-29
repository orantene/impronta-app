/**
 * Theme gallery metadata (P2, 2026-09-28). One typed source the gallery
 * (browse / search / filters, demo switcher, colours) reads for the six
 * designs that render today: Maison plus the collection designs.
 *
 * Slugs and names come from `MAISON_SEED` and `COLLECTION_DESIGNS`.
 * Palettes use the SAME shape as Maison palettes (`MaisonPalette`: page,
 * section, rule, text, accent, on_accent) so `galleryPaletteLookTokens`
 * returns the look tokens the preview postMessage recolor already takes.
 * Colour values live only here (data), mirroring `maison-seed-data.json`.
 *
 * Demos: a demo is `built` only when a real content pack exists AND it can
 * render. Sources:
 *  - `maison-seed`: the Maison starter pack (`MAISON_SEED.demo_nails`), which
 *    the preview renders without a talent.
 *  - `demo-talent`: a talent from `scripts/demo-talents/demos.ts`, identified
 *    by `profileCode` + `siteSlug`. The UI resolves the profile id for
 *    `/template-preview/<slug>?kind=talent-theme&talent=<id>`.
 * Everything else is `planned` (Preview planned tile).
 */
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_SUMMARY_ES } from "./collection/designs";
import {
  MAISON_PALETTES,
  MAISON_PALETTE_ORDER,
  MAISON_THEME_KEY,
  maisonPaletteLookTokens,
  type MaisonPalette,
} from "./maison/seed";

export type Localized = { en: string; es: string };

export const GALLERY_STYLE_TAGS = ["Editorial", "Minimal", "Bold", "Warm", "Image-led", "Dark"] as const;
export type GalleryStyleTag = (typeof GALLERY_STYLE_TAGS)[number];

export const GALLERY_FEATURE_TAGS = [
  "Service menu",
  "Booking-ready",
  "Portfolio",
  "Project stories",
  "Service list",
  "Text-first",
  "Video & media",
  "Quote requests",
  "Chapters",
  "Bento tiles",
  "Packages",
  "Personal story",
  "Classes",
  "Multi-talent",
] as const;
export type GalleryFeatureTag = (typeof GALLERY_FEATURE_TAGS)[number];

export const GALLERY_CATEGORY_CHIPS = [
  "beauty",
  "models",
  "music",
  "food",
  "fitness",
  "wellness",
  "creative",
  "events",
  "home_local",
  "tech",
] as const;
export type GalleryCategoryChip = (typeof GALLERY_CATEGORY_CHIPS)[number];

export type GalleryProfession =
  | "nails"
  | "lashes"
  | "bridal_makeup"
  | "hair"
  | "barber"
  | "model"
  | "singer"
  | "dancer"
  | "dj"
  | "chef"
  | "bartender"
  | "trainer"
  | "yoga"
  | "pilates"
  | "massage"
  | "photographer"
  | "designer"
  | "illustrator"
  | "interior_designer"
  | "tattoo"
  | "tutor"
  | "guide";

/** Same colour shape as a Maison palette, plus gallery flags. */
export type GalleryPalette = Pick<
  MaisonPalette,
  "name" | "page" | "section" | "rule" | "text" | "accent" | "on_accent"
> & {
  key: string;
  /** Secondary text (proposal "mute"); defaults to the ink when absent. */
  muted?: string;
  /** Soft accent tint (proposal "tint"): chips, initials, image placeholders. */
  tint?: string;
  highContrast?: boolean;
  dark?: boolean;
};

/** A design's own type pair (font-family stacks, loaded via Google Fonts). */
export type GalleryFonts = { heading: string; body: string };

export type GalleryDemoSource =
  | { kind: "maison-seed"; key: string }
  | { kind: "demo-talent"; profileCode: string; siteSlug: string; displayName: string }
  | { kind: "none" };

export type GalleryDemo = {
  key: string;
  name: Localized;
  /** One or more professions; two means a combined-talent demo. */
  professions: GalleryProfession[];
  defaultPalette: string;
  status: "built" | "planned";
  source: GalleryDemoSource;
};

export type GalleryDesign = {
  slug: string;
  name: string;
  description: Localized;
  styleTags: GalleryStyleTag[];
  featureTags: GalleryFeatureTag[];
  professions: GalleryProfession[];
  categoryChips: GalleryCategoryChip[];
  /** First entry is the design's default palette (used when no look is picked). */
  palettes: GalleryPalette[];
  /** The design's own fonts. Absent: the platform default pair. */
  fonts?: GalleryFonts;
  demos: GalleryDemo[];
};

// ── Professions: labels + EN/ES search synonyms ─────────────────────────────

export const GALLERY_PROFESSIONS: Record<
  GalleryProfession,
  { label: Localized; chip: GalleryCategoryChip; synonyms: string[] }
> = {
  nails: { label: { en: "Nail Artist", es: "Manicurista" }, chip: "beauty", synonyms: ["nails", "nail", "manicure", "manicurist", "uñas", "unas", "manicurista"] },
  lashes: { label: { en: "Lash Artist", es: "Lashista" }, chip: "beauty", synonyms: ["lashes", "lash", "eyelashes", "pestañas", "pestanas", "lashista"] },
  bridal_makeup: { label: { en: "Bridal Hair & Makeup", es: "Peinado y maquillaje de novia" }, chip: "beauty", synonyms: ["makeup", "make-up", "bridal", "mua", "maquillaje", "maquillista", "novia"] },
  hair: { label: { en: "Hair Stylist", es: "Estilista" }, chip: "beauty", synonyms: ["hair", "hairstylist", "stylist", "estilista", "peinado", "cabello"] },
  barber: { label: { en: "Barber", es: "Barbero" }, chip: "beauty", synonyms: ["barber", "barbershop", "barbero", "barberia", "barbería"] },
  model: { label: { en: "Model", es: "Modelo" }, chip: "models", synonyms: ["model", "modelo", "modeling", "modelaje"] },
  singer: { label: { en: "Singer", es: "Cantante" }, chip: "music", synonyms: ["singer", "vocalist", "cantante", "cantar", "voz"] },
  dancer: { label: { en: "Dance Instructor", es: "Instructora de baile" }, chip: "music", synonyms: ["dancer", "dance", "salsa", "bachata", "bailarina", "bailarin", "bailarín", "baile"] },
  dj: { label: { en: "DJ", es: "DJ" }, chip: "music", synonyms: ["dj", "deejay"] },
  chef: { label: { en: "Private Chef", es: "Chef privado" }, chip: "food", synonyms: ["chef", "cook", "cocinero", "cocinera", "cocina", "private chef"] },
  bartender: { label: { en: "Bartender", es: "Bartender" }, chip: "food", synonyms: ["bartender", "mixologist", "cocktails", "mixologa", "mixóloga", "coctelería", "cocteleria", "barra"] },
  trainer: { label: { en: "Personal Trainer", es: "Entrenador personal" }, chip: "fitness", synonyms: ["trainer", "coach", "fitness", "entrenador", "entrenadora", "entrenamiento"] },
  yoga: { label: { en: "Yoga Instructor", es: "Instructora de yoga" }, chip: "wellness", synonyms: ["yoga", "yogi"] },
  pilates: { label: { en: "Pilates Instructor", es: "Instructora de pilates" }, chip: "fitness", synonyms: ["pilates"] },
  massage: { label: { en: "Massage Therapist", es: "Masajista" }, chip: "wellness", synonyms: ["massage", "masseuse", "masaje", "masajista", "spa"] },
  photographer: { label: { en: "Photographer", es: "Fotógrafo" }, chip: "creative", synonyms: ["photographer", "photography", "photo", "fotógrafo", "fotografo", "fotógrafa", "fotografa", "fotografía", "fotografia"] },
  designer: { label: { en: "Graphic Designer", es: "Diseñador gráfico" }, chip: "creative", synonyms: ["designer", "graphic", "branding", "diseñador", "disenador", "diseñadora", "diseño"] },
  illustrator: { label: { en: "Illustrator", es: "Ilustrador" }, chip: "creative", synonyms: ["illustrator", "illustration", "ilustrador", "ilustradora", "ilustración"] },
  interior_designer: { label: { en: "Interior Designer", es: "Diseñador de interiores" }, chip: "home_local", synonyms: ["interior", "interiors", "interiorismo", "interiorista", "decorador", "decoradora"] },
  tattoo: { label: { en: "Tattoo Artist", es: "Tatuador" }, chip: "creative", synonyms: ["tattoo", "tattoos", "tatuador", "tatuadora", "tatuaje"] },
  tutor: { label: { en: "Tutor", es: "Tutor" }, chip: "home_local", synonyms: ["tutor", "teacher", "teaching", "maestro", "maestra", "profesor", "profesora", "clases"] },
  guide: { label: { en: "Local Guide", es: "Guía local" }, chip: "events", synonyms: ["guide", "tour", "host", "guía", "guia", "anfitriona", "acompañante"] },
};

// ── Palettes ────────────────────────────────────────────────────────────────

const MAISON_GALLERY_PALETTES: GalleryPalette[] = MAISON_PALETTE_ORDER.map((key) => {
  const p = MAISON_PALETTES[key];
  return {
    key,
    name: p.name,
    page: p.page,
    section: p.section,
    rule: p.rule,
    text: p.text,
    accent: p.accent,
    on_accent: p.on_accent,
    ...(key === "pearl" ? { highContrast: true } : {}),
  };
});

function pal(
  key: string,
  en: string,
  es: string,
  c: [page: string, section: string, rule: string, text: string, accent: string, onAccent: string],
  flags: { highContrast?: boolean; dark?: boolean; muted?: string; tint?: string } = {},
): GalleryPalette {
  const [page, section, rule, text, accent, on_accent] = c;
  return { key, name: { en, es }, page, section, rule, text, accent, on_accent, ...flags };
}

/** Maison v2 (Rosé proposal) type: Bodoni Moda display, Figtree body. */
const MAISON_V2_FONTS: GalleryFonts = {
  heading: '"Bodoni Moda", Didot, "Bodoni 72", Georgia, serif',
  body: '"Figtree", system-ui, sans-serif',
};

// ── Designs ─────────────────────────────────────────────────────────────────

function collection(slug: string) {
  const d = COLLECTION_DESIGNS.find((x) => x.slug === slug);
  if (!d) throw new Error(`gallery-meta: collection design ${slug} missing`);
  return { slug: d.slug, name: d.title, description: { en: d.summary, es: COLLECTION_DESIGN_SUMMARY_ES[slug] ?? d.summary } };
}

function talentDemo(
  key: string,
  name: Localized,
  professions: GalleryProfession[],
  defaultPalette: string,
  profileCode: string,
  siteSlug: string,
  displayName: string,
): GalleryDemo {
  return { key, name, professions, defaultPalette, status: "built", source: { kind: "demo-talent", profileCode, siteSlug, displayName } };
}

function planned(key: string, name: Localized, professions: GalleryProfession[], defaultPalette: string): GalleryDemo {
  return { key, name, professions, defaultPalette, status: "planned", source: { kind: "none" } };
}

const professionsOf = (demos: GalleryDemo[]): GalleryProfession[] => [...new Set(demos.flatMap((d) => d.professions))];
const chipsOf = (demos: GalleryDemo[]): GalleryCategoryChip[] => [
  ...new Set(professionsOf(demos).map((p) => GALLERY_PROFESSIONS[p].chip)),
];

function design(d: Omit<GalleryDesign, "professions" | "categoryChips">): GalleryDesign {
  return { ...d, professions: professionsOf(d.demos), categoryChips: chipsOf(d.demos) };
}

const MAISON_DEMOS: GalleryDemo[] = [
  {
    key: "nails",
    name: { en: "Nails & Lashes Artist", es: "Uñas y pestañas" },
    professions: ["nails", "lashes"],
    defaultPalette: "pink",
    status: "built",
    source: { kind: "maison-seed", key: "nails" },
  },
  planned("model", { en: "Model", es: "Modelo" }, ["model"], "pearl"),
  planned("singer", { en: "Singer", es: "Cantante" }, ["singer"], "lilac"),
  planned("private-chef", { en: "Private Chef", es: "Chef privado" }, ["chef"], "sand"),
  planned("personal-trainer", { en: "Personal Trainer", es: "Entrenador personal" }, ["trainer"], "pearl"),
  planned("bridal", { en: "Bridal Hair & Makeup", es: "Peinado y maquillaje de novia" }, ["bridal_makeup", "hair"], "peach"),
];

export const GALLERY_DESIGNS: readonly GalleryDesign[] = [
  design({
    slug: MAISON_THEME_KEY,
    name: "Maison",
    description: {
      en: "A warm, editorial home for beauty pros: your name up top, a clear service menu and booking one tap away.",
      es: "Un sitio cálido y editorial para profesionales de belleza: tu nombre arriba, un menú de servicios claro y reservas a un toque.",
    },
    styleTags: ["Editorial", "Warm"],
    featureTags: ["Service menu", "Booking-ready", "Personal story"],
    palettes: MAISON_GALLERY_PALETTES,
    demos: MAISON_DEMOS,
  }),
  design({
    ...collection("maison-v2"),
    styleTags: ["Editorial", "Warm", "Image-led"],
    featureTags: ["Service menu", "Booking-ready", "Portfolio"],
    fonts: MAISON_V2_FONTS,
    // Proposal palettes (page, surface, line, ink, accent, on + mute).
    palettes: [
      pal("rose", "Rosé", "Rosé", ["#FCF7F7", "#FFFFFF", "#EFDFE3", "#241417", "#B3174A", "#FFFFFF"], { muted: "#7B6468", tint: "#FBE6EC" }),
      pal("blush", "Blush", "Rubor", ["#FBF4F2", "#FFFFFF", "#EEDCD7", "#2B1C1E", "#B24E69", "#FFFFFF"], { muted: "#86706F", tint: "#F7E3E4" }),
      pal("noir-rose", "Noir rose", "Noir rosa", ["#151012", "#1E171A", "#34282C", "#F7EEF0", "#E3487E", "#FFFFFF"], { dark: true, muted: "#B8A5A9", tint: "#3A2029" }),
      pal("porcelain", "Porcelain & Ink", "Porcelana y tinta", ["#FFFFFF", "#F4F4F2", "#E2E2DE", "#141414", "#141414", "#FFFFFF"], { highContrast: true }),
      pal("sage", "Sage & Olive", "Salvia y oliva", ["#FFFFFF", "#F1F4EE", "#DFE5D9", "#1F241C", "#4A5A34", "#FFFFFF"]),
    ],
    demos: [
      // FEATURED: Alba is the proposal's own demo (content word for word from the artifact).
      talentDemo("alba-nail-artist", { en: "Nail & Lash Artist", es: "Uñas y pestañas" }, ["nails", "lashes"], "rose", "TAL-93020", "alba-nail-artist", "Alba"),
      talentDemo("lash-artist", { en: "Lash Artist", es: "Lashista" }, ["lashes"], "rose", "TAL-93002", "renata-lashes", "Renata Salgado"),
      talentDemo("nail-artist", { en: "Nail Artist", es: "Manicurista" }, ["nails"], "rose", "TAL-93003", "camila-nails", "Camila Rivas"),
      talentDemo("private-chef", { en: "Private Chef", es: "Chef privado" }, ["chef"], "sage", "TAL-93006", "andres-cocina", "Andrés Molina"),
    ],
  }),
  design({
    ...collection("solace"),
    styleTags: ["Minimal", "Warm"],
    featureTags: ["Service list", "Booking-ready", "Classes", "Personal story"],
    palettes: [
      pal("linen", "Linen & Clay", "Lino y barro", ["#FFFFFF", "#F6F2EC", "#E6DED2", "#2B2620", "#8A5A3C", "#FFFFFF"]),
      pal("eucalyptus", "Eucalyptus", "Eucalipto", ["#FFFFFF", "#EEF3F0", "#D9E3DD", "#1D2622", "#3F6B5A", "#FFFFFF"]),
      pal("stone", "Stone & Charcoal", "Piedra y carbón", ["#FFFFFF", "#F3F3F1", "#E0E0DC", "#121212", "#121212", "#FFFFFF"], { highContrast: true }),
      pal("dusk", "Dusk", "Atardecer", ["#1A1917", "#24221F", "#3A3732", "#F2EEE8", "#D9B48C", "#1A1917"], { dark: true }),
    ],
    demos: [
      talentDemo("dance-instructor", { en: "Dance Instructor", es: "Instructora de baile" }, ["dancer"], "linen", "TAL-93001", "valeria-baila", "Valeria Ortiz"),
      talentDemo("local-guide", { en: "Local Guide", es: "Guía local" }, ["guide"], "linen", "TAL-93008", "mariana-merida", "Mariana Pech"),
      planned("yoga", { en: "Yoga Instructor", es: "Instructora de yoga" }, ["yoga"], "eucalyptus"),
      planned("pilates", { en: "Pilates Instructor", es: "Instructora de pilates" }, ["pilates"], "stone"),
      planned("massage", { en: "Massage Therapist", es: "Masajista" }, ["massage"], "linen"),
    ],
  }),
  design({
    ...collection("mono"),
    styleTags: ["Minimal", "Bold"],
    featureTags: ["Service list", "Booking-ready", "Text-first", "Packages"],
    palettes: [
      pal("paper", "Paper & Black", "Papel y negro", ["#FFFFFF", "#F5F5F5", "#E3E3E3", "#0F0F0F", "#0F0F0F", "#FFFFFF"], { highContrast: true }),
      pal("cobalt", "Cobalt", "Cobalto", ["#FFFFFF", "#F2F4F8", "#DEE3EC", "#161A22", "#1F4FB8", "#FFFFFF"]),
      pal("signal", "Signal Red", "Rojo señal", ["#FFFFFF", "#F7F3F2", "#E8E0DE", "#1A1414", "#B3261E", "#FFFFFF"]),
      pal("carbon", "Carbon", "Carbón", ["#111111", "#1B1B1B", "#333333", "#F5F5F5", "#F5F5F5", "#111111"], { dark: true }),
    ],
    demos: [
      talentDemo("personal-trainer", { en: "Personal Trainer", es: "Entrenador personal" }, ["trainer"], "paper", "TAL-93010", "pablo-entrena", "Pablo Serrano"),
      planned("barber", { en: "Barber", es: "Barbero" }, ["barber"], "carbon"),
      planned("lash-artist", { en: "Lash Artist", es: "Lashista" }, ["lashes"], "paper"),
      planned("tutor", { en: "Tutor", es: "Tutor" }, ["tutor"], "cobalt"),
    ],
  }),
  design({
    ...collection("frame"),
    styleTags: ["Image-led", "Bold"],
    featureTags: ["Portfolio", "Service menu", "Quote requests", "Video & media"],
    palettes: [
      pal("gallery", "Gallery White", "Blanco galería", ["#FFFFFF", "#F4F4F4", "#E1E1E1", "#111111", "#111111", "#FFFFFF"], { highContrast: true }),
      pal("darkroom", "Darkroom", "Cuarto oscuro", ["#0E0E0E", "#191919", "#2E2E2E", "#F2F2F2", "#E0B04A", "#0E0E0E"], { dark: true }),
      pal("film", "Film & Amber", "Película y ámbar", ["#FFFFFF", "#F7F2EA", "#E8DFD0", "#221D16", "#8C5A14", "#FFFFFF"]),
    ],
    demos: [
      talentDemo("portrait-photographer", { en: "Portrait Photographer", es: "Fotógrafo de retrato" }, ["photographer"], "gallery", "TAL-93009", "tomas-retratos", "Tomás Aguilar"),
      talentDemo("dj", { en: "DJ", es: "DJ" }, ["dj"], "darkroom", "TAL-93005", "diego-navarro-dj", "Diego Navarro"),
      planned("product-photographer", { en: "Product Photographer", es: "Fotógrafo de producto" }, ["photographer"], "gallery"),
      planned("food-photographer", { en: "Food Photographer", es: "Fotógrafo de comida" }, ["photographer", "chef"], "film"),
      planned("tattoo-artist", { en: "Tattoo Artist", es: "Tatuador" }, ["tattoo"], "darkroom"),
    ],
  }),
  design({
    ...collection("folio"),
    styleTags: ["Editorial", "Image-led"],
    featureTags: ["Portfolio", "Project stories", "Quote requests", "Chapters"],
    // Hex only here / in folio-looks.ts. Stone is the Folio default Look.
    palettes: [
      pal("stone", "Default stone", "Piedra", ["#ECEAE5", "#F7F6F3", "#D3D0C8", "#111111", "#111111", "#F7F6F3"], { highContrast: true }),
      pal("light", "Light neutral", "Claro neutro", ["#FFFFFF", "#F1F0ED", "#E6E4DF", "#1A1A1A", "#1A1A1A", "#F1F0ED"]),
      pal("dark", "Dark contrast", "Contraste oscuro", ["#0E0E0E", "#171717", "#2C2B29", "#F1EFEA", "#F1EFEA", "#0E0E0E"], { dark: true }),
    ],
    demos: [
      // Featured Folio demo = Mateo Ferrer (artifact). Lucía stays as second built demo.
      talentDemo("fashion-model", { en: "Fashion Model", es: "Modelo de moda" }, ["model"], "stone", "TAL-93011", "mateo-ferrer", "Mateo Ferrer"),
      talentDemo("fashion-model-lucia", { en: "Fashion Model", es: "Modelo de moda" }, ["model"], "stone", "TAL-93004", "lucia-herrera", "Lucía Herrera"),
      talentDemo("bartender", { en: "Bartender", es: "Bartender" }, ["bartender"], "stone", "TAL-93007", "sofia-barra", "Sofía Campos"),
      planned("portrait-photographer", { en: "Portrait Photographer", es: "Fotógrafo de retrato" }, ["photographer"], "stone"),
      planned("graphic-designer", { en: "Graphic Designer", es: "Diseñador gráfico" }, ["designer"], "light"),
      planned("illustrator", { en: "Illustrator", es: "Ilustrador" }, ["illustrator"], "stone"),
      planned("interior-designer", { en: "Interior Designer", es: "Diseñador de interiores" }, ["interior_designer"], "light"),
      planned("model-singer", { en: "Model & Singer", es: "Modelo y cantante" }, ["model", "singer"], "dark"),
    ],
  }),
];

// ── Visibility: finished designs only ───────────────────────────────────────

/**
 * Designs that are finished (10/10) and offered in the gallery by default.
 * Solace, Mono and Frame stay in code (previews, saved sites keep working)
 * but are hidden until they reach the bar. Set
 * `TALENT_GALLERY_EXTRA_DESIGNS=1` (server) or
 * `NEXT_PUBLIC_TALENT_GALLERY_EXTRA_DESIGNS=1` (client bundle) to show them.
 */
export const FINISHED_GALLERY_SLUGS: readonly string[] = [MAISON_THEME_KEY, "maison-v2", "folio"];

export function galleryExtraDesignsEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_TALENT_GALLERY_EXTRA_DESIGNS === "1" ||
    (typeof process !== "undefined" && process.env?.TALENT_GALLERY_EXTRA_DESIGNS === "1")
  );
}

/** Designs the gallery shows: the finished three, or all with the flag on. */
export function visibleGalleryDesigns(showExtra: boolean = galleryExtraDesignsEnabled()): readonly GalleryDesign[] {
  return showExtra ? GALLERY_DESIGNS : GALLERY_DESIGNS.filter((d) => FINISHED_GALLERY_SLUGS.includes(d.slug));
}

export function getGalleryDesign(slug: string): GalleryDesign | undefined {
  const s = slug.trim().toLowerCase();
  return GALLERY_DESIGNS.find((d) => d.slug === s);
}

/** Look tokens for a palette, same keys as `maisonPaletteLookTokens`. */
export function galleryPaletteLookTokens(slug: string, paletteKey: string): Record<string, string> | null {
  const d = getGalleryDesign(slug);
  const p = d?.palettes.find((x) => x.key === paletteKey);
  if (!d || !p) return null;
  if (d.slug === MAISON_THEME_KEY) return maisonPaletteLookTokens(paletteKey as keyof typeof MAISON_PALETTES);
  return {
    "color.background": p.page,
    "color.surface-raised": p.section,
    "color.line": p.rule,
    "color.ink": p.text,
    "color.muted": p.muted ?? p.text,
    "color.primary": p.accent,
    "color.primary-on": p.on_accent,
    "color.accent": p.accent,
    // The soft accent tint (mode chips, initials, image placeholders).
    ...(p.tint ? { "color.blush": p.tint } : {}),
    ...designTypographyTokens(d.slug),
  };
}

/**
 * The `?look=` a gallery card / detail preview passes for a design: Maison
 * uses its Look rows (`maison-<palette>`), every other design its OWN palette
 * key (the demo's default when it is one of the design's palettes, else the
 * design's first). Never another design's palette.
 */
export function galleryPreviewLookSlug(
  design: Pick<GalleryDesign, "slug" | "palettes">,
  paletteKey?: string | null,
): string | null {
  const known = paletteKey && design.palettes.some((p) => p.key === paletteKey) ? paletteKey : null;
  const key = known ?? design.palettes[0]?.key ?? null;
  if (!key) return null;
  return design.slug === MAISON_THEME_KEY ? `maison-${key}` : key;
}

/** The design's own font tokens (empty when it uses the platform pair). */
export function designTypographyTokens(slug: string): Record<string, string> {
  const fonts = getGalleryDesign(slug)?.fonts;
  if (!fonts) return {};
  return {
    "typography.heading-font-family": fonts.heading,
    "typography.body-font-family": fonts.body,
  };
}

/**
 * The full default Look of a gallery design: its first palette + its fonts.
 * The preview falls back to this when no look is picked, so a design never
 * renders in the platform's generic colours. Null for Maison (it has real
 * Look rows) and unknown slugs.
 */
export function galleryDefaultLookTokens(slug: string): Record<string, string> | null {
  const d = getGalleryDesign(slug);
  if (!d || d.slug === MAISON_THEME_KEY) return null;
  const first = d.palettes[0];
  return first ? galleryPaletteLookTokens(d.slug, first.key) : null;
}

// ── Search ──────────────────────────────────────────────────────────────────

export function normalizeSearchText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Split a query into terms: commas, "&", "+", "/", " and ", " y ", " o ", " or ". */
export function splitQuery(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s*(?:,|&|\+|\/|\band\b|\bor\b|\by\b|\bo\b)\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Professions a single term refers to (synonyms, labels; prefix match from 3 chars). */
export function professionsForTerm(term: string): GalleryProfession[] {
  const t = normalizeSearchText(term);
  if (!t) return [];
  const out: GalleryProfession[] = [];
  for (const [key, meta] of Object.entries(GALLERY_PROFESSIONS) as [GalleryProfession, (typeof GALLERY_PROFESSIONS)[GalleryProfession]][]) {
    const words = [key.replace(/_/g, " "), meta.label.en, meta.label.es, ...meta.synonyms].map(normalizeSearchText);
    const hit = words.some((w) => w === t || (t.length >= 3 && (w.startsWith(t) || w.split(/\s+/).some((p) => p.startsWith(t)))));
    if (hit) out.push(key);
  }
  return out;
}

export type GallerySearchInput = {
  query?: string;
  chips?: GalleryCategoryChip[];
  styleTags?: GalleryStyleTag[];
  featureTags?: GalleryFeatureTag[];
  /** Combined talents: only reorders (designs with a demo covering 2+ searched professions first). */
  combined?: boolean;
  /** Override the extra-designs flag (tests); defaults to the env flag. */
  showExtra?: boolean;
};

export type GallerySearchResult = {
  design: GalleryDesign;
  matchingDemos: GalleryDemo[];
  featuredDemo: GalleryDemo | null;
  combinesBoth: boolean;
};

export type GallerySuggestion = { label: Localized; profession: GalleryProfession };

export type GallerySearchOutput = {
  results: GallerySearchResult[];
  demoCount: number;
  themeCount: number;
  suggestionsWhenEmpty: GallerySuggestion[];
};

/** Empty-state suggestions, each mapped to a profession that has demos. */
export const GALLERY_EMPTY_SUGGESTIONS: readonly GallerySuggestion[] = [
  { label: { en: "Speaker", es: "Conferencista" }, profession: "tutor" },
  { label: { en: "Teacher", es: "Maestro" }, profession: "tutor" },
  { label: { en: "Guide", es: "Guía" }, profession: "guide" },
];

function demoMatchesText(demo: GalleryDemo, term: string): boolean {
  return normalizeSearchText(demo.name.en).includes(term) || normalizeSearchText(demo.name.es).includes(term);
}

export function searchGallery(input: GallerySearchInput = {}): GallerySearchOutput {
  const terms = splitQuery(input.query ?? "");
  const termProfessions = terms.map((t) => new Set(professionsForTerm(t)));
  const wanted = new Set(termProfessions.flatMap((s) => [...s]));
  const chips = input.chips ?? [];
  const styles = input.styleTags ?? [];
  const features = input.featureTags ?? [];

  const results: GallerySearchResult[] = [];
  const designs = visibleGalleryDesigns(input.showExtra);
  for (const d of designs) {
    // Filters: any selected chip, any selected style, every selected feature.
    if (chips.length && !chips.some((c) => d.categoryChips.includes(c))) continue;
    if (styles.length && !styles.some((s) => d.styleTags.includes(s))) continue;
    if (features.length && !features.every((f) => d.featureTags.includes(f))) continue;

    let matchingDemos: GalleryDemo[];
    if (terms.length === 0) {
      matchingDemos = chips.length
        ? d.demos.filter((demo) => demo.professions.some((p) => chips.includes(GALLERY_PROFESSIONS[p].chip)))
        : [...d.demos];
    } else {
      const themeHit = terms.some((t) => normalizeSearchText(d.name).includes(t) || normalizeSearchText(d.slug).includes(t));
      const byDemo = d.demos.filter(
        (demo) => demo.professions.some((p) => wanted.has(p)) || terms.some((t) => demoMatchesText(demo, t)),
      );
      if (byDemo.length === 0 && !themeHit) continue;
      matchingDemos = byDemo.length ? byDemo : [...d.demos];
    }

    const combinesBoth =
      termProfessions.filter((s) => s.size > 0).length >= 2 &&
      matchingDemos.some((demo) => termProfessions.every((s) => s.size === 0 || demo.professions.some((p) => s.has(p))));
    const featuredDemo = matchingDemos.find((x) => x.status === "built") ?? matchingDemos[0] ?? null;
    results.push({ design: d, matchingDemos, featuredDemo, combinesBoth });
  }

  if (input.combined) {
    // Stable sort: combined designs first, nothing removed.
    results.sort((a, b) => Number(b.combinesBoth) - Number(a.combinesBoth));
  }

  const present = new Set(designs.flatMap((d) => d.professions));
  return {
    results,
    demoCount: results.reduce((n, r) => n + r.matchingDemos.length, 0),
    themeCount: results.length,
    suggestionsWhenEmpty: results.length ? [] : GALLERY_EMPTY_SUGGESTIONS.filter((s) => present.has(s.profession)),
  };
}

/** Counts for the Visual style + Tags dropdowns over the given results. */
export function tagCounts(results: readonly GallerySearchResult[]): {
  styleTags: Record<GalleryStyleTag, number>;
  featureTags: Record<GalleryFeatureTag, number>;
} {
  const styleTags = Object.fromEntries(GALLERY_STYLE_TAGS.map((t) => [t, 0])) as Record<GalleryStyleTag, number>;
  const featureTags = Object.fromEntries(GALLERY_FEATURE_TAGS.map((t) => [t, 0])) as Record<GalleryFeatureTag, number>;
  for (const r of results) {
    for (const t of r.design.styleTags) styleTags[t] += 1;
    for (const t of r.design.featureTags) featureTags[t] += 1;
  }
  return { styleTags, featureTags };
}

// ── Suggested designs from the talent's primary trade ───────────────────────

const CHIP_SUGGESTIONS: Record<GalleryCategoryChip, string[]> = {
  beauty: ["maison", "maison-v2"],
  models: ["folio", "frame"],
  music: ["frame", "folio"],
  food: ["maison-v2", "folio"],
  fitness: ["mono", "solace"],
  wellness: ["solace", "mono"],
  creative: ["frame", "folio"],
  events: ["solace", "frame"],
  home_local: ["mono", "solace"],
  tech: ["mono", "folio"],
};

/** Up to 2 design slugs for a primary trade label (EN or ES, free text). */
export function suggestedDesignsForTrade(
  primaryTypeLabel: string | null | undefined,
  showExtra: boolean = galleryExtraDesignsEnabled(),
): string[] {
  const visible = new Set(visibleGalleryDesigns(showExtra).map((d) => d.slug));
  // Hidden designs drop out; the finished ones fill in so a trade still gets two.
  const pick = (slugs: string[]) => [...new Set([...slugs, ...FINISHED_GALLERY_SLUGS])].filter((s) => visible.has(s)).slice(0, 2);
  const raw = suggestedDesignsForTradeAll(primaryTypeLabel);
  return raw.length ? pick(raw) : [];
}

function suggestedDesignsForTradeAll(primaryTypeLabel: string | null | undefined): string[] {
  const label = normalizeSearchText(primaryTypeLabel ?? "");
  if (!label) return [];
  const direct = (GALLERY_CATEGORY_CHIPS as readonly string[]).find((c) => c === label.replace(/[\s-]+/g, "_"));
  if (direct) return CHIP_SUGGESTIONS[direct as GalleryCategoryChip];
  const chipWords: Record<string, GalleryCategoryChip> = { belleza: "beauty", modelos: "models", musica: "music", comida: "food", bienestar: "wellness", creativo: "creative", eventos: "events" };
  for (const [w, chip] of Object.entries(chipWords)) if (label.includes(w)) return CHIP_SUGGESTIONS[chip];
  for (const word of [label, ...label.split(/[\s,&/-]+/)]) {
    const profs = professionsForTerm(word);
    if (profs.length) {
      // Designs whose demos cover that profession first, then the chip default.
      const own = GALLERY_DESIGNS.filter((d) => d.demos.some((x) => x.status === "built" && x.professions.includes(profs[0]!))).map((d) => d.slug);
      const chip = CHIP_SUGGESTIONS[GALLERY_PROFESSIONS[profs[0]!].chip];
      return [...new Set([...(GALLERY_PROFESSIONS[profs[0]!].chip === "beauty" ? chip : own), ...chip])];
    }
  }
  return [];
}
