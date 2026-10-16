import { appointmentsTierForTalentPlan } from "@/lib/scheduling/talent-booking-mode";

/** The printable promo card is for paid talents (website tier) only. */
export function printableCardAllowed(talentPlanKey: string | null | undefined): boolean {
  return appointmentsTierForTalentPlan(talentPlanKey) === "website";
}
