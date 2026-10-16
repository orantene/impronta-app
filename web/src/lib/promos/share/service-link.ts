import { signTalentOfferingIntent } from "@/lib/messaging/talent-offering-intent";

/**
 * The promo landing CTA for a one-service promo. `?service=` on a talent site
 * is a SIGNED choice (TalentOfferingIntentQuery hands it to the chat seed,
 * which verifies it), never a raw offering id. When signing is not possible
 * (no secret) the CTA falls back to the site home rather than ship a link the
 * site would reject.
 */
export function promoServiceHref(
  home: string,
  input: { profileId: string | null | undefined; serviceId: string },
  nowMs = Date.now(),
): string {
  if (!input.profileId) return home;
  const token = signTalentOfferingIntent(
    { profileId: input.profileId, offeringId: input.serviceId, intent: "reserve" },
    nowMs,
  );
  if (!token) return home;
  return `${home}${home.includes("?") ? "&" : "?"}service=${encodeURIComponent(token)}`;
}
