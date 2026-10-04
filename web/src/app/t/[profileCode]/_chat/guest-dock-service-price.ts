/**
 * Price line for a talent's own service rows inside the guest dock catalog.
 * Criteria form: "$500 MXN · ≈ US$28". Refuses a fake USD line when rates are
 * missing — then prints only the local amount ("$500 MXN").
 */
import {
  usdEquivalentLabel,
  type UsdRates,
} from "@/lib/pricing/usd-equivalent";

export type DockServiceMenuItem = {
  title: string;
  category: string;
  amountCents?: number | null;
  currency?: string | null;
  /** Preformatted "$500 MXN · ≈ US$28" (or local-only). Null/absent = unpriced. */
  priceLabel?: string | null;
};

function localMoneyFigure(amountCents: number): string {
  const amount = amountCents / 100;
  const whole = Number.isInteger(amount);
  const shown = amount.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `$${shown}`;
}

export function guestDockServicePriceLabel(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
  locale: string,
): string | null {
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }
  const cur = (currency ?? "USD").trim().toUpperCase() || "USD";
  const fig = localMoneyFigure(amountCents);
  const withCode = cur === "USD" ? fig : `${fig} ${cur}`;
  const usd = usdEquivalentLabel(amountCents, cur, fx, locale);
  return usd ? `${withCode} · ${usd}` : withCode;
}
