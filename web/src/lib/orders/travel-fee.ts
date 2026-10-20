/**
 * E5 (TUL-1270 M2): the travel fee from the talent's Defaults.
 *
 * The Defaults screen promises "The travel fee is added to home visits and paid
 * on the day." So the rule is exactly that: once per visit (not per unit, not
 * per extra), only when the service happens at the client's place (the same
 * `where` rule that makes the sheet ask for an address), and never part of the
 * online charge. Pure; the quote action reads the rows and the sheet shows it.
 */
import { serviceAddressRule } from "@/lib/scheduling/service-address";
import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

export function travelFeeOnDayCents(input: {
  where: readonly OfferingDeliveryWhere[] | null | undefined;
  /** `talent_profiles.selling_defaults` as stored (any shape). */
  sellingDefaults: unknown;
}): number {
  if (serviceAddressRule(input.where) !== "required") return 0;
  const d = input.sellingDefaults;
  const fee = d && typeof d === "object" && !Array.isArray(d) ? (d as { travelFeeCents?: unknown }).travelFeeCents : null;
  return typeof fee === "number" && Number.isSafeInteger(fee) && fee > 0 ? fee : 0;
}
