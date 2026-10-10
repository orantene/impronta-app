/**
 * Locale-aware label for a `profile_field_groups` row.
 *
 * Prefer DB `name_en` / `name_es`. Fall back to a curated map for known slugs,
 * then a localized "Details" bucket — never title-case the slug (that left
 * English headings like "Context Best Fit" on Spanish public sites; TUL-209).
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export type FieldGroupLabelNames = {
  name_en?: string | null;
  name_es?: string | null;
};

/** Seeded catalog labels (migration field_architecture_v1 + later adds). */
const CURATED: Record<string, { en: string; es: string }> = {
  "physical-casting": { en: "Physical / Casting", es: "Físico / Casting" },
  "media-portfolio": { en: "Media / Portfolio", es: "Media / Portafolio" },
  experience: { en: "Experience", es: "Experiencia" },
  "service-area-travel": {
    en: "Service Area / Travel",
    es: "Zona de Servicio / Viajes",
  },
  "languages-communication": {
    en: "Languages / Communication",
    es: "Idiomas / Comunicación",
  },
  "sales-client-interaction": {
    en: "Sales / Client Interaction",
    es: "Ventas / Atención al Cliente",
  },
  "equipment-tools": { en: "Equipment / Tools", es: "Equipo / Herramientas" },
  "certifications-documents": {
    en: "Certifications / Documents",
    es: "Certificaciones / Documentos",
  },
  "rates-booking": { en: "Rates / Booking Terms", es: "Tarifas / Condiciones" },
  availability: { en: "Availability", es: "Disponibilidad" },
  "context-best-fit": { en: "Best Fit / Contexts", es: "Mejor Uso / Contexto" },
  "operational-requirements": {
    en: "Operational Requirements",
    es: "Requisitos Operativos",
  },
  "trust-verification": {
    en: "Trust / Verification",
    es: "Confianza / Verificación",
  },
  // Legacy short slugs still seen on older embeds / hubs
  measurements: { en: "Measurements", es: "Medidas" },
  physical: { en: "Physical", es: "Físico" },
  logistics: { en: "Logistics", es: "Logística" },
  basic_info: { en: "Basics", es: "Básicos" },
  rates: { en: "Rates", es: "Tarifas" },
  preferences: { en: "Preferences", es: "Preferencias" },
};

export function resolveFieldGroupLabel(
  slug: string | null | undefined,
  locale: string,
  names?: FieldGroupLabelNames | null,
): string {
  const en = typeof names?.name_en === "string" ? names.name_en.trim() : "";
  const es = typeof names?.name_es === "string" ? names.name_es.trim() : "";
  if (en || es) {
    return pickLocale(locale, { en: en || es, es: es || en });
  }
  if (!slug) return pickLocale(locale, { en: "Details", es: "Detalles" });
  const hit = CURATED[slug];
  if (hit) return pickLocale(locale, hit);
  // Unknown slug: keep a stable generic bucket (do not invent English title-case).
  return pickLocale(locale, { en: "Details", es: "Detalles" });
}
