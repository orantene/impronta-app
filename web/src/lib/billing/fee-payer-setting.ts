/**
 * fee-payer-setting.ts — client-side contract for "Who pays the card fee".
 *
 * Owner rule: the client pays the service price plus a 1.5% platform fee. By
 * default the seller (talent or workspace) absorbs the card processing fee,
 * deducted at cost. When the seller picks "client", the client also covers
 * processing, so the seller receives 100% of the price.
 *
 * This file is PURE (no "use server"): types, rates as data, and the estimator
 * the UI uses to show a preview. The real charge is computed by the billing
 * engine; everything here is an ESTIMATE and must be labelled "about".
 *
 * The server actions live in ./fee-payer-actions.ts (a "use server" file may
 * only export async functions, so the pure helpers cannot share it).
 */

export type FeePayer = "seller" | "client";

export const DEFAULT_FEE_PAYER: FeePayer = "seller";

export type FeeProvider = "stripe_us" | "stripe_mx";

export type FeeRates = {
  /** Percentage of the charge, as a fraction (0.029 = 2.9%). */
  pct: number;
  /** Fixed fee per charge, in major units of the currency. */
  fixed: number;
  /** VAT charged on top of the provider fee (0.16 = 16% IVA), or 0. */
  vatOnFee: number;
};

/** Rates as data. Update here when the provider pricing changes. */
export const PROVIDER_FEE_RATES: Record<FeeProvider, FeeRates> = {
  stripe_us: { pct: 0.029, fixed: 0.3, vatOnFee: 0 },
  stripe_mx: { pct: 0.036, fixed: 3, vatOnFee: 0.16 },
};

/** Platform fee, as a fraction of the service price. */
export const PLATFORM_FEE_RATE = 0.015;

export function providerForCurrency(currency: string): FeeProvider {
  return currency.toUpperCase() === "MXN" ? "stripe_mx" : "stripe_us";
}

export type FeeLines = {
  currency: string;
  feePayer: FeePayer;
  /** All amounts are integer minor units (cents / centavos). */
  serviceMinor: number;
  platformFeeMinor: number;
  /** Charged to the client only in "client" mode; 0 otherwise. */
  clientProcessingMinor: number;
  /** What the client pays. */
  clientTotalMinor: number;
  /** Estimated card processing cost, whoever pays it. */
  processingEstimateMinor: number;
  /** Estimated amount the seller receives. */
  sellerReceivesMinor: number;
};

const round = (n: number) => Math.round(n);

/**
 * Estimate the fee lines for a booking. `price` is in major units
 * (100 = $100.00). Estimate only.
 */
export function previewFeeLines(input: {
  price: number;
  currency: string;
  feePayer: FeePayer;
  provider?: FeeProvider;
}): FeeLines {
  const provider = input.provider ?? providerForCurrency(input.currency);
  const r = PROVIDER_FEE_RATES[provider];
  const pct = r.pct * (1 + r.vatOnFee);
  const fixed = r.fixed * (1 + r.vatOnFee);
  const price = Math.max(0, input.price);
  const platform = price * PLATFORM_FEE_RATE;
  const serviceMinor = round(price * 100);
  const platformFeeMinor = round(platform * 100);
  const currency = input.currency.toUpperCase();

  if (input.feePayer === "client") {
    const gross = price === 0 ? 0 : (price + platform + fixed) / (1 - pct);
    const total = round(gross * 100);
    const clientProcessingMinor = total - serviceMinor - platformFeeMinor;
    return {
      currency,
      feePayer: "client",
      serviceMinor,
      platformFeeMinor,
      clientProcessingMinor,
      clientTotalMinor: total,
      processingEstimateMinor: clientProcessingMinor,
      sellerReceivesMinor: serviceMinor,
    };
  }

  const total = serviceMinor + platformFeeMinor;
  const processingEstimateMinor = price === 0 ? 0 : round(((total / 100) * pct + fixed) * 100);
  return {
    currency,
    feePayer: "seller",
    serviceMinor,
    platformFeeMinor,
    clientProcessingMinor: 0,
    clientTotalMinor: total,
    processingEstimateMinor,
    sellerReceivesMinor: serviceMinor - processingEstimateMinor,
  };
}

/** Format minor units for display, e.g. 10484 USD -> "$104.84". */
export function formatFeeMoney(minor: number, currency: string, locale = "en"): string {
  const code = currency.toUpperCase();
  const n = (minor / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (code === "MXN") return `MX$${n}`;
  return code === "USD" ? `$${n}` : `${n} ${code}`;
}
