/**
 * Hub profile field-group headings and stat chips that stayed English on /es/t
 * pages (TUL-736). Pure; the page passes its request locale.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const GROUPS: Record<string, { en: string; es: string }> = {
  measurements: { en: "Measurements", es: "Medidas" },
  physical: { en: "Physical", es: "Físico" },
  physical_casting: { en: "Physical casting", es: "Casting físico" },
  casting: { en: "Casting", es: "Casting" },
  casting_identity: { en: "Casting identity", es: "Identidad de casting" },
  sales_client_interaction: { en: "Sales and client interaction", es: "Ventas y trato con clientes" },
  service_area_travel: { en: "Service area and travel", es: "Zona de servicio y viajes" },
  logistics: { en: "Logistics", es: "Logística" },
  availability: { en: "Availability", es: "Disponibilidad" },
  experience: { en: "Experience", es: "Experiencia" },
  rates: { en: "Rates", es: "Tarifas" },
  preferences: { en: "Preferences", es: "Preferencias" },
};

/** Heading for a field-group slug, localized; unknown slugs are title-cased. */
export function fieldGroupLabel(slug: string | null, locale: string): string {
  if (!slug) return pickLocale(locale, { en: "Details", es: "Detalles" });
  const hit = GROUPS[slug.replace(/-/g, "_").toLowerCase()];
  if (hit) return pickLocale(locale, hit);
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** "16 works" / "16 trabajos" chip beside the portfolio heading. */
export function worksLabel(count: number, locale: string): string {
  return pickLocale(locale, {
    en: `${count} works`,
    es: `${count} ${count === 1 ? "trabajo" : "trabajos"}`,
  });
}
