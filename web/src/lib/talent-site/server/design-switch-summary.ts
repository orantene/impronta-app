/**
 * TUL-536: turn a Design switch's `warned` list into the short, human lists the
 * "Change your design?" sheet shows (pure; unit-tested).
 *
 * - hidden: theme sections the new Design has no match for (they are dropped
 *   from the draft; the old Design / History brings them back).
 * - kept: sections she added herself (carried over, appended).
 * Child nodes of a hidden section are not listed separately.
 */
import type { DesignSwitchWarn } from "./design-switch";

export type DesignSwitchSummary = { hidden: string[]; kept: string[] };

const ES_WORDS: Record<string, string> = {
  hero: "Portada",
  about: "Acerca de",
  services: "Servicios",
  service: "Servicio",
  menu: "Menú",
  gallery: "Galería",
  reviews: "Reseñas",
  review: "Reseña",
  faq: "Preguntas frecuentes",
  contact: "Contacto",
  footer: "Pie de página",
  header: "Encabezado",
  booking: "Reservas",
  pricing: "Precios",
  prices: "Precios",
  video: "Video",
  testimonials: "Testimonios",
  wall: "muro",
  band: "banda",
};

function humanize(raw: string, locale: "en" | "es"): string {
  const last = raw.split("/").filter(Boolean).pop() ?? raw;
  const words = last.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return raw;
  const mapped =
    locale === "es" ? words.map((w) => ES_WORDS[w.toLowerCase()] ?? w.toLowerCase()) : words;
  const text = mapped.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function summarizeSwitchWarnings(
  warned: ReadonlyArray<DesignSwitchWarn>,
  locale: "en" | "es",
): DesignSwitchSummary {
  const hiddenKeys = warned
    .filter((w) => w.reason === "no_match" && w.key)
    .map((w) => w.key as string);
  const hidden = new Set<string>();
  for (const key of hiddenKeys) {
    // Skip children of another hidden section ("home/a/b" under "home/a").
    if (hiddenKeys.some((other) => other !== key && key.startsWith(`${other}/`))) continue;
    if (key.split("/").length > 2) continue;
    hidden.add(humanize(key, locale));
  }
  const kept = new Set<string>();
  for (const w of warned) {
    if (w.reason === "talent_added") kept.add(humanize(w.kind, locale));
  }
  return { hidden: [...hidden], kept: [...kept] };
}
