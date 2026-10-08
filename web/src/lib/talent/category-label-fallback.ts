/**
 * TUL-15: the category a services catalog shows, in the visitor's language,
 * when a talent wrote the category in ONE language only.
 *
 * Order, first hit wins:
 *  1. the talent's own words: `category_i18n[locale]` (then the rest of the
 *     chain), never touched;
 *  2. ONLY when the category text is one of the platform's standard trade
 *     categories (the dictionary below, curated platform copy, not the
 *     talent's words): the platform translation for the visitor's language;
 *  3. else the category as written.
 *
 * The dictionary is deliberately small and exact-match on the whole category
 * text (case and accent insensitive). "Uñas y pedicura" is a talent's own
 * phrase and is never translated. Pure (no React / no IO).
 */

type Pair = { readonly en: string; readonly es: string };

/** Standard trade categories, platform copy: English label and Spanish label. */
export const PLATFORM_CATEGORY_DICTIONARY: ReadonlyArray<Pair> = [
  { en: "Lashes", es: "Pestañas" },
  { en: "Nails", es: "Uñas" },
  { en: "Brows", es: "Cejas" },
  { en: "Facial", es: "Facial" },
  { en: "Massages", es: "Masajes" },
  { en: "Waxing", es: "Depilación" },
  { en: "Hair", es: "Cabello" },
  { en: "Makeup", es: "Maquillaje" },
  { en: "Lifting", es: "Lifting" },
  { en: "Extensions", es: "Extensiones" },
  { en: "Events", es: "Eventos" },
  { en: "Workshops", es: "Talleres" },
  { en: "Classes", es: "Clases" },
];

/** Singular and alternate spellings that map onto a pair (keyed by its English label). */
const ALIASES: Readonly<Record<string, string>> = {
  lash: "Lashes",
  nail: "Nails",
  brow: "Brows",
  eyebrows: "Brows",
  massage: "Massages",
  masaje: "Massages",
  "make up": "Makeup",
  "make-up": "Makeup",
  extension: "Extensions",
  event: "Events",
  evento: "Events",
  workshop: "Workshops",
  taller: "Workshops",
  class: "Classes",
  clase: "Classes",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const BY_TERM: ReadonlyMap<string, Pair> = (() => {
  const byEn = new Map(PLATFORM_CATEGORY_DICTIONARY.map((p) => [p.en, p] as const));
  const m = new Map<string, Pair>();
  for (const p of PLATFORM_CATEGORY_DICTIONARY) {
    m.set(norm(p.en), p);
    m.set(norm(p.es), p);
  }
  for (const [alias, en] of Object.entries(ALIASES)) {
    const p = byEn.get(en);
    if (p && !m.has(norm(alias))) m.set(norm(alias), p);
  }
  return m;
})();

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** The platform translation of a standard category for `locale`, or null. */
export function platformCategoryLabel(
  category: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const text = (category ?? "").trim();
  if (!text) return null;
  const pair = BY_TERM.get(norm(text));
  if (!pair) return null;
  const lang = key(locale);
  if (lang === "en") return pair.en;
  if (lang === "es") return pair.es;
  return null;
}

/**
 * The label to draw for a category, or undefined when the plain `category`
 * is already right (so callers keep no `categoryLabel` exactly as before).
 */
export function resolveCategoryLabel(args: {
  category: string | null | undefined;
  categoryI18n: Readonly<Record<string, string | null | undefined>> | null | undefined;
  locale: string | null | undefined;
  chain?: readonly string[];
}): string | undefined {
  const category = (args.category ?? "").trim();
  const locale = key(args.locale);
  for (const code of [locale, ...(args.chain ?? [])]) {
    const own = (args.categoryI18n?.[code] ?? "").trim();
    if (own) return own === category ? undefined : own;
  }
  const platform = platformCategoryLabel(category, locale);
  if (platform && platform !== category) return platform;
  return undefined;
}
