// Talent Trust signals page copy, en + es (TUL-1815): the page was English-only.
// Pure so a test can import it; the page picks the table from the request locale.

export type TrustKind =
  | "id-verified"
  | "age-verified"
  | "background-check"
  | "union"
  | "agency-verified"
  | "top-rated"
  | "tulala-featured";

export type TouchpointCopy = { label: string; description: string; ctaLabel: string };

export type TrustCopy = {
  title: string;
  noProfile: string;
  heading: string;
  lede: string;
  signalsEarned: (earned: number, total: number) => string;
  startWithId: string;
  earnedOn: (date: string) => string;
  active: string;
  touchpoints: Record<TrustKind, TouchpointCopy>;
};

const EN: TrustCopy = {
  title: "Trust signals",
  noProfile:
    "You don't have a talent profile yet. Create one first to start earning verification badges.",
  heading: "Your trust signals",
  lede:
    "Verification badges signal trust to clients before they inquire. You start ID verification yourself; others are earned (top-rated, agency-verified), confirmed by the Tulala team (background check, union / license) or curated (Tulala featured). Earning more badges typically increases inquiry volume.",
  signalsEarned: (e, t) => `${e} of ${t} signals earned`,
  startWithId: "Start with ID verification",
  earnedOn: (d) => `Earned ${d}`,
  active: "✓ Active",
  touchpoints: {
    "id-verified": {
      label: "ID verified",
      description: "Government-issued ID confirmed by Stripe Identity. Required for paid bookings.",
      ctaLabel: "Start ID verification",
    },
    "age-verified": {
      label: "Age verified",
      description: "Confirmed via ID verification + date of birth. Automatic side-effect of ID step.",
      ctaLabel: "Earned via ID verification",
    },
    "background-check": {
      label: "Background-checked",
      description: "Optional third-party check. Some clients filter by this badge.",
      ctaLabel: "Added by the Tulala team",
    },
    union: {
      label: "Union / license",
      description: "Union card or professional license, confirmed by the Tulala team. Renews yearly.",
      ctaLabel: "Added by the Tulala team",
    },
    "agency-verified": {
      label: "Agency-verified",
      description:
        "Your primary agency has confirmed your roster status. Auto-set when an Agency-plan workspace adds you with exclusivity confirmed.",
      ctaLabel: "Agency-driven (no action needed)",
    },
    "top-rated": {
      label: "Top-rated",
      description: "Awarded after 10+ booked-and-completed jobs with 4.7+ avg client rating.",
      ctaLabel: "Earn via booked work",
    },
    "tulala-featured": {
      label: "Tulala featured",
      description: "Editorial pick: talent showcased on the Tulala discovery surface.",
      ctaLabel: "Curated by Tulala team",
    },
  },
};

const ES: TrustCopy = {
  title: "Señales de confianza",
  noProfile:
    "Aún no tienes un perfil de talento. Crea uno primero para empezar a ganar insignias de verificación.",
  heading: "Tus señales de confianza",
  lede:
    "Las insignias de verificación generan confianza en los clientes antes de que consulten. Tú inicias la verificación de identidad; otras se ganan (mejor valorado, verificado por agencia), las confirma el equipo de Tulala (antecedentes, sindicato / licencia) o las elige Tulala (destacado por Tulala). Tener más insignias suele aumentar las consultas.",
  signalsEarned: (e, t) => `${e} de ${t} señales obtenidas`,
  startWithId: "Empieza con la verificación de identidad",
  earnedOn: (d) => `Obtenida el ${d}`,
  active: "✓ Activa",
  touchpoints: {
    "id-verified": {
      label: "Identidad verificada",
      description:
        "Identificación oficial confirmada por Stripe Identity. Obligatoria para reservas de pago.",
      ctaLabel: "Iniciar verificación de identidad",
    },
    "age-verified": {
      label: "Edad verificada",
      description:
        "Confirmada con la verificación de identidad y la fecha de nacimiento. Se obtiene automáticamente con el paso de identidad.",
      ctaLabel: "Se obtiene con la verificación de identidad",
    },
    "background-check": {
      label: "Antecedentes verificados",
      description:
        "Verificación opcional de un tercero. Algunos clientes filtran por esta insignia.",
      ctaLabel: "La agrega el equipo de Tulala",
    },
    union: {
      label: "Sindicato / licencia",
      description: "Credencial sindical o licencia profesional, confirmada por el equipo de Tulala. Se renueva cada año.",
      ctaLabel: "La agrega el equipo de Tulala",
    },
    "agency-verified": {
      label: "Verificado por agencia",
      description:
        "Tu agencia principal confirmó tu lugar en su roster. Se asigna automáticamente cuando un espacio con plan Agencia te agrega con exclusividad confirmada.",
      ctaLabel: "Lo gestiona la agencia (no requiere acción)",
    },
    "top-rated": {
      label: "Mejor valorado",
      description:
        "Se otorga tras más de 10 trabajos reservados y completados con una valoración media de clientes de 4.7 o más.",
      ctaLabel: "Se gana con trabajos reservados",
    },
    "tulala-featured": {
      label: "Destacado por Tulala",
      description:
        "Selección editorial: talento que aparece en la sección de descubrimiento de Tulala.",
      ctaLabel: "Lo elige el equipo de Tulala",
    },
  },
};

export function trustCopy(locale: string | null | undefined): TrustCopy {
  return locale?.toLowerCase().startsWith("es") ? ES : EN;
}
