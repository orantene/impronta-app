/**
 * TUL-16 · what the Finish screen claims and offers, per choice. Pure.
 *
 * "Estudio" (studio) has no provider yet, so its page can receive REQUESTS but
 * is not bookable: it never says "bookable", and its single next action is to
 * add the first team member. "Para mi" (myself) and "Ambos" (both) keep the
 * existing arrival unchanged (`kind: "standard"`).
 */

import type { ArrivalPayload } from "./arrival";

export type FinishPlan =
  | { kind: "standard" }
  | {
      kind: "inquiry_only";
      titleKey: "public.onboarding.arrival.inquiryTitle";
      subKey: "public.onboarding.arrival.inquirySub";
      /** The one primary action: add the first team member (roster). */
      primary: { id: "add_first_member"; labelKey: "public.onboarding.arrival.addFirstMember"; href: string };
      /** The small secondary link: also take bookings yourself (Ambos shape). */
      secondary: { id: "also_book_myself"; labelKey: "public.onboarding.arrival.alsoBookMyself"; href: string };
    };

export function finishPlan(arrival: ArrivalPayload): FinishPlan {
  if (!arrival.inquiryOnly || !arrival.addMemberHref || !arrival.alsoBookHref) return { kind: "standard" };
  return {
    kind: "inquiry_only",
    titleKey: "public.onboarding.arrival.inquiryTitle",
    subKey: "public.onboarding.arrival.inquirySub",
    primary: { id: "add_first_member", labelKey: "public.onboarding.arrival.addFirstMember", href: arrival.addMemberHref },
    secondary: { id: "also_book_myself", labelKey: "public.onboarding.arrival.alsoBookMyself", href: arrival.alsoBookHref },
  };
}
