/**
 * Wave 2: demo profile facts for the gallery rail (city, languages, booking,
 * currency, sections). Sourced from design-references Folio and Gridline
 * demos.json plus settings. Pure data; no I/O.
 */
import folioDemos from "../../../../design-references/folio/demos.json";
import gridlineDemos from "../../../../design-references/gridline/demos.json";
import { appsForProfessions } from "@/lib/site-admin/add-gallery/apps-registry";
import { demoSiteSettingsFor } from "./demo-site-settings";
import { GALLERY_PROFESSIONS, type GalleryDemo, type GalleryProfession } from "@/lib/talent-site/theme-catalog/gallery-meta";

export type DemoBookingModeLabel = "instant" | "request" | "quote" | "mixed";

export type DemoProfileMeta = {
  profileCode: string | null;
  displayName: string;
  trade: { en: string; es: string };
  city: string | null;
  country: "MX" | "US" | null;
  languages: readonly string[];
  bookingMode: DemoBookingModeLabel;
  currency: "MXN" | "USD";
  apps: readonly string[];
  sections: readonly string[];
  siteLangs: readonly ("es" | "en")[];
};

type JsonDemo = {
  code: string;
  name: string;
  city: string;
  country: string;
  langs: string[];
  siteLangs?: string[];
  profession?: string;
  services?: Array<{ mode?: string; cur?: string }>;
};

const FOLIO = (folioDemos as { demos: JsonDemo[] }).demos;
const GRIDLINE = (gridlineDemos as { demos: JsonDemo[] }).demos;

/** Hardcoded profile facts for demos without a demos.json row. */
const EXTRA: Record<string, Omit<DemoProfileMeta, "apps" | "sections" | "bookingMode" | "currency" | "siteLangs" | "trade"> & { tradeEn: string; tradeEs: string }> = {
  "TAL-93020": { profileCode: "TAL-93020", displayName: "Alba", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "Nail & Lash Artist", tradeEs: "Uñas y pestañas" },
  "TAL-93003": { profileCode: "TAL-93003", displayName: "Camila Rivas", city: "Guadalajara", country: "MX", languages: ["Español"], tradeEn: "Nail Artist", tradeEs: "Manicurista" },
  "TAL-93002": { profileCode: "TAL-93002", displayName: "Renata Salgado", city: "Playa del Carmen", country: "MX", languages: ["Español", "Inglés"], tradeEn: "Lash Artist", tradeEs: "Lashista" },
  "TAL-93103": { profileCode: "TAL-93103", displayName: "Linh Tran", city: "Austin", country: "US", languages: ["English"], tradeEn: "Nails & Lashes", tradeEs: "Uñas y pestañas" },
  "TAL-93104": { profileCode: "TAL-93104", displayName: "Leo Haddad Brows", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "Brow Artist", tradeEs: "Cejas" },
  "TAL-93105": { profileCode: "TAL-93105", displayName: "Sofía Rinaldi", city: "Ciudad de México", country: "MX", languages: ["Español", "Inglés"], tradeEn: "Makeup Artist", tradeEs: "Maquillista" },
  "TAL-93106": { profileCode: "TAL-93106", displayName: "Marcus Bell", city: "Los Angeles", country: "US", languages: ["English"], tradeEn: "Hair Stylist", tradeEs: "Estilista" },
  "TAL-93107": { profileCode: "TAL-93107", displayName: "Coleman Cuts", city: "Chicago", country: "US", languages: ["English"], tradeEn: "Barber", tradeEs: "Barbero" },
  "TAL-93011": { profileCode: "TAL-93011", displayName: "Mateo Ferrer", city: "Ciudad de México", country: "MX", languages: ["Español", "Inglés"], tradeEn: "Fashion Model", tradeEs: "Modelo de moda" },
  "TAL-93030": { profileCode: "TAL-93030", displayName: "Alex Treviño", city: "Monterrey", country: "MX", languages: ["Español"], tradeEn: "Handyperson", tradeEs: "Arreglos en casa" },
  "TAL-93001": { profileCode: "TAL-93001", displayName: "Valeria Ortiz", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "Dance Instructor", tradeEs: "Instructora de baile" },
  "TAL-93010": { profileCode: "TAL-93010", displayName: "Pablo Serrano", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "Personal Trainer", tradeEs: "Entrenador personal" },
  "TAL-93009": { profileCode: "TAL-93009", displayName: "Tomás Aguilar", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "Portrait Photographer", tradeEs: "Fotógrafo de retrato" },
  "TAL-93005": { profileCode: "TAL-93005", displayName: "Diego Navarro", city: "Ciudad de México", country: "MX", languages: ["Español"], tradeEn: "DJ", tradeEs: "DJ" },
  "TAL-93008": { profileCode: "TAL-93008", displayName: "Mariana Pech", city: "Mérida", country: "MX", languages: ["Español"], tradeEn: "Local Guide", tradeEs: "Guía local" },
};

const FOLIO_SECTIONS = ["Cover", "Chapters", "Rates", "Measures", "FAQ"] as const;
const MAISON_SECTIONS = ["Hero", "Work", "Menu", "Reviews", "About", "Visit", "FAQ"] as const;
const GRIDLINE_SECTIONS = ["Hero", "Tasks", "Services", "Specs", "Jobs", "FAQ"] as const;

function fromJson(d: JsonDemo): DemoProfileMeta {
  const settings = demoSiteSettingsFor(d.code);
  const currency = (d.services?.[0]?.cur as "MXN" | "USD" | undefined) ?? settings.currency;
  return {
    profileCode: d.code,
    displayName: d.name,
    trade: { en: d.profession ?? "Talent", es: d.profession ?? "Talento" },
    city: d.city || null,
    country: d.country === "US" ? "US" : d.country === "MX" ? "MX" : null,
    languages: d.langs,
    bookingMode: settings.bookingMode,
    currency,
    apps: [],
    sections: d.code.startsWith("TAL-932") || d.code === "TAL-93030" ? [...GRIDLINE_SECTIONS] : [...FOLIO_SECTIONS],
    siteLangs: (d.siteLangs?.filter((x): x is "es" | "en" => x === "es" || x === "en") ?? settings.siteLangs) as ("es" | "en")[],
  };
}

const BY_CODE: Record<string, DemoProfileMeta> = Object.fromEntries([
  ...FOLIO.map((d) => [d.code, fromJson(d)] as const),
  ...GRIDLINE.map((d) => [d.code, fromJson(d)] as const),
  ...Object.entries(EXTRA).map(([code, e]) => {
    const settings = demoSiteSettingsFor(code);
    const meta: DemoProfileMeta = {
      profileCode: code,
      displayName: e.displayName,
      trade: { en: e.tradeEn, es: e.tradeEs },
      city: e.city,
      country: e.country,
      languages: e.languages,
      bookingMode: settings.bookingMode,
      currency: settings.currency,
      apps: [],
      sections: code.startsWith("TAL-932") || code === "TAL-93030" ? [...GRIDLINE_SECTIONS] : code.startsWith("TAL-93011") || code.startsWith("TAL-9311") || code === "TAL-93004" ? [...FOLIO_SECTIONS] : [...MAISON_SECTIONS],
      siteLangs: settings.siteLangs,
    };
    return [code, meta] as const;
  }),
]);

function tradeFromProfessions(profs: GalleryProfession[]): { en: string; es: string } {
  if (profs.length === 0) return { en: "Talent", es: "Talento" };
  if (profs.length === 1) return GALLERY_PROFESSIONS[profs[0]!].label;
  return {
    en: profs.map((p) => GALLERY_PROFESSIONS[p].label.en).join(" & "),
    es: profs.map((p) => GALLERY_PROFESSIONS[p].label.es).join(" y "),
  };
}

/** Profile facts for the active gallery demo (rail + card chips). */
export function demoProfileMetaFor(demo: GalleryDemo | null | undefined): DemoProfileMeta | null {
  if (!demo) return null;
  const apps = appsForProfessions(demo.professions).map((a) => a.name.en);
  if (demo.source.kind === "demo-talent") {
    const known = BY_CODE[demo.source.profileCode];
    if (known) return { ...known, apps, trade: tradeFromProfessions(demo.professions) };
    const settings = demoSiteSettingsFor(demo.source.profileCode);
    return {
      profileCode: demo.source.profileCode,
      displayName: demo.source.displayName,
      trade: tradeFromProfessions(demo.professions),
      city: null,
      country: null,
      languages: settings.siteLangs.map((l) => (l === "es" ? "Español" : "English")),
      bookingMode: settings.bookingMode,
      currency: settings.currency,
      apps,
      sections: [...MAISON_SECTIONS],
      siteLangs: settings.siteLangs,
    };
  }
  if (demo.source.kind === "maison-seed") {
    return {
      profileCode: null,
      displayName: demo.name.en,
      trade: tradeFromProfessions(demo.professions),
      city: "Ciudad de México",
      country: "MX",
      languages: ["Español"],
      bookingMode: "instant",
      currency: "MXN",
      apps,
      sections: [...MAISON_SECTIONS],
      siteLangs: ["es"],
    };
  }
  return null;
}

/** Person name for a demo card; falls back to the trade label. */
export function demoCardPersonName(demo: GalleryDemo, locale: "en" | "es"): string {
  if (demo.source.kind === "demo-talent") return demo.source.displayName;
  return locale === "es" ? demo.name.es : demo.name.en;
}

export function demoCardInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
