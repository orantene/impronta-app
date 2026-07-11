/**
 * Bilingual copy for the /get-started signup form. Extracted from
 * `get-started-form.tsx` to keep that file under the 800-line lint cap.
 * Natural Mexican-Spanish ("tú").
 */

type AudienceKey = "operator" | "agency" | "organization";

/** Self-identification radio options. Keys are stable (wired to the server
 *  action + analytics); only labels/descriptions are localized. */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function getAudienceOptions(
  locale: string,
): { key: AudienceKey; label: string; description: string }[] {
  return pickLocale(locale, {
    en: [
      { key: "operator", label: "Just me", description: "I sell my own services." },
      { key: "agency", label: "An agency or studio", description: "We represent other people." },
      { key: "organization", label: "A band, team, or network", description: "We're a group working together." },
    ],
    es: [
      { key: "operator", label: "Solo yo", description: "Vendo mis propios servicios." },
      { key: "agency", label: "Una agencia o estudio", description: "Representamos a otras personas." },
      { key: "organization", label: "Una banda, equipo o red", description: "Somos un grupo que trabaja junto." },
    ],
  });
}

export type GetStartedFormCopy = {
  eyebrow: string;
  freeNoCard: string;
  heading: string;
  headingCompact: string;
  whichDescribes: string;
  whichDescribesOptional: string;
  businessName: string;
  businessNamePlaceholder: string;
  businessNameHint: string;
  addDescription: string;
  hideDescription: string;
  businessDescription: string;
  businessDescriptionPlaceholder: string;
  yourName: string;
  workEmail: string;
  pickLink: string;
  teamSize: string;
  createWorkspace: string;
  reserving: string;
  ctaFinePrint: string;
  savedSpot: string;
};

export function getFormCopy(locale: string): GetStartedFormCopy {
  return pickLocale(locale, {
    en: {
      eyebrow: "Start your business",
      freeNoCard: "Free · no card",
      heading: "Start in under ten minutes.",
      headingCompact: "Create your free site",
      whichDescribes: "Which describes you best?",
      whichDescribesOptional: "Which describes you best? (optional)",
      businessName: "Name your business",
      businessNamePlaceholder: "e.g. Riviera Maya Work",
      businessNameHint: "This names your workspace and your link. You can change both later.",
      addDescription: "Add a short description (optional)",
      hideDescription: "Hide description",
      businessDescription: "Short description",
      businessDescriptionPlaceholder: "What do you do? One line is plenty.",
      yourName: "Your name",
      workEmail: "Work email",
      pickLink: "Your link name",
      teamSize: "How big is your team?",
      createWorkspace: "Create my free workspace",
      reserving: "Reserving your link…",
      ctaFinePrint: "Takes you straight to your new workspace. No card, free forever.",
      savedSpot: "We saved your spot:",
    },
    es: {
      eyebrow: "Empieza tu negocio",
      freeNoCard: "Gratis · sin tarjeta",
      heading: "Empieza en menos de diez minutos.",
      headingCompact: "Crea tu sitio gratis",
      whichDescribes: "¿Qué te describe mejor?",
      whichDescribesOptional: "¿Qué te describe mejor? (opcional)",
      businessName: "Nombra tu negocio",
      businessNamePlaceholder: "ej. Riviera Maya Work",
      businessNameHint: "Esto nombra tu workspace y tu link. Puedes cambiar ambos después.",
      addDescription: "Agrega una descripción corta (opcional)",
      hideDescription: "Ocultar descripción",
      businessDescription: "Descripción corta",
      businessDescriptionPlaceholder: "¿A qué te dedicas? Con una línea basta.",
      yourName: "Tu nombre",
      workEmail: "Correo de trabajo",
      pickLink: "El nombre de tu link",
      teamSize: "¿De qué tamaño es tu equipo?",
      createWorkspace: "Crea tu workspace gratis",
      reserving: "Reservando tu link…",
      ctaFinePrint: "Te lleva directo a tu nuevo workspace. Sin tarjeta, gratis para siempre.",
      savedSpot: "Guardamos tu lugar:",
    },
  });
}
