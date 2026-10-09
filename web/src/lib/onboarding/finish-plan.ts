/**
 * TUL-16 / TUL-525 · what the Finish screen claims and offers, per choice.
 *
 * "Estudio" (studio) has no provider yet, so its page can receive REQUESTS but
 * is not bookable: it never says "bookable". The finish screen mirrors the
 * clear "Para mí" pattern: one primary action into the panel, then site /
 * customize, with add-member and also-book as real options — not a footnote.
 */

import type { ArrivalPayload } from "./arrival";

export type FinishPlan =
  | { kind: "standard" }
  | {
      kind: "inquiry_only";
      titleKey: "public.onboarding.arrival.inquiryTitle";
      subKey: "public.onboarding.arrival.inquirySub";
      /** Primary: open the owner's dashboard (same clarity as Para mí). */
      primary: { id: "open_panel"; labelKey: "public.onboarding.arrival.openMyPanel"; href: string };
      /** Add the first team member so bookings can start. */
      addMember: { id: "add_first_member"; labelKey: "public.onboarding.arrival.addFirstMember"; href: string };
      /** Also take bookings yourself (Ambos shape). */
      secondary: { id: "also_book_myself"; labelKey: "public.onboarding.arrival.alsoBookMyself"; href: string };
    };

export function finishPlan(arrival: ArrivalPayload): FinishPlan {
  if (!arrival.inquiryOnly || !arrival.addMemberHref || !arrival.alsoBookHref) return { kind: "standard" };
  const panelHref = arrival.panelHref ?? arrival.addMemberHref.replace(/\/roster\/new\/?$/, "");
  return {
    kind: "inquiry_only",
    titleKey: "public.onboarding.arrival.inquiryTitle",
    subKey: "public.onboarding.arrival.inquirySub",
    primary: {
      id: "open_panel",
      labelKey: "public.onboarding.arrival.openMyPanel",
      href: panelHref,
    },
    addMember: {
      id: "add_first_member",
      labelKey: "public.onboarding.arrival.addFirstMember",
      href: arrival.addMemberHref,
    },
    secondary: {
      id: "also_book_myself",
      labelKey: "public.onboarding.arrival.alsoBookMyself",
      href: arrival.alsoBookHref,
    },
  };
}
