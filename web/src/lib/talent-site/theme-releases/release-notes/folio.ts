/**
 * THEME RELEASES: authored notes for the Folio parity release (EN/ES), the Folio counterpart of
 * the Maison v2 modules. Folio now matches the TH02 mockup: the type scale is token-driven with
 * the mockup's sizes, the cover carries the italic serif line, the comp card is a compact dark
 * strip, the rate card stays stacked, and About is an optional block instead of a default page.
 *
 * Version 16 = max(catalog 14, snapshots 14/15, releases none) + 1, read from the live catalog 2026-10-01.
 */
import type { ReleaseNote } from "./maison-v2";

export const FOLIO_PARITY_NOTE = {
  en: "Folio now follows the design: smaller, steadier headings, a compact dark measures strip, stacked rates, an italic line over the cover photo and a one-row header on phones. About is now an optional block. Nothing on your page is removed.",
  es: "Folio ahora sigue al diseño: títulos más pequeños y estables, una tira de medidas oscura y compacta, tarifas en una columna, una línea en cursiva sobre la foto de portada y el encabezado en una sola fila en móvil. Sobre mí ahora es un bloque opcional. No se quita nada de tu página.",
} satisfies ReleaseNote;

export const FOLIO_RELEASE_PARITY = {
  design: "folio",
  toVersion: 16,
  /** Drop the About removal: a talent who has About keeps it. */
  dropIdPrefixes: ["layout:home:about"],
  notes: FOLIO_PARITY_NOTE,
  codeNotes: [
    {
      en: "The header stays on one row on phones: a long name is cut with an ellipsis instead of wrapping.",
      es: "El encabezado se queda en una sola fila en móvil: un nombre largo se corta con puntos suspensivos en lugar de saltar de línea.",
    },
    {
      en: "A long name no longer pushes the cover past the edge of the screen.",
      es: "Un nombre largo ya no empuja la portada fuera de la pantalla.",
    },
  ] satisfies ReleaseNote[],
  byItemId: {
    "token-default:type.section-title-size": {
      en: "Section and rate card titles are 44px (only if you have not changed the title size yourself).",
      es: "Los títulos de sección y de tarifas miden 44px (solo si no cambiaste el tamaño tú).",
    },
    "token-default:type.section-title-size-desktop": {
      en: "Section and rate card titles are 44px on desktop too (only if you have not changed it yourself).",
      es: "Los títulos de sección y de tarifas también miden 44px en escritorio (solo si no lo cambiaste tú).",
    },
    "token-default:type.hero-size-desktop": {
      en: "Your name on the cover is 105px on desktop and always fits the screen (only if you have not changed it yourself).",
      es: "Tu nombre en la portada mide 105px en escritorio y siempre cabe en la pantalla (solo si no lo cambiaste tú).",
    },
    "token-default:type.group-title-size": {
      en: "Chapter titles are 38px (only if you have not changed the size yourself).",
      es: "Los títulos de capítulo miden 38px (solo si no cambiaste el tamaño tú).",
    },
    "token-default:type.group-title-size-desktop": {
      en: "Chapter titles are 38px on desktop (only if you have not changed the size yourself).",
      es: "Los títulos de capítulo miden 38px en escritorio (solo si no cambiaste el tamaño tú).",
    },
    "token-default:type.footer-title-size": {
      en: "The closing line is 64px (only if you have not changed the size yourself).",
      es: "La frase final mide 64px (solo si no cambiaste el tamaño tú).",
    },
    "token-default:type.footer-title-size-desktop": {
      en: "The closing line is 64px on desktop too (only if you have not changed the size yourself).",
      es: "La frase final también mide 64px en escritorio (solo si no cambiaste el tamaño tú).",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;

export const FOLIO_NEUTRAL_NOTE = {
  en: "Folio no longer starts with sample wording. The chapter titles, credits, cover line, rates note and closing lines are now neutral, and the demo copy is gone from the design. Your own text is never replaced.",
  es: "Folio ya no empieza con texto de ejemplo. Los títulos de capítulo, los créditos, la línea de portada, la nota de tarifas y las frases finales ahora son neutros, y el texto de demostración salió del diseño. Tu propio texto nunca se reemplaza.",
} satisfies ReleaseNote;

/**
 * Version 17 = 16 + 1 (the sync computes max(catalog, snapshots, releases) + 1). The payload
 * stops carrying demo wording (credits, exits, runway, city, currency, show names); the Folio
 * demos get it back through the site-copy mechanism (`demos/folio-site-copy.ts`).
 */
export const FOLIO_RELEASE_NEUTRAL = {
  design: "folio",
  toVersion: 17,
  notes: FOLIO_NEUTRAL_NOTE,
  codeNotes: [] as ReleaseNote[],
  byItemId: {
    "variant-default:shell:header": {
      en: "The header links use the neutral chapter titles.",
      es: "Los enlaces del encabezado usan los títulos de capítulo neutros.",
    },
    "variant-default:home:hero/masthead": {
      en: "The cover no longer starts with a sample line and the contents list uses neutral titles.",
      es: "La portada ya no empieza con una línea de ejemplo y el índice usa títulos neutros.",
    },
    "variant-default:home:contents/contents": {
      en: "The contents list uses neutral chapter titles and no sample credits.",
      es: "El índice usa títulos de capítulo neutros y sin créditos de ejemplo.",
    },
    "variant-default:home:gallery/portfolio": {
      en: "The first chapter is titled Selected work, with no sample credit.",
      es: "El primer capítulo se llama Trabajos elegidos, sin crédito de ejemplo.",
    },
    "variant-default:home:gallery/portfolio#2": {
      en: "The second chapter is titled More work, with no sample credit.",
      es: "El segundo capítulo se llama Más trabajos, sin crédito de ejemplo.",
    },
  } as Record<string, ReleaseNote>,
} as const;
