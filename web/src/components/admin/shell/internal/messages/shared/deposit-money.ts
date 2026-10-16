import { formatOfferMoney } from "@/lib/inquiry/offer-currency";
import { minorUnitDivisor } from "@/lib/orders/money-format";

/** Deposit cents to the one dashboard format; zero-decimal safe (TUL-382). */
export function depositMoney(cents: number, currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  return formatOfferMoney(cents / (code ? minorUnitDivisor(code) : 100), currency);
}
