import type { PaymentChoice } from "@/lib/orders/purchase-policy";

/** INTENT for instant book. A deposit offering must not be charged in full. */
export function instantBookPaymentChoice(
  payInPerson: boolean | undefined,
  reserveMode: string | null | undefined,
): PaymentChoice {
  if (payInPerson === true) return "in_person";
  if (reserveMode === "deposit") return "deposit";
  return "full";
}
