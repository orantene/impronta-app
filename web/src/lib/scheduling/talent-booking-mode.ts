/**
 * What a talent page may promise. Direct booking is plan-gated:
 * free confirms by hand, website (Portfolio) may book a time.
 * `talent_portfolio` is the website tier. Every other talent plan,
 * including null, is free.
 */

import { appointmentModeRank, getAppointmentsPlanPolicy } from "./appointments-plan-policy";

export function appointmentsTierForTalentPlan(planKey: string | null | undefined): "free" | "website" {
  return planKey === "talent_portfolio" ? "website" : "free";
}

export function talentOffersInstantBooking(planKey: string | null | undefined): boolean {
  const policy = getAppointmentsPlanPolicy(appointmentsTierForTalentPlan(planKey));
  return appointmentModeRank(policy.maxMode) >= appointmentModeRank("instant");
}

export function confirmsByHandCopy(locale: string | null | undefined): string {
  if (locale === "es") return "Ella confirma a mano.";
  if (locale === "fr") return "Elle confirme à la main.";
  return "She confirms by hand.";
}
