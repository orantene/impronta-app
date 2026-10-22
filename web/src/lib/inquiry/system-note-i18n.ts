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
};

const PATTERNS_ES: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Event date set to (.+?)\.?$/, (m) => `Fecha del evento: ${m[1]}.`],
  [/^Location set to (.+?)\.?$/, (m) => `Ubicación: ${m[1]}.`],
  [/^Headcount set to (.+?)\.?$/, (m) => `Número de personas: ${m[1]}.`],
  [/^Event type set to (.+?)\.?$/, (m) => `Tipo de evento: ${m[1]}.`],
  [/^Budget: (.+?)\.?$/, (m) => `Presupuesto: ${m[1]}.`],
  [/^Added: (.+)$/, (m) => `Agregado: ${m[1]}`],
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
