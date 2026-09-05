/**
 * What a tenant site must have before it is offered to search.
 *
 * THE PROBLEM THIS EXISTS FOR. Eleven real businesses are onboarding: a pizza
 * maker, a restaurant, a laundry, a jeweller, an immigration office, a hair
 * salon, a nail artist, a massage therapist, a singer, a speakers team and a
 * second agency. Each gets a public page on our domain that Google will index.
 * Our own directory audit found ONE of seventy-eight listed profiles met the
 * publish floor. If the first real cohort ships thin pages, our launch
 * footprint is eleven weak pages carrying our domain authority, and that is
 * slow and expensive to undo.
 *
 * The CEO's ruling: every NEW tenant site starts noindex and stays noindex
 * until the checklist passes. Existing Impronta profiles are explicitly NOT
 * gated by this, which is Directory's call and already ratified: enforcing the
 * floor there would unlist fifty of fifty-one.
 *
 * SCOPE, deliberately narrow. This file is COPY AND CRITERIA ONLY. It holds no
 * gating logic, reads no database, and does not touch the noindex flag or
 * Directory's existing publish floor. Those belong to Directory and Onboarding,
 * whose `profile-publish-requirements.ts` is the right shape for a different
 * subject: it gates a talent PROFILE through resolved fields, and a tenant SITE
 * is not that. Sharing the vocabulary means a user who sees both surfaces reads
 * the same language; sharing the implementation would mean one of us owning the
 * other's object.
 *
 * EVERY CRITERION IS FALSIFIABLE. "Looks professional" is not a criterion,
 * because two people will disagree and the gate becomes a conversation. Each
 * item below can be answered yes or no by looking.
 */

export type LaunchReadinessKey =
  | "business-name"
  | "priced-offering"
  | "reachable-contact"
  | "real-photograph"
  | "no-placeholder-text"
  | "location";

export type LaunchReadinessCriterion = {
  key: LaunchReadinessKey;
  /**
   * Why this one is on the list. Not user-facing; it is here so nobody
   * removes an item without knowing what it was protecting against.
   */
  rationale: string;
  en: { label: string; stillNeeds: string };
  es: { label: string; stillNeeds: string };
};

export const LAUNCH_READINESS_CRITERIA: readonly LaunchReadinessCriterion[] = [
  {
    key: "business-name",
    rationale:
      "The seeded workspace name ships as a placeholder. A page titled 'My Workspace' indexed on our domain is worse than no page: it ranks for nothing and signals an abandoned site.",
    en: {
      label: "A real business name",
      stillNeeds:
        "Your page still shows the name we set up for you. Put your real business name in, the one your customers would search for.",
    },
    es: {
      label: "El nombre real del negocio",
      stillNeeds:
        "Tu página todavía muestra el nombre que te pusimos al crearla. Escribe el nombre real de tu negocio, el que tus clientes buscarían.",
    },
  },
  {
    key: "priced-offering",
    rationale:
      "A site with no priced offering cannot take money, so indexing it sends strangers to a page that cannot convert them. It also tells us onboarding stopped halfway.",
    en: {
      label: "At least one service with a price",
      stillNeeds:
        "Add one thing people can book, with what it costs. A visitor who has to ask the price usually does not ask.",
    },
    es: {
      label: "Al menos un servicio con precio",
      stillNeeds:
        "Agrega una cosa que la gente pueda reservar, con su precio. Quien tiene que preguntar cuánto cuesta, casi siempre no pregunta.",
    },
  },
  {
    key: "reachable-contact",
    rationale:
      "PRESENT IS NOT ENOUGH, and this one is hardened from our own failure. tulala.digital had no MX record while /support told every visitor to email us, so a criterion of 'has a contact method' would have passed a page that could not be contacted. Whatever is listed here has to have been shown to RECEIVE.",
    en: {
      label: "A contact path that has been shown to work",
      stillNeeds:
        "Your page needs a way to reach you that we have seen deliver, not just a field with something typed in it. Send yourself a test through it before you launch.",
    },
    es: {
      label: "Una forma de contacto comprobada",
      stillNeeds:
        "Tu página necesita una forma de contactarte que hayamos visto funcionar, no nada más un campo con algo escrito. Mándate una prueba antes de lanzar.",
    },
  },
  {
    key: "real-photograph",
    rationale:
      "Template stock reads as a template. It also means the page looks like every other page in the cohort, which is the specific way eleven sites at once damages a domain.",
    en: {
      label: "At least one photograph of the real thing",
      stillNeeds:
        "Swap at least one picture for a real one: your room, your work, your food. A stock photo tells a visitor the page was never finished.",
    },
    es: {
      label: "Al menos una foto real",
      stillNeeds:
        "Cambia al menos una imagen por una real: tu local, tu trabajo, tu comida. Una foto de banco le dice al visitante que la página nunca se terminó.",
    },
  },
  {
    key: "no-placeholder-text",
    rationale:
      "Seeded starter copy is detectable, and our first-run audit found seeded alt text blocking publish, so the seed is identifiable rather than a judgement call.",
    en: {
      label: "No starter text left on the page",
      stillNeeds:
        "Some of the words we wrote to get you started are still there. Replace them with yours, even briefly. Your own sentence beats our placeholder.",
    },
    es: {
      label: "Sin texto de ejemplo en la página",
      stillNeeds:
        "Todavía quedan palabras que escribimos nosotros para arrancar. Cámbialas por las tuyas, aunque sean cortas. Tu frase vale más que nuestro ejemplo.",
    },
  },
  {
    key: "location",
    rationale:
      "Only where the business serves one. A laundry with no city is unfindable and the page is worthless to them and to us. A singer who travels is a legitimate exception, which is why this is conditional rather than absolute.",
    en: {
      label: "A location, if you serve one",
      stillNeeds:
        "If customers come to you or you work a particular area, say where. People search for what you do plus where they are.",
    },
    es: {
      label: "Una ubicación, si atiendes en una",
      stillNeeds:
        "Si tus clientes van contigo o trabajas una zona específica, dilo. La gente busca lo que haces más el lugar donde está.",
    },
  },
];

/** Copy for one criterion in the reader's language. */
export function criterionCopy(
  criterion: LaunchReadinessCriterion,
  locale: string,
): { label: string; stillNeeds: string } {
  return locale === "es" ? criterion.es : criterion.en;
}
