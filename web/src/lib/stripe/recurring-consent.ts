/**
 * TUL-1229: the recurring-charge agreement on plan subscription Checkout
 * (talent + workspace lanes).
 *
 * Stripe Checkout shows a required "I agree to the Terms" checkbox above the
 * Subscribe button (`consent_collection.terms_of_service: "required"`) and the
 * `terms_of_service_acceptance` text next to it; `submit` text sits under the
 * button. Nothing here changes an amount: DISPLAY / legal only.
 *
 * Pure (no network, no env reads): the caller passes the marketing origin.
 * Stripe requires a Terms of Service URL in the account's public details for
 * `terms_of_service` consent to work on that account.
 */
import { authLegalHref } from "@/app/(auth)/auth-legal-href";

export type RecurringInterval = "month" | "year";

type Copy = {
  submit: (every: string) => string;
  accept: (every: string, termsLink: string) => string;
  trialSubmit: (days: number, every: string) => string;
  trialAccept: (days: number, every: string, termsLink: string) => string;
  every: Record<RecurringInterval, string>;
  terms: string;
};

const COPY: Record<"en" | "es", Copy> = {
  en: {
    every: { month: "every month", year: "every year" },
    terms: "Terms",
    submit: (every) => `Your plan renews automatically ${every} until you cancel.`,
    accept: (every, link) =>
      `I agree that Tulala will charge my card the price shown now and ${every} until I cancel, under the ${link}. ` +
      `I can cancel any time in Settings and keep access to the end of the period I paid for.`,
    trialSubmit: (days, every) =>
      `Free for ${days} days, then your plan renews automatically ${every} until you cancel.`,
    trialAccept: (days, every, link) =>
      `I understand my card will not be charged today. After the ${days}-day free trial, Tulala will charge it the price shown ${every} until I cancel, under the ${link}. ` +
      `I can cancel any time in Settings before the trial ends to avoid a charge, and keep access until the trial ends.`,
  },
  es: {
    every: { month: "cada mes", year: "cada año" },
    terms: "Términos",
    submit: (every) => `Tu plan se renueva automáticamente ${every} hasta que canceles.`,
    accept: (every, link) =>
      `Acepto que Tulala cargue a mi tarjeta el precio indicado ahora y ${every} hasta que cancele, según los ${link}. ` +
      `Puedo cancelar cuando quiera en Ajustes y conservar el acceso hasta el final del periodo pagado.`,
    trialSubmit: (days, every) =>
      `Gratis por ${days} días, luego tu plan se renueva automáticamente ${every} hasta que canceles.`,
    trialAccept: (days, every, link) =>
      `Entiendo que no se me cobrará hoy. Después de los ${days} días de prueba gratis, Tulala cargará a mi tarjeta el precio indicado ${every} hasta que cancele, según los ${link}. ` +
      `Puedo cancelar cuando quiera en Ajustes antes de que termine la prueba para evitar un cargo, y conservar el acceso hasta que termine la prueba.`,
  },
};

export function recurringConsentParams(opts: {
  locale: string | null | undefined;
  interval: RecurringInterval;
  /** The session's own `trial_period_days` value (null/0 = no trial: charged now). */
  trialDays?: number | null;
  /** `resolveMarketingOrigin()`; the Terms page lives on the marketing host. */
  marketingOrigin: string;
}) {
  const lang = (opts.locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
  const c = COPY[lang];
  const every = c.every[opts.interval];
  const href = authLegalHref(opts.marketingOrigin, "terms", lang);
  const trial = opts.trialDays != null && opts.trialDays > 0 ? opts.trialDays : null;
  const termsLink = `[${c.terms}](${href})`;
  return {
    consent_collection: { terms_of_service: "required" as const },
    custom_text: {
      submit: { message: trial ? c.trialSubmit(trial, every) : c.submit(every) },
      terms_of_service_acceptance: {
        message: trial ? c.trialAccept(trial, every, termsLink) : c.accept(every, termsLink),
      },
    },
  };
}
