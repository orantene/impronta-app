/**
 * EN/ES copy for the P4 Theme detail upgrade (demo strip, sheets, colors
 * kept). Kept beside `maison-setup-copy.ts` (shared with the gallery agent)
 * so the two branches do not conflict; falls back to `maisonSetupT`.
 */
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

const ES: Record<string, string> = {
  "All themes": "Todos los temas",
  "Results for": "Resultados para",
  Demos: "Demos",
  "Preview planned": "Vista planeada",
  "Showing the featured demo · this demo's preview is planned":
    "Se muestra el demo destacado · la vista de este demo está planeada",
  "Each demo can change photos, sample text, sections and its default colors.":
    "Cada demo puede cambiar fotos, textos, secciones y sus colores base.",
  "Switching demo changes photos, sample text and sections. Colors change only when you pick a palette.":
    "Cambiar de demo cambia fotos, textos y secciones. Los colores solo cambian cuando eliges una paleta.",
  "My colors": "Mis colores",
  "the same when you switch demos": "no cambian al cambiar de demo",
  "✓ Colors unchanged": "✓ Colores sin cambios",
  "Import starter content from this demo ›": "Importar contenido inicial de este demo ›",
  "Use demo content ›": "Usar contenido del demo ›",
  Personalise: "Personalizar",
  "Demo content": "Contenido de demo",
  "Demo colors": "Colores del demo",
  "Use demo colors": "Usar colores del demo",
  "Custom colors": "Colores propios",
  "High contrast": "Alto contraste",
  Dark: "Oscuro",
  Selected: "Seleccionado",
  "This demo": "Este demo",
  City: "Ciudad",
  Languages: "Idiomas",
  Booking: "Reservas",
  Currency: "Moneda",
  Apps: "Apps",
  Sections: "Secciones",
  "No apps": "Sin apps",
  "City not set": "Ciudad no definida",
  "Layout and sample content change. Your services, prices and domain stay yours.":
    "Cambian el diseño y el contenido de muestra. Tus servicios, precios y dominio se quedan.",
  "What changes: layout, colours, sections, apps. What stays yours: services, prices, booking settings, languages, domain.":
    "Qué cambia: diseño, colores, secciones, apps. Qué se queda: servicios, precios, ajustes de reserva, idiomas, dominio.",
};

export function detailT(locale: MaisonSetupLocale, key: string): string {
  if (locale === "es") return ES[key] ?? maisonSetupT(locale, key);
  return key;
}

/** `Results for "Model"` with typographic quotes. */
export function resultsForLabel(locale: MaisonSetupLocale, query: string): string {
  return `${detailT(locale, "Results for")} “${query}”`;
}

export function demosCountLabel(locale: MaisonSetupLocale, n: number): string {
  return `${detailT(locale, "Demos")} · ${n}`;
}
