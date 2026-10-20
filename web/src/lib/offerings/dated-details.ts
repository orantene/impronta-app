/**
 * dated-details.ts — the info fields any business can switch on for an item
 * sold as dated places with seats (TUL-1344 slice 5): meeting point, program,
 * what to bring, requirements, languages, minimum age, included, not included.
 *
 * Stored on `talent_offerings.dated_details_i18n` (held migration) as
 * `{ "<locale>": { "<field>": "text" } }`. Pure: no I/O. A field with no text
 * is simply not shown, so a trade switches a field on by filling it.
 *
 * Works without the column: callers read it failure-tolerantly and an absent
 * value parses to `{}`.
 */

export const DATED_DETAIL_LOCALES = ["en", "es", "fr"] as const;
export type DatedDetailLocale = (typeof DATED_DETAIL_LOCALES)[number];

export const DATED_DETAIL_FIELDS = [
  { id: "meetingPoint", en: "Meeting point", es: "Punto de encuentro" },
  { id: "program", en: "Program", es: "Programa" },
  { id: "whatToBring", en: "What to bring", es: "Qué traer" },
  { id: "requirements", en: "Requirements", es: "Requisitos" },
  { id: "languages", en: "Languages", es: "Idiomas" },
  { id: "minAge", en: "Minimum age", es: "Edad mínima" },
  { id: "included", en: "Included", es: "Incluye" },
  { id: "notIncluded", en: "Not included", es: "No incluye" },
] as const;

export type DatedDetailField = (typeof DATED_DETAIL_FIELDS)[number]["id"];
export type DatedDetailsLocaleValues = Partial<Record<DatedDetailField, string>>;
export type DatedDetails = Partial<Record<DatedDetailLocale, DatedDetailsLocaleValues>>;

export const DATED_DETAIL_MAX_CHARS = 2000;

const FIELD_IDS = new Set<string>(DATED_DETAIL_FIELDS.map((f) => f.id));
const LOCALES = new Set<string>(DATED_DETAIL_LOCALES);

export function datedFieldLabel(field: DatedDetailField, locale: string): string {
  const f = DATED_DETAIL_FIELDS.find((x) => x.id === field);
  if (!f) return field;
  return locale.toLowerCase().startsWith("es") ? f.es : f.en;
}

/** Stored JSON → typed value. Unknown locales, unknown fields and non-strings are dropped. */
export function parseDatedDetails(raw: unknown): DatedDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DatedDetails = {};
  for (const [locale, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!LOCALES.has(locale) || !values || typeof values !== "object" || Array.isArray(values)) continue;
    const kept: DatedDetailsLocaleValues = {};
    for (const [field, text] of Object.entries(values as Record<string, unknown>)) {
      if (FIELD_IDS.has(field) && typeof text === "string") kept[field as DatedDetailField] = text;
    }
    if (Object.keys(kept).length > 0) out[locale as DatedDetailLocale] = kept;
  }
  return out;
}

/** What gets written: trimmed, capped, blanks removed, minimum age a whole number 0 to 120. */
export function sanitizeDatedDetails(raw: unknown): DatedDetails {
  const parsed = parseDatedDetails(raw);
  const out: DatedDetails = {};
  for (const [locale, values] of Object.entries(parsed) as Array<[DatedDetailLocale, DatedDetailsLocaleValues]>) {
    const kept: DatedDetailsLocaleValues = {};
    for (const [field, text] of Object.entries(values) as Array<[DatedDetailField, string]>) {
      const t = text.trim().slice(0, DATED_DETAIL_MAX_CHARS);
      if (!t) continue;
      if (field === "minAge") {
        if (!/^\d{1,3}$/.test(t)) continue;
        const n = Number.parseInt(t, 10);
        if (n < 0 || n > 120) continue;
        kept[field] = String(n);
        continue;
      }
      kept[field] = t;
    }
    if (Object.keys(kept).length > 0) out[locale] = kept;
  }
  return out;
}

export type ResolvedDetail = { field: DatedDetailField; label: string; value: string };

/**
 * The rows a page shows. Per field: the viewer's locale, then English, then any
 * other locale that has text, so a field filled in one language is never hidden.
 */
export function resolveDatedDetails(data: DatedDetails, locale: string): ResolvedDetail[] {
  const want: DatedDetailLocale = locale.toLowerCase().startsWith("es") ? "es" : locale.toLowerCase().startsWith("fr") ? "fr" : "en";
  const order: DatedDetailLocale[] = [want, "en", ...DATED_DETAIL_LOCALES.filter((l) => l !== want && l !== "en")];
  const rows: ResolvedDetail[] = [];
  for (const f of DATED_DETAIL_FIELDS) {
    for (const l of order) {
      const v = data[l]?.[f.id]?.trim();
      if (v) {
        rows.push({ field: f.id, label: datedFieldLabel(f.id, locale), value: v });
        break;
      }
    }
  }
  return rows;
}

const HOSTS: Array<{ match: RegExp; en: string; es: string }> = [
  { match: /^(class|clase|workshop|taller|course|curso|session|sesi[oó]n|clinic|cl[ií]nica)$/i, en: "Instructor", es: "Instructor" },
  { match: /^(departure|salida|tour|trip|viaje|retreat|retiro)$/i, en: "Guide", es: "Guía" },
  { match: /^(show|funci[oó]n|night|noche|screening)$/i, en: "Performer", es: "Artista" },
];

/**
 * The word for the person who leads a date, from the trade's own word for one
 * date (the words engine's `events.session`). Unknown words read "Host".
 */
export function hostLabel(dateWord: string, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  const hit = HOSTS.find((h) => h.match.test(dateWord.trim()));
  if (hit) return es ? hit.es : hit.en;
  return es ? "Anfitrión" : "Host";
}
