/**
 * Locale resolution for compare-table text.
 *
 * A separate module ON PURPOSE: `get-compare-table.ts` pulls in the
 * service-role client, which imports `server-only`, and that kills a pure
 * `tsx --test` lane at load. Keeping the resolver here means the behaviour
 * below can be tested without a server runtime.
 */

import { COMPARE_CATEGORY_LABEL } from "./pricing-types";

/**
 * A locale map as it arrives from the database: `jsonb`, which is `unknown`
 * shaped. Typing it as a Record would be a claim about data the database does
 * not enforce, so the narrowing happens here instead of at the cast site.
 */
export type LocaleMap = unknown;

function isSpanishLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

/**
 * Read a locale map, falling back to the English column.
 *
 * The fallback is the load-bearing part. A blank cell in a pricing table does
 * not read as "not translated yet", it reads as "this plan does not include
 * it". So a missing translation must degrade to English and never to empty, or
 * a content gap silently becomes a false product claim.
 *
 * Empty and whitespace-only strings count as missing. They are the dangerous
 * case: the key is present, so a plain `?? fallback` keeps them and the cell
 * renders blank.
 */
export function pickLabel(
  map: LocaleMap,
  fallback: string,
  locale: string,
): string {
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    return fallback;
  }
  const value = (map as Record<string, unknown>)[locale];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/** Column chrome: the "Feature" header on the compare matrix (GRK-013). */
export function compareFeatureColumnLabel(locale: string): string {
  return isSpanishLocale(locale) ? "Función" : "Feature";
}

const ES_COMPARE_CATEGORY_LABEL: Record<string, string> = {
  pipeline: "Pipeline de solicitud a reserva",
  notifications: "Notificaciones y mensajería",
  roster_site: "Roster y sitio",
  media: "Medios y marca",
  team_access: "Equipo y acceso",
  network_data: "Red y datos",
};

/** Section headings for `product_features.category` (GRK-013). */
export function compareCategoryLabel(category: string, locale: string): string {
  if (isSpanishLocale(locale)) {
    return (
      ES_COMPARE_CATEGORY_LABEL[category] ??
      COMPARE_CATEGORY_LABEL[category] ??
      category
    );
  }
  return COMPARE_CATEGORY_LABEL[category] ?? category;
}

const EN_TIER_CAPTIONS: Record<string, string> = {
  free: "Every operator, forever.",
  studio: "Solo + small team, on WhatsApp.",
  agency: "Teams running representation.",
  hub: "Staffing, casting, and scale.",
};

const ES_TIER_CAPTIONS: Record<string, string> = {
  free: "Para todo operador, siempre.",
  studio: "Solo o equipo pequeño, en WhatsApp.",
  agency: "Equipos de representación.",
  hub: "Staffing, casting y escala.",
};

/** Default one-line captions under each tier name (GRK-013). */
export function compareTierCaptions(locale: string): Record<string, string> {
  return isSpanishLocale(locale) ? ES_TIER_CAPTIONS : EN_TIER_CAPTIONS;
}
