/** Hub profile strings that used to be hardcoded English (TUL-683). Pure. */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function lightProfileLabels(locale: string) {
  return {
    services: pickLocale(locale, { en: "Services", es: "Servicios" }),
    skills: pickLocale(locale, { en: "Skills & Specialties", es: "Habilidades y especialidades" }),
    portfolioBadge: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
  };
}
