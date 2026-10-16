/**
 * Platform dictionary for a few standard service titles, same shape as
 * `category-label-fallback.ts`. Used only when the talent has no title in the
 * visitor's language: a Spanish visitor should not see English nail-menu words
 * for names the platform already knows how to say.
 *
 * Exact match on the whole title (case and accent insensitive). Brand names
 * that stay the same in both languages (Soft Gel, Acrygel, Rubber Gel) are
 * not listed. Pure (no React / no IO).
 */

/** `enToEsOnly`: an EN title gets the ES name, but a title she wrote in ES is never turned into EN. */
type Pair = { readonly en: string; readonly es: string; readonly enToEsOnly?: true };

/** Curated platform copy for common descriptive service titles. */
export const PLATFORM_SERVICE_TITLE_DICTIONARY: ReadonlyArray<Pair> = [
  { en: "Semi-permanent gel", es: "Gel semipermanente" },
  { en: "Soft gel extensions", es: "Extensiones de gel blando" },
  { en: "Gel pedicure", es: "Gel en pies" },
  { en: "Gel polish removal", es: "Remoción de semipermanente" },
  { en: "Acrylic, polygel or soft gel removal", es: "Remoción de acrílico, polygel o Soft Gel" },
  { en: "Russian manicure with gel", es: "Manicura rusa con gel" },
  { en: "Semi-permanent gel, hands", es: "Esmaltado semipermanente, manos" },
  // TUL-975: common generic titles seen on the ES booking page (one way: her Spanish stays hers on /en).
  { en: "Gel manicure", es: "Manicura en gel", enToEsOnly: true },
  { en: "Massage", es: "Masaje", enToEsOnly: true },
  { en: "Couples massage", es: "Masaje en pareja", enToEsOnly: true },
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const BY_TERM: ReadonlyMap<string, Pair> = (() => {
  const m = new Map<string, Pair>();
  for (const p of PLATFORM_SERVICE_TITLE_DICTIONARY) {
    m.set(norm(p.en), p);
    if (!p.enToEsOnly) m.set(norm(p.es), p);
  }
  return m;
})();

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** Platform translation of a known service title for `locale`, or null. */
export function platformServiceTitle(
  title: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const text = (title ?? "").trim();
  if (!text) return null;
  const pair = BY_TERM.get(norm(text));
  if (!pair) return null;
  const lang = key(locale);
  if (lang === "en") return pair.enToEsOnly ? null : pair.en;
  if (lang === "es") return pair.es;
  return null;
}
