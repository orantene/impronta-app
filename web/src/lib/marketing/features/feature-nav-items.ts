import type { FeatureGroup, FeatureKey } from "./types";

/**
 * A lean projection of the catalogue for the header, the footer, and anywhere
 * else a CLIENT bundle needs the list of features.
 *
 * The header is a client component. Importing the catalogue itself there would
 * ship all twenty one features' long form prose, in both languages, to every
 * marketing page: the nav needs a name and a path, and would have paid for
 * several hundred kilobytes of body copy to get them.
 *
 * The cost of a second list is drift, so this file is GENERATED from the
 * catalogue and locked to it by `feature-nav-items.static.test.ts`, which
 * fails if a name, a slug, a status, a group or the key set ever diverges.
 * Do not hand edit: change the catalogue, then regenerate.
 */
export type FeatureNavItem = {
  key: FeatureKey;
  group: FeatureGroup;
  status: "live" | "coming";
  en: { name: string; path: string };
  es: { name: string; path: string };
};

export const FEATURE_NAV_ITEMS: readonly FeatureNavItem[] = [
  {
    key: "website-builder",
    group: "presence",
    status: "live",
    en: { name: "Website Builder", path: "/features/website-builder" },
    es: { name: "Creador de sitios web", path: "/funciones/crear-pagina-web" },
  },
  {
    key: "talent-profiles",
    group: "presence",
    status: "live",
    en: { name: "Talent Profiles & Portfolios", path: "/features/talent-profiles" },
    es: { name: "Perfiles y portafolios", path: "/funciones/portafolio-de-talento" },
  },
  {
    key: "services-storefront",
    group: "presence",
    status: "live",
    en: { name: "Services Storefront", path: "/features/services-storefront" },
    es: { name: "Vitrina de servicios", path: "/funciones/vitrina-de-servicios" },
  },
  {
    key: "media-library",
    group: "presence",
    status: "live",
    en: { name: "Media Library", path: "/features/media-library" },
    es: { name: "Biblioteca de medios", path: "/funciones/biblioteca-de-medios" },
  },
  {
    key: "directory",
    group: "found",
    status: "live",
    en: { name: "Directory & Discover", path: "/features/directory" },
    es: { name: "Directorio y Discover", path: "/funciones/directorio" },
  },
  {
    key: "qr-engine",
    group: "found",
    status: "coming",
    en: { name: "QR Engine", path: "/features/qr-engine" },
    es: { name: "Motor de QR", path: "/funciones/codigo-qr" },
  },
  {
    key: "reviews-and-trust",
    group: "found",
    status: "live",
    en: { name: "Reviews & Trust", path: "/features/reviews-and-trust" },
    es: { name: "Reseñas y confianza", path: "/funciones/resenas-y-confianza" },
  },
  {
    key: "inquiry-engine",
    group: "booked",
    status: "live",
    en: { name: "Inquiry Engine", path: "/features/inquiry-engine" },
    es: { name: "Motor de solicitudes", path: "/funciones/motor-de-solicitudes" },
  },
  {
    key: "messenger",
    group: "booked",
    status: "live",
    en: { name: "Unified Messenger", path: "/features/messenger" },
    es: { name: "Mensajería", path: "/funciones/mensajeria" },
  },
  {
    key: "appointments",
    group: "booked",
    status: "live",
    en: { name: "Appointments & Reservations", path: "/features/appointments" },
    es: { name: "Citas y reservas", path: "/funciones/citas-y-reservas" },
  },
  {
    key: "tables-and-seating",
    group: "booked",
    status: "coming",
    en: { name: "Tables & Seating", path: "/features/tables-and-seating" },
    es: { name: "Mesas y reservaciones", path: "/funciones/mesas-y-reservaciones" },
  },
  {
    key: "bookings-and-offers",
    group: "booked",
    status: "live",
    en: { name: "Bookings & Offers", path: "/features/bookings-and-offers" },
    es: { name: "Cotizaciones y ofertas", path: "/funciones/cotizaciones-y-ofertas" },
  },
  {
    key: "payments",
    group: "paid",
    status: "live",
    en: { name: "Payments Built In", path: "/features/payments" },
    es: { name: "Pagos integrados", path: "/funciones/pagos-integrados" },
  },
  {
    key: "ticketing",
    group: "paid",
    status: "coming",
    en: { name: "Ticketing", path: "/features/ticketing" },
    es: { name: "Boletos", path: "/funciones/boletos" },
  },
  {
    key: "discounts-and-campaigns",
    group: "paid",
    status: "live",
    en: { name: "Discounts & Campaigns", path: "/features/discounts-and-campaigns" },
    es: { name: "Descuentos y campañas", path: "/funciones/descuentos-y-campanas" },
  },
  {
    key: "commission-engine",
    group: "paid",
    status: "live",
    en: { name: "Commission Engine", path: "/features/commission-engine" },
    es: { name: "Motor de comisiones", path: "/funciones/motor-de-comisiones" },
  },
  {
    key: "roster-and-team",
    group: "run",
    status: "live",
    en: { name: "Roster & Team Management", path: "/features/roster-and-team" },
    es: { name: "Roster y equipo", path: "/funciones/roster-y-equipo" },
  },
  {
    key: "client-management",
    group: "run",
    status: "live",
    en: { name: "Client Management", path: "/features/client-management" },
    es: { name: "Gestión de clientes", path: "/funciones/gestion-de-clientes" },
  },
  {
    key: "analytics",
    group: "run",
    status: "live",
    en: { name: "Analytics", path: "/features/analytics" },
    es: { name: "Analíticas", path: "/funciones/analiticas" },
  },
  {
    key: "automations",
    group: "run",
    status: "live",
    en: { name: "Automations", path: "/features/automations" },
    es: { name: "Automatizaciones", path: "/funciones/automatizaciones" },
  },
  {
    key: "premium-support",
    group: "run",
    status: "live",
    en: { name: "Premium Support Service", path: "/features/premium-support" },
    es: { name: "Soporte premium", path: "/funciones/soporte-premium" },
  },
];

/** The nav items of one lifecycle stage, in catalogue (plate) order. */
export function navItemsForGroup(group: FeatureGroup): FeatureNavItem[] {
  return FEATURE_NAV_ITEMS.filter((i) => i.group === group);
}
