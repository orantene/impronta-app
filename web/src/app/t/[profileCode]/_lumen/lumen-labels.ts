import { pickLocale } from "@/lib/i18n/pick-locale";

/**
 * Lumen section eyebrows / titles / chip labels.
 *
 * Extracted from LumenProfileLayout.tsx: that file sat exactly on the 800-line
 * `max-lines` cap, so any feature addition tipped it over, and the repo's
 * ratchet forbids absorbing that as a new lint suppression (CI fails on
 * suppression growth — "fix the underlying error"). This is the same
 * extract-a-sibling paydown the codebase has applied elsewhere. Pure data, no
 * JSX, so it stays trivially reviewable.
 */
export function buildLumenLabels({
  locale,
  detailsLabels,
  ui,
}: {
  locale: string;
  detailsLabels: { details: string };
  /** Structurally typed to the ONE field used, so callers can pass either the
   *  full DirectoryUiCopy or the narrowed Pick<> the layout receives. */
  ui: { card: { featuredLabel: string } };
}) {
  return {
    aboutEyebrow: pickLocale(locale, { en: "Profile", es: "Perfil" }),
    aboutTitle: pickLocale(locale, { en: "About", es: "Sobre" }),
    portfolioEyebrow: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    portfolioTitle: pickLocale(locale, { en: "Selected work", es: "Trabajo selecto" }),
    viewPortfolio: pickLocale(locale, { en: "View portfolio", es: "Ver portafolio" }),
    detailsEyebrow: pickLocale(locale, { en: "Details", es: "Detalles" }),
    detailsTitle: detailsLabels.details,
    skillsEyebrow: pickLocale(locale, { en: "Craft", es: "Oficio" }),
    skillsTitle: pickLocale(locale, { en: "Skills & specialties", es: "Habilidades y especialidades" }),
    servicesEyebrow: pickLocale(locale, { en: "Bookings", es: "Reservas" }),
    servicesTitle: pickLocale(locale, { en: "Services & rates", es: "Servicios y tarifas" }),
    mediaEyebrow: pickLocale(locale, { en: "Featured", es: "Destacado" }),
    mediaTitle: pickLocale(locale, { en: "Watch & listen", es: "Mira y escucha" }),
    reviewsEyebrow: pickLocale(locale, { en: "Word of mouth", es: "Reseñas" }),
    reviewsTitle: pickLocale(locale, { en: "What clients say", es: "Lo que dicen los clientes" }),
    rosterEyebrow: pickLocale(locale, { en: "The roster", es: "El roster" }),
    rosterTitle: pickLocale(locale, { en: "More from this roster", es: "Más de este roster" }),
    represented: pickLocale(locale, { en: "Represented", es: "Representada" }),
    travels: pickLocale(locale, { en: "Travels worldwide", es: "Viaja a todo el mundo" }),
    featured: ui.card.featuredLabel,
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
    availability: pickLocale(locale, { en: "Availability", es: "Disponibilidad" }),
    booking: pickLocale(locale, { en: "Book this talent", es: "Reservar talento" }),
    quickFacts: pickLocale(locale, { en: "Quick facts", es: "Datos rápidos" }),
    representedBy: pickLocale(locale, { en: "Represented by", es: "Representada por" }),
  };
}
