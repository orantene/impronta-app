/**
 * One public price string for a service, shared by the home services block
 * (menu board) and the standalone service page, so the two never disagree on
 * "from" wording, currency code or cents. Display only: stored data is untouched.
 */
import { formatMoney } from "@/lib/talent/offerings-money";

export type PublicPriceInput = {
  amountCents: number | null | undefined;
  currency: string | null | undefined;
  priceDisplay: string | null | undefined;
  /** D-10a: an `on_request` service withholds its price (stays listed). */
  visibility?: string | null;
};

/** "$700 MXN" or "desde $700 MXN" / "from $700 MXN"; null when the price is not public or not numeric. */
export function publicPriceLine(o: PublicPriceInput, locale: string): string | null {
  if (o.visibility === "on_request") return null;
  if (!o.amountCents || o.amountCents <= 0 || !o.currency) return null;
  if (o.priceDisplay !== "exact" && o.priceDisplay !== "from") return null;
  const es = locale.toLowerCase().startsWith("es");
  const money = formatMoney(o.amountCents, o.currency, locale);
  return o.priceDisplay === "from" ? `${es ? "desde" : "from"} ${money}` : money;
}
