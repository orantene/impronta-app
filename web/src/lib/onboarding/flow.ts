/**
 * Onboarding 1B: the 4-step frame, pure.
 *
 * The module has more internal screens than a person should count. This maps
 * every internal step onto one of four honest steps ("Step X of 4"), picks the
 * default language (Spanish for es-* browsers and Mexico), and holds the copy
 * of screen 1 in both languages.
 */

import type { ModuleStep, OnboardingChoice } from "./module-state";

export const FLOW_TOTAL = 4;
export type FlowStepNumber = 1 | 2 | 3 | 4;

/**
 * 1 How do you work? · 2 Tell us what you do · 3 Set up the essentials ·
 * 4 Style, ready, account, build and arrival.
 *
 * onb1-09: style + readyToBuild used to sit in step 3 with essentials/setup, so
 * the "Paso 3 de 4" label stuck across four distinct screens. They advance to 4.
 */
export const FLOW_STEP_OF: Record<ModuleStep, FlowStepNumber> = {
  choose: 1,
  entry: 2,
  listening: 2,
  confirmWords: 2,
  tooLittle: 2,
  reading: 2,
  understood: 2,
  question: 3,
  essentials: 3,
  setup: 3,
  style: 4,
  readyToBuild: 4,
  save: 4,
  code: 4,
  building: 4,
  arrival: 4,
};

export function flowStepOf(step: ModuleStep): FlowStepNumber {
  return FLOW_STEP_OF[step];
}

export type FlowLocale = "en" | "es";

/**
 * Spanish by default for Mexico: an `es-*` (or `es`) browser language, or a
 * Mexico country code when the browser names no language we serve. An explicit
 * saved choice (cookie / module state) wins, then an explicit en/es browser.
 */
export function defaultFlowLocale(input: { saved?: string | null; acceptLanguage?: string | null; country?: string | null }): FlowLocale {
  if (input.saved === "es" || input.saved === "en") return input.saved;
  // TUL-492: an EXPLICIT browser language wins over the IP country (an en-US
  // browser in Mexico gets English); Mexico only decides when the browser says
  // nothing we serve. This is the one resolver for /start and the auth pages.
  const first = (input.acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first === "es" || first.startsWith("es-")) return "es";
  if (first === "en" || first.startsWith("en-")) return "en";
  if ((input.country ?? "").toUpperCase() === "MX") return "es";
  return "en";
}

/**
 * TUL-146: an explicit `/es/start` URL is a language choice. The middleware
 * rewrites it to `/start`, so the page reads the browser pathname it recorded
 * and uses it as the saved locale (`?lang` still wins). `/start` returns null.
 */
export function flowLocaleFromPath(originalPath: string | null | undefined): FlowLocale | null {
  return /^\/es\/start\/?$/.test(originalPath ?? "") ? "es" : null;
}

type ChoiceCopy = { title: string; sub: string; creates: string };

export type ChooseCopy = {
  progress: (n: number) => string;
  step: (n: number) => string;
  back: string;
  title: string;
  subtitle: string;
  cards: Record<OnboardingChoice, ChoiceCopy>;
  agencyLink: string;
  /** TUL-163: visitors who want to book someone, not sign up. */
  bookLink: string;
  agencyNote: string;
  createsPrefix: string;
  next: string;
  toggleLabel: string;
};

export const CHOOSE_COPY: Record<FlowLocale, ChooseCopy> = {
  en: {
    progress: (n) => `YOUR START · ${n}/${FLOW_TOTAL}`,
    step: (n) => `Step ${n} of ${FLOW_TOTAL}`,
    back: "Back",
    title: "How do you work?",
    subtitle: "One choice. The next steps adapt to you.",
    cards: {
      myself: { title: "I work for myself", sub: "It is me and my clients", creates: "your profile and your own booking site" },
      studio: { title: "I own a studio or team", sub: "Other people offer services with me", creates: "your business workspace, you as admin" },
      both: { title: "Both", sub: "I run a team and I also serve clients myself", creates: "your business workspace and your own bookable profile" },
    },
    agencyLink: "I work for an agency or studio",
    bookLink: "I am here to book someone",
    agencyNote: "You join an agency or studio by invitation. Ask them to send you an invite link, and you will be set up from there.",
    createsPrefix: "We'll create: ",
    next: "Continue",
    toggleLabel: "Language",
  },
  es: {
    progress: (n) => `TU INICIO · ${n}/${FLOW_TOTAL}`,
    step: (n) => `Paso ${n} de ${FLOW_TOTAL}`,
    back: "Atrás",
    title: "¿Cómo trabajas?",
    subtitle: "Una sola elección. Lo demás se adapta a ti.",
    cards: {
      myself: { title: "Trabajo por mi cuenta", sub: "Soy yo y mis clientes", creates: "tu perfil y tu propio sitio de reservas" },
      studio: { title: "Tengo un estudio o equipo", sub: "Otras personas ofrecen servicios conmigo", creates: "tu espacio de negocio, tú como administrador" },
      both: { title: "Ambos", sub: "Tengo un equipo y también atiendo clientes", creates: "tu espacio de negocio y tu propio perfil reservable" },
    },
    agencyLink: "Trabajo para una agencia o estudio",
    bookLink: "Vengo a reservar con alguien",
    agencyNote: "Te unes a una agencia o estudio por invitación. Pídeles que te envíen un enlace de invitación y desde ahí te configuramos.",
    createsPrefix: "Crearemos: ",
    next: "Continuar",
    toggleLabel: "Idioma",
  },
};

/** The URL of the in-app flow. The choice and promo survive; `?start=unknown` never appears. */
export function flowUrl(opts: { choice?: OnboardingChoice | null; promo?: string | null; locale?: FlowLocale | null } = {}): string {
  const q = new URLSearchParams();
  if (opts.choice) q.set("choice", opts.choice);
  if (opts.promo && /^[A-Za-z0-9_-]{1,40}$/.test(opts.promo)) q.set("promo", opts.promo);
  if (opts.locale) q.set("lang", opts.locale);
  const qs = q.toString();
  return `/start${qs ? `?${qs}` : ""}`;
}
