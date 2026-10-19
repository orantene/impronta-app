/**
 * pricing-audience.ts (TUL-1192): which column of /pricing is open.
 * `?for=business` opens the business ladder; anything else is the person ladder.
 */
export type PricingAudience = "person" | "business";

export function parsePricingAudience(value: unknown): PricingAudience {
  return value === "business" ? "business" : "person";
}
