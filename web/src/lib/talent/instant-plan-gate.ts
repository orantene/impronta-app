/**
 * TUL-1270 #12: instant booking and the talent's plan. PURE.
 *
 * The entitlement itself is unchanged (`loadPlanAllowsInstant`, free tier =
 * request only; the public page already shows such a service as request). This
 * module only decides two things from it:
 *  - the editor notice: shown when the item would book instantly (its own
 *    choice or the inherited default) and the plan does not include instant.
 *  - the server refusal: a save that NEWLY picks instant on such a plan. A row
 *    that already stored instant keeps saving (no lock-out of existing items);
 *    an unknown plan (failed read) never refuses, the same rule as the loader.
 */

export type InstantPlanInput = {
  /** The mode being saved (null = inherits the talent default). */
  nextMode: string | null | undefined;
  /** The mode stored before this save (null for a new item or an inheriting row). */
  priorMode: string | null | undefined;
  /** From loadPlanAllowsInstant; undefined when unknown. */
  planAllowsInstant: boolean | undefined;
};

export function instantPlanRefuses(input: InstantPlanInput): boolean {
  return input.planAllowsInstant === false && input.nextMode === "instant" && input.priorMode !== "instant";
}

export function showInstantPlanNotice(input: {
  effectiveMode: string | null | undefined;
  quote: boolean;
  planAllowsInstant: boolean | undefined;
}): boolean {
  return input.planAllowsInstant === false && !input.quote && input.effectiveMode === "instant";
}

export const INSTANT_PLAN_REFUSAL_EN =
  "Instant booking is not included in your plan. Set this service to Request to book, or upgrade your plan.";

export const INSTANT_PLAN_REFUSAL_ES =
  "La reserva instantánea no está incluida en tu plan. Cambia este servicio a Pedir reserva, o mejora tu plan.";

export function instantPlanNoticeCopy(isSpanish: boolean): { body: string; cta: string } {
  return isSpanish
    ? {
        body: "Tu plan no incluye la reserva instantánea. En tu página este servicio se muestra como Pedir reserva hasta que mejores tu plan.",
        cta: "Ver planes",
      }
    : {
        body: "Your plan does not include instant booking. Your page shows this service as Request to book until you upgrade.",
        cta: "See plans",
      };
}
