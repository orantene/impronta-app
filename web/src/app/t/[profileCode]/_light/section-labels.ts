/**
 * Hub profile labels that were hardcoded English on /es/t pages (TUL-736,
 * TUL-707). Pure; the page passes its request locale.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function lightSectionLabels(locale: string) {
  const l = (en: string, es: string) => pickLocale(locale, { en, es });
  return {
    reviews: l("Reviews", "Reseñas"),
    clientReviews: l("Client reviews", "Reseñas de clientes"),
    moreTalent: l("More talent from this roster", "Más talento de este equipo"),
    verifiedSkill: l("Verified skill", "Habilidad verificada"),
    bestFor: l("Best for", "Ideal para"),
    skills: l("Skills", "Habilidades"),
    industries: l("Industries", "Industrias"),
    events: l("Events", "Eventos"),
    tags: l("Tags", "Etiquetas"),
  };
}

const PROFICIENCY: Record<string, [string, string]> = {
  beginner: ["Beginner", "Principiante"],
  intermediate: ["Intermediate", "Intermedio"],
  advanced: ["Advanced", "Avanzado"],
  expert: ["Expert", "Experto"],
  master: ["Master", "Maestro"],
};

export function proficiencyLabel(level: string, locale: string): string {
  const row = PROFICIENCY[level];
  return row ? pickLocale(locale, { en: row[0], es: row[1] }) : level;
}

export function yearsLabel(years: number, locale: string): string {
  return pickLocale(locale, {
    en: `${years} yr${years === 1 ? "" : "s"}`,
    es: `${years} ${years === 1 ? "año" : "años"}`,
  });
}
