/**
 * TUL-1857: platform-authored thread notes ("Contact details updated.") are stored in
 * English, so an ES client read them untranslated in Mensajes. Pure display-time
 * translation: the stored body stays the canonical English text, only the render changes.
 * Unknown bodies pass through untouched.
 */

const EXACT_ES: Readonly<Record<string, string>> = {
  "Contact details updated": "Datos de contacto actualizados.",
  "Contact details updated.": "Datos de contacto actualizados.",
  "Brief updated": "Resumen actualizado.",
  "Brief updated.": "Resumen actualizado.",
  "Let the agency recommend": "Que la agencia recomiende",
};

const MONTHS_ES: Readonly<Record<string, string>> = {
  jan: "ene", feb: "feb", mar: "mar", apr: "abr", may: "may", jun: "jun",
  jul: "jul", aug: "ago", sep: "sep", sept: "sep", oct: "oct", nov: "nov", dec: "dic",
};

/**
 * TUL-1888: a stored "Oct 24" / "Oct 24, 2026" reads "24 oct" / "24 oct 2026" for an ES viewer.
 * Anything that is not that exact shape passes through (guest free text is never rewritten).
 */
export function localizeShortDate(text: string, locale: string): string {
  if (locale !== "es") return text;
  const m = /^([A-Za-z]{3,4})\.? (\d{1,2})(?:, (\d{4}))?$/.exec(text.trim());
  const mon = m ? MONTHS_ES[m[1]!.toLowerCase()] : undefined;
  if (!m || !mon) return text;
  return `${m[2]} ${mon}${m[3] ? ` ${m[3]}` : ""}`;
}

const PATTERNS_ES: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Lineup · (\d+) talent$/, (m) => `Selección · ${m[1]} ${m[1] === "1" ? "talento" : "talentos"}`],
  [/^Event date set to (.+?)\.?$/, (m) => `Fecha del evento: ${localizeShortDate(m[1]!, "es")}.`],
  [/^Location set to (.+?)\.?$/, (m) => `Ubicación: ${m[1]}.`],
  [/^Headcount set to (.+?)\.?$/, (m) => `Número de personas: ${m[1]}.`],
  [/^Event type set to (.+?)\.?$/, (m) => `Tipo de evento: ${m[1]}.`],
  [/^Budget: (.+?)\.?$/, (m) => `Presupuesto: ${m[1]}.`],
  [/^Added: (.+)$/, (m) => `Agregado: ${localizeShortDate(m[1]!, "es")}`],
];

export function localizeSystemNote(body: string, locale: string): string {
  if (locale !== "es") return body;
  const trimmed = body.trim();
  const exact = EXACT_ES[trimmed];
  if (exact) return exact;
  for (const [re, build] of PATTERNS_ES) {
    const m = trimmed.match(re);
    if (m) return build(m);
  }
  return body;
}
