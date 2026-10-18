/**
 * TUL-738 / TUL-699: the /discover-agencies page keeps English values as its
 * filter keys (URL params, card data), but every label a visitor reads must
 * follow the page language. On /es the filter selects, card badges, city line,
 * tags, description and stats all painted English. This module is the display
 * side only: values stay English, labels come from here. Pure, no I/O.
 */
import { spanishPlaceName } from "@/lib/i18n/place-names-es";

const isEs = (locale: string): boolean => (locale ?? "").slice(0, 2).toLowerCase() === "es";

const ES_LABELS: Readonly<Record<string, string>> = {
  // Type
  All: "Todos",
  Agency: "Agencia",
  Hub: "Red",
  // Categories
  Models: "Modelos",
  Beauty: "Belleza",
  Food: "Gastronomía",
  Home: "Hogar",
  Music: "Música",
  Events: "Eventos",
  Professional: "Profesionales",
  // Locations
  "All locations": "Todas las ubicaciones",
  Remote: "Remoto",
  // Join modes
  "Open now": "Abierto ahora",
  Approval: "Con aprobación",
  Curated: "Por curaduría",
  // Regions
  "Riviera Maya": "Riviera Maya",
  "South Florida": "Sur de Florida",
  Spain: "España",
  "Network-wide": "Toda la red",
  Digital: "Digital",
  // Stats
  Roster: "Equipo",
  Focus: "Enfoque",
  Image: "Imagen",
  Apply: "Postulación",
  Open: "Abierta",
  Reach: "Alcance",
  Global: "Global",
  Response: "Respuesta",
  Fast: "Rápida",
  Work: "Trabajo",
  Clients: "Clientes",
  Homes: "Hogares",
  Mode: "Modo",
  Managed: "Gestionado",
  Offer: "Oferta",
  Tier: "Nivel",
  Join: "Unirse",
  Free: "Gratis",
  Fit: "Perfil",
  Talent: "Talento",
};

/**
 * Spanish descriptions per card id. A card id missing here falls back to the
 * English description, which the static test guards against by listing ids.
 */
const ES_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "impronta-models":
    "Talento de moda, resort, lifestyle y creadores para marcas, hospitalidad y producciones en Tulum y Cancún.",
  "tulala-service-hub":
    "Una red amplia de servicios para personal de limpieza, chefs, profesionales de belleza, asistentes, creativos y negocios especializados listos para recibir solicitudes.",
  "nova-crew":
    "Personal para eventos, artistas, anfitriones, músicos y talento listo para producción en lanzamientos, sesiones y experiencias privadas.",
  "atelier-care":
    "Limpieza premium, cuidado del hogar, personal para residencias y profesionales de conserjería con una atención al cliente impecable.",
  "table-studio":
    "Chefs privados, caterers, food stylists y productores de eventos presentados en un sitio premium que prioriza la consulta.",
  "creator-hub":
    "Una capa de descubrimiento para cantantes, presentadores, creadores, maquillistas y talento de servicios frente a cámara que buscan solicitudes pagadas.",
};

/** Display label for a filter option / badge / tag / stat word. */
export function discoveryLabel(value: string, locale: string): string {
  if (!isEs(locale)) return value;
  return ES_LABELS[value] ?? spanishPlaceName(value, locale);
}

/** Display label for a city or region ("Mexico City" -> "Ciudad de México"). */
export function discoveryPlace(value: string, locale: string): string {
  if (!isEs(locale)) return value;
  return ES_LABELS[value] ?? spanishPlaceName(value, locale);
}

export function discoveryDescription(id: string, english: string, locale: string): string {
  return isEs(locale) ? (ES_DESCRIPTIONS[id] ?? english) : english;
}

export const DISCOVERY_DESCRIPTION_IDS: readonly string[] = Object.keys(ES_DESCRIPTIONS);
