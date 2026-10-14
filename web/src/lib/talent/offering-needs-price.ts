/**
 * TUL-567 · "Needs a price" cue on a service row. Onboarding never publishes a
 * service without a price; it lands as a draft, and this tells the owner why it
 * is not on the site and what to do. Pure.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function offeringNeedsPrice(item: Pick<TalentOffering, "status" | "priceDisplay" | "amountCents">): boolean {
  if (item.status !== "draft") return false;
  // TUL-805: a deliberate quote is a valid public price ("A cotizar"), so it never asks for a number.
  if (item.priceDisplay === "quote") return false;
  return !item.amountCents || item.amountCents <= 0;
}
