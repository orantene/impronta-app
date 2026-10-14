/**
 * TUL-581: pure SEO checklist + score for the talent dashboard.
 * Works only from data the profile already has (plus three cheap counts the
 * page loads). No queries, no side effects, never throws on a sparse profile.
 */
export type SeoLang = "en" | "es";

export type SeoInput = {
  bioLength?: number | null;
  photoCount?: number | null;
  /** Active services that show a price. */
  pricedServiceCount?: number | null;
  homeCity?: string | null;
  languageCount?: number | null;
  published?: boolean | null;
  reviewCount?: number | null;
  hasCustomDomain?: boolean | null;
};

export type SeoItemId =
  | "bio"
  | "photos"
  | "services"
  | "city"
  | "languages"
  | "published"
  | "reviews"
  | "domain";

export type SeoItem = {
  id: SeoItemId;
  weight: number;
  done: boolean;
  label: string;
  fix: string;
  href: string;
};

export type SeoScore = {
  score: number;
  items: SeoItem[];
  /** Highest-weight item still open, or null at 100. */
  next: SeoItem | null;
};

export const SEO_MIN_BIO = 120;
export const SEO_MIN_PHOTOS = 5;
export const SEO_MIN_SERVICES = 3;

const META: Record<SeoItemId, { weight: number; href: string; en: [string, string]; es: [string, string] }> = {
  published: {
    weight: 15,
    href: "/talent/site",
    en: ["Site is published", "Publish your site so Google can find it."],
    es: ["Sitio publicado", "Publica tu sitio para que Google pueda encontrarlo."],
  },
  services: {
    weight: 20,
    href: "/talent/services",
    en: ["3 services with prices", "Add at least 3 services and show a price on each."],
    es: ["3 servicios con precio", "Agrega al menos 3 servicios y muestra un precio en cada uno."],
  },
  bio: {
    weight: 15,
    href: "/talent/profile",
    en: ["A real bio", "Write a bio of at least 120 characters about what you do."],
    es: ["Una bio completa", "Escribe una bio de al menos 120 caracteres sobre lo que haces."],
  },
  photos: {
    weight: 15,
    href: "/talent/profile",
    en: ["5 or more photos", "Upload at least 5 photos of your work."],
    es: ["5 fotos o más", "Sube al menos 5 fotos de tu trabajo."],
  },
  city: {
    weight: 10,
    href: "/talent/profile",
    en: ["City is set", "Set your city so local searches match you."],
    es: ["Ciudad definida", "Define tu ciudad para aparecer en búsquedas locales."],
  },
  languages: {
    weight: 10,
    href: "/talent/profile",
    en: ["Languages listed", "Add the languages you work in."],
    es: ["Idiomas indicados", "Agrega los idiomas en los que trabajas."],
  },
  reviews: {
    weight: 10,
    href: "/talent/reviews",
    en: ["Has reviews", "Ask a happy client for a review."],
    es: ["Tiene reseñas", "Pide una reseña a un cliente contento."],
  },
  domain: {
    weight: 5,
    href: "/talent/site",
    en: ["Your own domain (bonus)", "Connect your own domain for a stronger presence."],
    es: ["Tu propio dominio (extra)", "Conecta tu propio dominio para una presencia más fuerte."],
  },
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function buildSeoScore(input: SeoInput | null | undefined, lang: SeoLang = "en"): SeoScore {
  const i = input ?? {};
  const done: Record<SeoItemId, boolean> = {
    published: i.published === true,
    services: n(i.pricedServiceCount) >= SEO_MIN_SERVICES,
    bio: n(i.bioLength) >= SEO_MIN_BIO,
    photos: n(i.photoCount) >= SEO_MIN_PHOTOS,
    city: typeof i.homeCity === "string" && i.homeCity.trim().length > 0,
    languages: n(i.languageCount) >= 1,
    reviews: n(i.reviewCount) >= 1,
    domain: i.hasCustomDomain === true,
  };
  const items = (Object.keys(META) as SeoItemId[]).map((id): SeoItem => {
    const m = META[id];
    const [label, fix] = m[lang === "es" ? "es" : "en"];
    return { id, weight: m.weight, done: done[id], label, fix, href: m.href };
  });
  const score = items.reduce((s, it) => s + (it.done ? it.weight : 0), 0);
  const next = items.filter((it) => !it.done).sort((a, b) => b.weight - a.weight)[0] ?? null;
  return { score, items, next };
}
