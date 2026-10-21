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
  backToProfile: string;
  heading: string;
  lede: string;
  signalsEarned: (earned: number, total: number) => string;
  startWithId: string;
  earnedOn: (date: string) => string;
  active: string;
  rolloutBold: string;
  rolloutBefore: string;
  settingsAccount: string;
  rolloutAfter: string;
  touchpoints: Record<TrustKind, TouchpointCopy>;
};

const EN: TrustCopy = {
  title: "Trust signals",
  noProfile:
    "You don't have a talent profile yet. Create one first to start earning verification badges.",
  backToProfile: "← Back to profile",
  heading: "Your trust signals",
  lede:
    "Verification badges signal trust to clients before they inquire. Some are self-serve (ID, license); others are earned (top-rated, agency-verified) or curated (Tulala featured). Earning more badges typically increases inquiry volume.",
  signalsEarned: (e, t) => `${e} of ${t} signals earned`,
  startWithId: "· start with ID verification below",
  earnedOn: (d) => `Earned ${d}`,
  active: "✓ Active",
  rolloutBold: "Self-serve verification is rolling out next sprint.",
  rolloutBefore: "For now, ID verification is started from",
  settingsAccount: "Settings → Account",
  rolloutAfter: "and other touchpoints are earned automatically or via agency action.",
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
      ctaLabel: "Request background check",
    },
    union: {
      label: "Union / license",
      description: "Upload union card or professional license. Renews yearly.",
      ctaLabel: "Upload credentials",
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
  backToProfile: "← Volver al perfil",
  heading: "Tus señales de confianza",
  lede:
    "Las insignias de verificación generan confianza en los clientes antes de que consulten. Algunas las gestionas tú (identificación, licencia); otras se ganan (mejor valorado, verificado por agencia) o las elige Tulala (destacado por Tulala). Tener más insignias suele aumentar las consultas.",
  signalsEarned: (e, t) => `${e} de ${t} señales obtenidas`,
  startWithId: "· empieza con la verificación de identidad aquí abajo",
  earnedOn: (d) => `Obtenida el ${d}`,
  active: "✓ Activa",
  rolloutBold: "La verificación autogestionada llegará en el próximo sprint.",
  rolloutBefore: "Por ahora, la verificación de identidad se inicia desde",
  settingsAccount: "Ajustes → Cuenta",
  rolloutAfter: "y las demás señales se obtienen automáticamente o por acción de la agencia.",
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
      ctaLabel: "Solicitar verificación de antecedentes",
    },
    union: {
      label: "Sindicato / licencia",
      description: "Sube tu credencial sindical o licencia profesional. Se renueva cada año.",
      ctaLabel: "Subir credenciales",
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
