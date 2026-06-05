/**
 * Bilingual copy for the /get-started signup form. Extracted from
 * `get-started-form.tsx` to keep that file under the 800-line lint cap.
 * Natural Mexican-Spanish ("tú").
 */

type AudienceKey = "operator" | "agency" | "organization";

/** Self-identification radio options. Keys are stable (wired to the server
 *  action + analytics); only labels/descriptions are localized. */
export function getAudienceOptions(
  locale: string,
): { key: AudienceKey; label: string; description: string }[] {
  if (locale === "es") {
    return [
      { key: "operator", label: "Solo yo", description: "Vendo mis propios servicios." },
      { key: "agency", label: "Una agencia o estudio", description: "Representamos a otras personas." },
      { key: "organization", label: "Una banda, equipo o red", description: "Somos un grupo que trabaja junto." },
    ];
  }
  return [
    { key: "operator", label: "Just me", description: "I sell my own services." },
    { key: "agency", label: "An agency or studio", description: "We represent other people." },
    { key: "organization", label: "A band, team, or network", description: "We're a group working together." },
  ];
}

export type GetStartedFormCopy = {
  eyebrow: string;
  freeNoCard: string;
  heading: string;
  headingCompact: string;
  whichDescribes: string;
  yourName: string;
  workEmail: string;
  pickLink: string;
  teamSize: string;
  createWorkspace: string;
  reserving: string;
};

export function getFormCopy(locale: string): GetStartedFormCopy {
  if (locale === "es") {
    return {
      eyebrow: "Empieza tu negocio",
      freeNoCard: "Gratis · sin tarjeta",
      heading: "Empieza en menos de diez minutos.",
      headingCompact: "Crea tu sitio gratis",
      whichDescribes: "¿Qué te describe mejor?",
      yourName: "Tu nombre",
      workEmail: "Correo de trabajo",
      pickLink: "Elige el nombre de tu link",
      teamSize: "¿De qué tamaño es tu equipo?",
      createWorkspace: "Crea tu workspace gratis",
      reserving: "Reservando tu link…",
    };
  }
  return {
    eyebrow: "Start your business",
    freeNoCard: "Free · no card",
    heading: "Start in under ten minutes.",
    headingCompact: "Create your free site",
    whichDescribes: "Which describes you best?",
    yourName: "Your name",
    workEmail: "Work email",
    pickLink: "Pick your link name",
    teamSize: "How big is your team?",
    createWorkspace: "Create my free workspace",
    reserving: "Reserving your link…",
  };
}
