/** Hub profile strings that used to be hardcoded English (TUL-683). Pure. */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function lightProfileLabels(locale: string) {
  return {
    services: pickLocale(locale, { en: "Services", es: "Servicios" }),
    skills: pickLocale(locale, { en: "Skills & Specialties", es: "Habilidades y especialidades" }),
    portfolioBadge: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    availableOf: pickLocale(locale, { en: "Available", es: "Disponible" }),
    ofNext30: pickLocale(locale, { en: "of next 30 days", es: "de los próximos 30 días" }),
    days14: pickLocale(locale, { en: "14 days", es: "14 días" }),
    strip14Aria: pickLocale(locale, { en: "14-day availability strip", es: "Disponibilidad de los próximos 14 días" }),
    nextAvailable: pickLocale(locale, { en: "Next available:", es: "Próxima disponibilidad:" }),
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
  };
}
