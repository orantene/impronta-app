/**
 * lib/billing/talent-cancel.ts (TUL-832)
 *
 * Pure pieces of the talent cancel / resume flow: reason vocabulary, the
 * mapping onto Stripe's `cancellation_details.feedback`, idempotency keys and
 * the ES/EN copy. No Stripe, no Supabase, no "server-only", so it is shared by
 * the server actions, the client flow and the unit tests.
 *
 * Cancel here means `cancel_at_period_end`. The plan row and
 * `talent_profiles.talent_plan_key` are NEVER written from this path; the
 * webhook single writer (talent-plan-state.ts) does that when Stripe reports
 * the change, and drops the talent to Free on `customer.subscription.deleted`.
 */

export const TALENT_CANCEL_REASONS = [
  "too_expensive",
  "not_using",
  "missing_feature",
  "found_alternative",
  "technical_issue",
  "other",
] as const;

export type TalentCancelReason = (typeof TALENT_CANCEL_REASONS)[number];

export function isTalentCancelReason(v: unknown): v is TalentCancelReason {
  return typeof v === "string" && (TALENT_CANCEL_REASONS as readonly string[]).includes(v);
}

/** Stripe's `cancellation_details.feedback` enum. */
export type StripeCancelFeedback =
  | "too_expensive"
  | "missing_features"
  | "switched_service"
  | "unused"
  | "too_complex"
  | "low_quality"
  | "customer_service"
  | "other";

const STRIPE_FEEDBACK: Record<TalentCancelReason, StripeCancelFeedback> = {
  too_expensive: "too_expensive",
  not_using: "unused",
  missing_feature: "missing_features",
  found_alternative: "switched_service",
  technical_issue: "low_quality",
  other: "other",
};

export function stripeFeedbackFor(reason: TalentCancelReason): StripeCancelFeedback {
  return STRIPE_FEEDBACK[reason];
}

/** Stripe caps `cancellation_details.comment` at 5000 chars; keep it short. */
export function cleanCancelComment(raw: string | null | undefined): string | undefined {
  const t = (raw ?? "").trim().slice(0, 500);
  return t.length ? t : undefined;
}

/**
 * Idempotency key for a cancel / resume call. A pure per-subscription key
 * would make cancel -> resume -> cancel replay the FIRST response for 24h and
 * silently do nothing, so the key carries a one-minute bucket: a double click
 * dedupes, a deliberate later toggle does not.
 */
export function talentCancelIdempotencyKey(
  kind: "cancel" | "resume",
  subscriptionId: string,
  nowMs: number,
): string {
  return `talent_${kind}_${subscriptionId}_${Math.floor(nowMs / 60_000)}`;
}

/** Statuses where there is still a live subscription to cancel or resume. */
const LIVE = new Set(["active", "trialing", "past_due"]);
export function isLiveTalentSubscriptionStatus(status: string | null | undefined): boolean {
  return status != null && LIVE.has(status);
}

/**
 * TUL-1356: what the in-app plan card shows for cancel / resume. Only a PAID plan with a live
 * subscription gets either; a subscription already set to end at period end gets Resume.
 * Free talents (`talent_basic`) and talents with no live subscription get neither.
 */
export function talentPlanCancelBlock(
  planKey: string | null | undefined,
  subscription: { status: string; cancelAtPeriodEnd: boolean } | null | undefined,
): "none" | "cancel" | "resume" {
  if (!planKey || planKey === "talent_basic" || !subscription) return "none";
  if (!isLiveTalentSubscriptionStatus(subscription.status)) return "none";
  return subscription.cancelAtPeriodEnd ? "resume" : "cancel";
}

export type Bi = { en: string; es: string };

export const TALENT_CANCEL_COPY = {
  cancelCta: { en: "Cancel plan", es: "Cancelar plan" },
  resumeCta: { en: "Resume plan", es: "Reanudar plan" },
  resuming: { en: "Resuming...", es: "Reanudando..." },
  endsBanner: {
    en: "Your plan ends on {date}. You keep everything until then.",
    es: "Tu plan termina el {date}. Conservas todo hasta entonces.",
  },
  endsBannerNoDate: {
    en: "Your plan is set to end at the close of this billing period.",
    es: "Tu plan terminara al cierre de este periodo de facturacion.",
  },
  reasonTitle: { en: "What is making you leave?", es: "Por que quieres irte?" },
  reasonIntro: {
    en: "One quick question so we can improve.",
    es: "Una pregunta rapida para mejorar.",
  },
  reasons: {
    too_expensive: { en: "Too expensive", es: "Es muy caro" },
    not_using: { en: "Not using it enough", es: "No lo uso lo suficiente" },
    missing_feature: { en: "Missing a feature I need", es: "Me falta una funcion" },
    found_alternative: { en: "Found another tool", es: "Encontre otra herramienta" },
    technical_issue: { en: "Technical issue", es: "Problema tecnico" },
    other: { en: "Other", es: "Otro" },
  } satisfies Record<TalentCancelReason, Bi>,
  feedbackPlaceholder: { en: "Anything else? (optional)", es: "Algo mas? (opcional)" },
  pickReason: { en: "Pick a reason to continue.", es: "Elige un motivo para continuar." },
  continue: { en: "Continue", es: "Continuar" },
  back: { en: "Back", es: "Atras" },
  neverMind: { en: "Never mind", es: "Mejor no" },
  offerTitle: { en: "Keep your page on the Free plan instead?", es: "Quedarte en el plan Gratis?" },
  offerBody: {
    en: "Cancelling already moves you to Free when this period ends, so you never lose your page or content. Compare plans if price is the issue.",
    es: "Al cancelar pasas al plan Gratis cuando termina este periodo, asi que no pierdes tu pagina ni tu contenido. Compara planes si el precio es el problema.",
  },
  comparePlans: { en: "Compare plans", es: "Comparar planes" },
  cancelAnyway: { en: "Continue cancelling", es: "Seguir cancelando" },
  confirmTitle: { en: "Confirm cancellation", es: "Confirmar cancelacion" },
  confirmBody: {
    en: "Your plan stays active until {date}. After that you move to Free. Nothing is refunded and nothing is deleted.",
    es: "Tu plan sigue activo hasta el {date}. Despues pasas al plan Gratis. No hay reembolso y no se borra nada.",
  },
  confirmBodyNoDate: {
    en: "Your plan stays active until the end of this billing period. After that you move to Free. Nothing is refunded and nothing is deleted.",
    es: "Tu plan sigue activo hasta el final de este periodo. Despues pasas al plan Gratis. No hay reembolso y no se borra nada.",
  },
  confirmCta: { en: "Cancel my plan", es: "Cancelar mi plan" },
  cancelling: { en: "Cancelling...", es: "Cancelando..." },
  doneTitle: { en: "Your plan will end on {date}.", es: "Tu plan terminara el {date}." },
  billingUnavailable: {
    en: "Billing is not available right now. Nothing was changed.",
    es: "La facturacion no esta disponible ahora. No se cambio nada.",
  },
} as const;

export function pickCopy(c: Bi, es: boolean): string {
  return es ? c.es : c.en;
}

export function fillDate(template: string, date: string): string {
  return template.replace("{date}", date);
}
