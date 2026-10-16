/**
 * UI copy for the public global directory, English and Spanish. Plain module
 * (no React) so `shared.ts`, which the server page and action also import,
 * can format with it; client components read it through
 * `DirectoryCopyProvider` / `useDirectoryCopy`.
 */
import { AVAILABILITY_UNKNOWN } from "@/lib/site-admin/sections/directory/card-data";

export type DirectoryCopy = {
  locale: "en" | "es";
  numberLocale: string;
  profileNoun: (n: number) => string;
  profiles: (n: number) => string;
  filters: string;
  sort: string;
  sortRecommended: string;
  sortAvailability: string;
  viewMode: string;
  viewGrid: string;
  viewList: string;
  viewMap: string;
  clearAll: string;
  availability: string;
  openNext30: string;
  country: string;
  city: string;
  citiesIn: (country: string) => string;
  verification: string;
  trustVerified: string;
  trustSilver: string;
  trustGold: string;
  showLess: string;
  showAll: (n: number) => string;
  allTalent: string;
  more: string;
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  resultsHeading: string;
  updatingResults: string;
  pagesLabel: string;
  previous: string;
  next: string;
  loading: string;
  showMore: (left: number) => string;
  loadMoreError: string;
  closeFilters: string;
  showProfiles: (n: number) => string;
  emptyTitle: string;
  emptyFiltered: string;
  emptyUnfiltered: string;
  clearFilters: string;
  quickView: string;
  close: string;
  viewProfile: string;
  standingTitle: (bookings: number) => string;
  independent: string;
  exclusiveSuffix: string;
  openDays: (days: number) => string;
  availabilityOnRequest: string;
  availabilityUnknown: string;
  mapUnavailableTitle: string;
  mapUnavailableBody: string;
  mapEmptyTitle: string;
  mapEmptyBody: (unmapped: number) => string;
  /** Follows the bold count: "profiles in view". */
  mapInViewSuffix: (n: number) => string;
  mapMapped: (n: number) => string;
  mapWithoutLocation: (n: number) => string;
  mapZoomHint: string;
  backToGrid: string;
};

const fmt = (locale: string, n: number) => n.toLocaleString(locale);

export const DIRECTORY_COPY_EN: DirectoryCopy = {
  locale: "en",
  numberLocale: "en-US",
  profileNoun: (n) => (n === 1 ? "profile" : "profiles"),
  profiles: (n) => `${fmt("en-US", n)} ${n === 1 ? "profile" : "profiles"}`,
  filters: "Filters",
  sort: "Sort",
  sortRecommended: "Recommended",
  sortAvailability: "Most available",
  viewMode: "View mode",
  viewGrid: "Grid",
  viewList: "List",
  viewMap: "Map",
  clearAll: "Clear all",
  availability: "Availability",
  openNext30: "Open in the next 30 days",
  country: "Country",
  city: "City",
  citiesIn: (country) => `Cities in ${country}`,
  verification: "Verification",
  trustVerified: "Verified",
  trustSilver: "Silver",
  trustGold: "Gold",
  showLess: "Show less",
  showAll: (n) => `Show all ${n}`,
  allTalent: "All talent",
  more: "More",
  searchPlaceholder: "Search talent by name",
  searchLabel: "Search talent",
  clearSearch: "Clear search",
  resultsHeading: "Directory results",
  updatingResults: "Updating results…",
  pagesLabel: "Directory pages",
  previous: "Previous",
  next: "Next",
  loading: "Loading…",
  showMore: (left) => `Show more (${left} left)`,
  loadMoreError: "Couldn't load more. Tap to try again.",
  closeFilters: "Close filters",
  showProfiles: (n) => `Show ${fmt("en-US", n)} ${n === 1 ? "profile" : "profiles"}`,
  emptyTitle: "No profiles match yet",
  emptyFiltered: "Try widening your filters. Fewer constraints surface more of the network.",
  emptyUnfiltered:
    "The directory is still filling in. Talent control their own visibility, so new profiles appear here as they opt in.",
  clearFilters: "Clear filters",
  quickView: "Quick view",
  close: "Close",
  viewProfile: "View profile",
  standingTitle: (bookings) => `Verified standing from ${bookings} completed bookings`,
  independent: "Independent",
  exclusiveSuffix: "exclusive",
  openDays: (days) => `Open ${days} of next 30 days`,
  availabilityOnRequest: "Availability on request",
  availabilityUnknown: AVAILABILITY_UNKNOWN,
  mapUnavailableTitle: "Map view is unavailable",
  mapUnavailableBody: "The map needs a Google Maps key that isn't configured here.",
  mapEmptyTitle: "No mappable talent in this view",
  mapEmptyBody: (unmapped) =>
    `Profiles need a structured home city to appear on the map.${
      unmapped > 0
        ? ` ${unmapped} ${unmapped === 1 ? "profile has" : "profiles have"} only free-text locations.`
        : ""
    }`,
  mapInViewSuffix: (n) => `${n === 1 ? "profile" : "profiles"} in view`,
  mapMapped: (n) => `${n} mapped`,
  mapWithoutLocation: (n) => `${n} without a map location`,
  mapZoomHint: "Zoom or drag the map to filter",
  backToGrid: "Back to grid →",
};

export const DIRECTORY_COPY_ES: DirectoryCopy = {
  locale: "es",
  numberLocale: "es-MX",
  profileNoun: (n) => (n === 1 ? "perfil" : "perfiles"),
  profiles: (n) => `${fmt("es-MX", n)} ${n === 1 ? "perfil" : "perfiles"}`,
  filters: "Filtros",
  sort: "Ordenar",
  sortRecommended: "Recomendados",
  sortAvailability: "Más disponibles",
  viewMode: "Vista",
  viewGrid: "Cuadrícula",
  viewList: "Lista",
  viewMap: "Mapa",
  clearAll: "Borrar todo",
  availability: "Disponibilidad",
  openNext30: "Disponible en los próximos 30 días",
  country: "País",
  city: "Ciudad",
  citiesIn: (country) => `Ciudades en ${country}`,
  verification: "Verificación",
  trustVerified: "Verificado",
  trustSilver: "Plata",
  trustGold: "Oro",
  showLess: "Mostrar menos",
  showAll: (n) => `Mostrar los ${n}`,
  allTalent: "Todo el talento",
  more: "Más",
  searchPlaceholder: "Busca talento por nombre",
  searchLabel: "Buscar talento",
  clearSearch: "Borrar búsqueda",
  resultsHeading: "Resultados del directorio",
  updatingResults: "Actualizando resultados…",
  pagesLabel: "Páginas del directorio",
  previous: "Anterior",
  next: "Siguiente",
  loading: "Cargando…",
  showMore: (left) => `Mostrar más (quedan ${left})`,
  loadMoreError: "No se pudieron cargar más. Toca para intentarlo de nuevo.",
  closeFilters: "Cerrar filtros",
  showProfiles: (n) => `Ver ${fmt("es-MX", n)} ${n === 1 ? "perfil" : "perfiles"}`,
  emptyTitle: "Aún no hay perfiles que coincidan",
  emptyFiltered: "Prueba con menos filtros. Con menos restricciones aparece más talento de la red.",
  emptyUnfiltered:
    "El directorio aún se está llenando. Cada talento decide su visibilidad, así que los perfiles nuevos aparecen aquí cuando eligen mostrarse.",
  clearFilters: "Borrar filtros",
  quickView: "Vista rápida",
  close: "Cerrar",
  viewProfile: "Ver perfil",
  standingTitle: (bookings) => `Reputación verificada de ${bookings} reservas completadas`,
  independent: "Independiente",
  exclusiveSuffix: "exclusivo",
  openDays: (days) => `Disp. ${days} de 30 días`,
  availabilityOnRequest: "Disponibilidad a consultar",
  availabilityUnknown: "Disponibilidad sin confirmar, consulta antes",
  mapUnavailableTitle: "El mapa no está disponible",
  mapUnavailableBody: "El mapa necesita una clave de Google Maps que no está configurada aquí.",
  mapEmptyTitle: "No hay talento con ubicación en el mapa en esta vista",
  mapEmptyBody: (unmapped) =>
    `Los perfiles necesitan una ciudad registrada para aparecer en el mapa.${
      unmapped > 0
        ? ` ${unmapped} ${unmapped === 1 ? "perfil solo tiene" : "perfiles solo tienen"} una ubicación escrita a mano.`
        : ""
    }`,
  mapInViewSuffix: (n) => `${n === 1 ? "perfil" : "perfiles"} en la vista`,
  mapMapped: (n) => `${n} en el mapa`,
  mapWithoutLocation: (n) => `${n} sin ubicación en el mapa`,
  mapZoomHint: "Acerca o arrastra el mapa para filtrar",
  backToGrid: "Volver a la cuadrícula →",
};

export function directoryCopy(locale: string | null | undefined): DirectoryCopy {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? DIRECTORY_COPY_ES : DIRECTORY_COPY_EN;
}
