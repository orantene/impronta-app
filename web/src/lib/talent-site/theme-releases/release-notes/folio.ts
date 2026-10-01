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
