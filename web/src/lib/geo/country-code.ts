/**
 * Country normalisation (TUL-649). `talent_profiles.home_country_text` held
 * "MX", "México", "Mexico" and "mexico" side by side. Writers now store the
 * ISO-3166 alpha-2 code; readers show a name through `countryLabel`.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}️‍]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

let nameIndex: Map<string, string> | null = null;
let validCodes: Set<string> | null = null;

function buildIndex(): Map<string, string> {
  if (nameIndex) return nameIndex;
  const index = new Map<string, string>();
  const valid = new Set<string>();
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const es = new Intl.DisplayNames(["es"], { type: "region" });
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const code = `${a}${b}`;
      let name: string | undefined;
      try {
        name = en.of(code);
      } catch {
        continue;
      }
      // Unknown regions echo the code back.
      if (!name || name === code || /^unknown/i.test(name)) continue;
      valid.add(code);
      index.set(fold(name), code);
      const esName = es.of(code);
      if (esName && esName !== code) index.set(fold(esName), code);
    }
  }
  const aliases: Record<string, string> = {
    usa: "US",
    "u s a": "US",
    "united states of america": "US",
    eeuu: "US",
    "ee uu": "US",
    uk: "GB",
    "great britain": "GB",
    england: "GB",
    "estados unidos de america": "US",
    "mexico city": "MX",
  };
  for (const [k, v] of Object.entries(aliases)) index.set(k, v);
  nameIndex = index;
  validCodes = valid;
  return index;
}

/** ISO-3166 alpha-2 (upper case) for a code or a country name in EN/ES, else null. */
export function normalizeCountryCode(value: string | null | undefined): string | null {
  const t = fold(value ?? "");
  if (!t) return null;
  const index = buildIndex();
  if (/^[a-z]{2}$/.test(t)) {
    const code = t.toUpperCase();
    return validCodes?.has(code) ? code : null;
  }
  return index.get(t) ?? null;
}

/**
 * What to store: the ISO code when the input is recognisable, otherwise the
 * trimmed input (never silently drop what a person typed), or null if empty.
 */
export function countryForStorage(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return normalizeCountryCode(trimmed) ?? trimmed;
}

/** Display name for a stored value: a code becomes its name, anything else passes through. */
export function countryLabel(
  value: string | null | undefined,
  locale: "en" | "es" = "en",
): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed;
  const code = normalizeCountryCode(trimmed);
  if (!code) return trimmed;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? trimmed;
  } catch {
    return trimmed;
  }
}
