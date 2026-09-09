/**
 * Talent experience destinations and earnings states (Master §8).
 */

export const TALENT_DESTINATIONS = [
  "today",
  "my_calendar",
  "assignments",
  "my_services",
  "clients",
  "projects",
  "earnings",
  "public_profile",
  "settings",
] as const;

export type TalentDestination = (typeof TALENT_DESTINATIONS)[number];

export type OfferingOwnership = "owned" | "represented";

export type AssignmentAction =
  | "accept"
  | "decline"
  | "request_change"
  | "mark_arrived"
  | "submit_work"
  | "complete";

export type EarningsBucket = "quoted_fee" | "earned" | "approved_payable" | "paid_payout";

export function classifyOfferingOwnership(input: {
  talentProfileId: string;
  ownerTalentProfileId: string | null;
  representedByTenant: boolean;
}): OfferingOwnership {
  if (input.ownerTalentProfileId === input.talentProfileId) return "owned";
  if (input.representedByTenant) return "represented";
  return "owned";
}

/**
 * Accept checks real availability — a busy window refuses rather than
 * double-booking and hoping the calendar catches up.
 */
export function mayAcceptAssignment(input: {
  talentFree: boolean;
  alreadyAccepted: boolean;
}): { ok: true } | { ok: false; reason: "busy" | "already_accepted" } {
  if (input.alreadyAccepted) return { ok: false, reason: "already_accepted" };
  if (!input.talentFree) return { ok: false, reason: "busy" };
  return { ok: true };
}
