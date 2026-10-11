/**
 * Chrome copy for the public Global Talent Directory (`/directory`, `/es/directory`).
 *
 * Plain module, shared by the RSC page, the server action and the client shell.
 * Talent data (names, bios, category labels) is NOT here: category labels are
 * localized server-side from `taxonomy_terms.name_i18n` (see loadDirectoryFacets).
 */
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  AVAILABILITY_UNKNOWN,
  AVAILABILITY_UNKNOWN_ES,
} from "@/lib/site-admin/sections/directory/card-data";

export type DirectoryCopy = {
  allTalent: string;
  more: string;
  filters: string;
  clearAll: string;
  availability: string;
  openNext30: string;
  country: string;
  city: string;
  citiesIn: (country: string) => string;
  verification: string;
  showLess: string;
  showAll: (n: number) => string;
  trustVerified: string;
  trustSilver: string;
  trustGold: string;
  /** "profile" / "profiles" after a separately formatted count. */
  profileWord: (n: number) => string;
  sort: string;
  recommended: string;
  mostAvailable: string;
  viewMode: string;
  grid: string;
  list: string;
  map: string;
  resultsHeading: string;
  updating: string;
  pagesLabel: string;
  previous: string;
  next: string;
  loading: string;
  showMore: (left: number) => string;
  loadMoreError: string;
  closeFilters: string;
  showProfiles: (n: string, count: number) => string;
  emptyTitle: string;
  emptyFiltered: string;
  emptyUnfiltered: string;
  clearFilters: string;
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  quickView: string;
  close: string;
  viewProfile: string;
  openDays: (n: number) => string;
  availabilityOnRequest: string;
  availabilityUnknown: string;
  independent: string;
  exclusive: (agency: string) => string;
  standingTitle: (bookings: number) => string;
  mapUnavailableTitle: string;
  mapUnavailableBody: string;
  mapEmptyTitle: string;
  mapEmptyBody: string;
  /** Appended to mapEmptyBody when some matches have free-text locations only. */
  mapFreeTextOnly: (n: number) => string;
  /** Trails a separately rendered bold count: "{n} profiles in view". */
  mapInView: (n: number) => string;
  mapMapped: (n: number) => string;
  mapWithoutLocation: (n: number) => string;
  mapHint: string;
  mapAreaEmptyTitle: string;
  mapAreaEmptyBody: string;
  backToGrid: string;
};

const EN: DirectoryCopy = {
  allTalent: "All talent",
  more: "More",
  filters: "Filters",
  clearAll: "Clear all",
  availability: "Availability",
  openNext30: "Open in the next 30 days",
  country: "Country",
  city: "City",
  citiesIn: (country) => `Cities in ${country}`,
  verification: "Verification",
  showLess: "Show less",
  showAll: (n) => `Show all ${n}`,
  trustVerified: "Verified",
  trustSilver: "Silver",
  trustGold: "Gold",
  profileWord: (n) => (n === 1 ? "profile" : "profiles"),
  sort: "Sort",
  recommended: "Recommended",
  mostAvailable: "Most available",
  viewMode: "View mode",
  grid: "Grid",
  list: "List",
  map: "Map",
  resultsHeading: "Directory results",
  updating: "Updating results…",
  pagesLabel: "Directory pages",
  previous: "Previous",
  next: "Next",
  loading: "Loading…",
  showMore: (left) => `Show more (${left} left)`,
  loadMoreError: "Couldn't load more. Tap to try again.",
  closeFilters: "Close filters",
  showProfiles: (n, count) => `Show ${n} ${count === 1 ? "profile" : "profiles"}`,
  emptyTitle: "No profiles match yet",
  emptyFiltered: "Try widening your filters. Fewer constraints surface more of the network.",
  emptyUnfiltered:
    "The directory is still filling in. Talent control their own visibility, so new profiles appear here as they opt in.",
  clearFilters: "Clear filters",
  searchPlaceholder: "Search talent by name",
  searchLabel: "Search talent",
  clearSearch: "Clear search",
  quickView: "Quick view",
  close: "Close",
  viewProfile: "View profile",
  openDays: (n) => `Open ${n} of next 30 days`,
  availabilityOnRequest: "Availability on request",
  availabilityUnknown: AVAILABILITY_UNKNOWN,
  independent: "Independent",
  exclusive: (agency) => `${agency} · exclusive`,
  standingTitle: (bookings) => `Verified standing from ${bookings} completed bookings`,
  mapUnavailableTitle: "Map view is unavailable",
  mapUnavailableBody: "The map needs a Google Maps key that isn't configured here.",
  mapEmptyTitle: "No mappable talent in this view",
  mapEmptyBody: "Profiles need a structured home city to appear on the map.",
  mapFreeTextOnly: (n) =>
    `${n} ${n === 1 ? "profile has" : "profiles have"} only free-text locations.`,
  mapInView: (n) => `${n === 1 ? "profile" : "profiles"} in view`,
  mapMapped: (n) => `${n} mapped`,
  mapWithoutLocation: (n) => `${n} without a map location`,
  mapHint: "Zoom or drag the map to filter",
  mapAreaEmptyTitle: "No talent in this area",
  mapAreaEmptyBody: "Zoom out or drag the map to bring profiles back into view.",
  backToGrid: "Back to grid →",
};

const ES: DirectoryCopy = {
  allTalent: "Todo el talento",
  more: "Más",
  filters: "Filtros",
  clearAll: "Borrar todo",
  availability: "Disponibilidad",
  openNext30: "Disponible en los próximos 30 días",
  country: "País",
  city: "Ciudad",
  citiesIn: (country) => `Ciudades en ${country}`,
  verification: "Verificación",
  showLess: "Ver menos",
  showAll: (n) => `Ver los ${n}`,
  trustVerified: "Verificado",
  trustSilver: "Plata",
  trustGold: "Oro",
  profileWord: (n) => (n === 1 ? "perfil" : "perfiles"),
  sort: "Ordenar",
  recommended: "Recomendados",
  mostAvailable: "Más disponibles",
  viewMode: "Vista",
  grid: "Cuadrícula",
  list: "Lista",
  map: "Mapa",
  resultsHeading: "Resultados del directorio",
  updating: "Actualizando resultados…",
  pagesLabel: "Páginas del directorio",
  previous: "Anterior",
  next: "Siguiente",
  loading: "Cargando…",
  showMore: (left) => `Ver más (quedan ${left})`,
  loadMoreError: "No se pudo cargar más. Toca para intentarlo de nuevo.",
  closeFilters: "Cerrar filtros",
  showProfiles: (n, count) => `Ver ${n} ${count === 1 ? "perfil" : "perfiles"}`,
  emptyTitle: "Todavía no hay perfiles que coincidan",
  emptyFiltered: "Prueba con menos filtros. Con menos restricciones verás más de la red.",
  emptyUnfiltered:
    "El directorio todavía se está llenando. Cada talento decide si se muestra, así que los perfiles nuevos aparecen aquí cuando lo activan.",
  clearFilters: "Borrar filtros",
  searchPlaceholder: "Busca talento por nombre",
  searchLabel: "Buscar talento",
  clearSearch: "Borrar búsqueda",
  quickView: "Vista rápida",
  close: "Cerrar",
  viewProfile: "Ver perfil",
  openDays: (n) => `Disponible ${n} de los próximos 30 días`,
  availabilityOnRequest: "Disponibilidad a solicitud",
  availabilityUnknown: AVAILABILITY_UNKNOWN_ES,
  independent: "Independiente",
  exclusive: (agency) => `${agency} · en exclusiva`,
  standingTitle: (bookings) => `Reputación verificada con ${bookings} reservas completadas`,
  mapUnavailableTitle: "El mapa no está disponible",
  mapUnavailableBody: "El mapa necesita una clave de Google Maps que aquí no está configurada.",
  mapEmptyTitle: "No hay talento para mostrar en el mapa",
  mapEmptyBody: "Los perfiles necesitan una ciudad de residencia registrada para aparecer en el mapa.",
  mapFreeTextOnly: (n) =>
    n === 1
      ? "1 perfil solo tiene la ubicación escrita a mano."
      : `${n} perfiles solo tienen la ubicación escrita a mano.`,
  mapInView: (n) => (n === 1 ? "perfil a la vista" : "perfiles a la vista"),
  mapMapped: (n) => `${n} en el mapa`,
  mapWithoutLocation: (n) => `${n} sin ubicación en el mapa`,
  mapHint: "Acerca o arrastra el mapa para filtrar",
  mapAreaEmptyTitle: "No hay talento en esta zona",
  mapAreaEmptyBody: "Aleja o arrastra el mapa para volver a ver perfiles.",
  backToGrid: "Volver a la cuadrícula →",
};

export function directoryCopy(locale: string | null | undefined): DirectoryCopy {
  return pickLocale(locale, { en: EN, es: ES });
}
