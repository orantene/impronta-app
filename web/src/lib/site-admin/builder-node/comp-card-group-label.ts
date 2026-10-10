/**
 * Resolve a comp_card group heading for the visitor locale.
 * Prefer `profile_field_groups.name_i18n`, then curated slug maps, then a
 * last-resort title-cased slug (never leave Spanish sites on English-only
 * title-case for known catalog groups).
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

function asLocalizedMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function labelFromI18n(raw: unknown, locale: string, fallbackKey: string): string {
  const map = asLocalizedMap(raw);
  const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  return map[lang] || map.en || map.es || fallbackKey.split(".").pop() || fallbackKey;
}

/** Catalog group slugs from profile_field_groups seeds (en+es). */
const CURATED_GROUP_LABELS: Record<string, { en: string; es: string }> = {
  measurements: { en: "Measurements", es: "Medidas" },
  physical: { en: "Physical", es: "Físico" },
  "physical-casting": { en: "Physical / Casting", es: "Físico / Casting" },
  logistics: { en: "Logistics", es: "Logística" },
  availability: { en: "Availability", es: "Disponibilidad" },
  experience: { en: "Experience", es: "Experiencia" },
  basic_info: { en: "Basics", es: "Básicos" },
  "media-portfolio": { en: "Media / Portfolio", es: "Media / Portafolio" },
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
  "context-best-fit": { en: "Best Fit / Contexts", es: "Mejor Uso / Contexto" },
  "operational-requirements": {
    en: "Operational Requirements",
    es: "Requisitos Operativos",
  },
  "trust-verification": {
    en: "Trust / Verification",
    es: "Confianza / Verificación",
  },
};

export function resolveCompCardGroupLabel(
  slug: string | null,
  locale: string,
  nameI18n: unknown = null,
): string {
  if (!slug) return pickLocale(locale, { en: "Details", es: "Detalles" });

  const fromDb = asLocalizedMap(nameI18n);
  if (Object.keys(fromDb).length > 0) {
    return labelFromI18n(nameI18n, locale, slug);
  }

  const hit = CURATED_GROUP_LABELS[slug];
  if (hit) return pickLocale(locale, hit);
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
