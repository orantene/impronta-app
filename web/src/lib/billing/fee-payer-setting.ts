/**
 * fee-payer-setting.ts — client-side contract for "Who pays the card fee".
 *
 * Owner rule: the client pays the service price plus a platform fee
 * (`PASS_THROUGH_DEFAULT_TAKE_BPS`, default 150 = 1.5%). By default the seller
 * (talent or workspace) absorbs the card processing fee, deducted at cost.
 * When the seller picks "client", the client also covers processing, so the
 * seller receives 100% of the price.
 *
 * This file is PURE (no "use server"): types + the preview the settings UI
 * shows. Preview math is the SAME pure path the server charges with —
 * `resolveBookingCommissions` + `grossUpForProcessorFee` / `estimateProcessorFeeCents`
 * over {@link DEFAULT_PROCESSOR_FEE_RATES}, all in integer cents.
 *
 * The server actions live in ./fee-payer-actions.ts (a "use server" file may
 * only export async functions, so the pure helpers cannot share it).
 */

import {
  DEFAULT_PROCESSOR_FEE_RATES,
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  estimateProcessorFeeCents,
  processorFeeRatesForCurrency,
  resolveBookingCommissions,
  type ProcessorFeeRates,
} from "./commission";

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

/**
 * @deprecated Prefer {@link DEFAULT_PROCESSOR_FEE_RATES} / {@link processorFeeRatesForCurrency}.
 * Kept as a major-unit view of the same table for older call sites.
 */
export const PROVIDER_FEE_RATES: Record<FeeProvider, FeeRates> = {
  stripe_us: {
    pct: DEFAULT_PROCESSOR_FEE_RATES.default.percent,
    fixed: DEFAULT_PROCESSOR_FEE_RATES.default.fixed_cents / 100,
    vatOnFee: DEFAULT_PROCESSOR_FEE_RATES.default.tax_on_fee ?? 0,
  },
  stripe_mx: {
    pct: DEFAULT_PROCESSOR_FEE_RATES.mxn.percent,
    fixed: DEFAULT_PROCESSOR_FEE_RATES.mxn.fixed_cents / 100,
    vatOnFee: DEFAULT_PROCESSOR_FEE_RATES.mxn.tax_on_fee ?? 0,
  },
};

/** Platform take in basis points — same default the charge path uses. */
export const PLATFORM_TAKE_BPS = PASS_THROUGH_DEFAULT_TAKE_BPS;

/** Platform fee as a fraction of the service price (derived from bps). */
export const PLATFORM_FEE_RATE = PLATFORM_TAKE_BPS / 10_000;

export function providerForCurrency(currency: string): FeeProvider {
  return currency.toUpperCase() === "MXN" ? "stripe_mx" : "stripe_us";
}

function ratesForProvider(provider: FeeProvider): ProcessorFeeRates {
  return provider === "stripe_mx"
    ? DEFAULT_PROCESSOR_FEE_RATES.mxn
    : DEFAULT_PROCESSOR_FEE_RATES.default;
}

export type FeeLines = {
  currency: string;
  feePayer: FeePayer;
  /** Platform take used for this preview, in bps. */
  platformTakeBps: number;
  /** All amounts are integer minor units (cents / centavos). */
  serviceMinor: number;
  platformFeeMinor: number;
  /** Charged to the client only in "client" mode; 0 otherwise. */
  clientProcessingMinor: number;
  /** What the client pays — equals server `gross_charged_cents`. */
  clientTotalMinor: number;
  /** Estimated card processing cost, whoever pays it. */
  processingEstimateMinor: number;
  /** Estimated amount the seller receives. */
  sellerReceivesMinor: number;
};

/**
 * Fee lines for a booking preview. `price` is in major units (100 = $100.00).
 * Math is integer cents via {@link resolveBookingCommissions} — the same
 * function that produces the server charge.
 */
export function previewFeeLines(input: {
  price: number;
  currency: string;
  feePayer: FeePayer;
  /** @deprecated Prefer currency; rates come from {@link DEFAULT_PROCESSOR_FEE_RATES}. */
  provider?: FeeProvider;
  /** Override platform take (bps). Defaults to {@link PLATFORM_TAKE_BPS}. */
  takeBps?: number;
  /** Override processor rates. Defaults from the canonical table. */
  processorFeeRates?: ProcessorFeeRates;
}): FeeLines {
  const currency = input.currency.toUpperCase();
  const serviceMinor = Math.round(Math.max(0, input.price) * 100);
  const takeBps = input.takeBps ?? PLATFORM_TAKE_BPS;
  const rates =
    input.processorFeeRates ??
    (input.provider ? ratesForProvider(input.provider) : processorFeeRatesForCurrency(currency));

  if (serviceMinor === 0) {
    return {
      currency,
      feePayer: input.feePayer,
      platformTakeBps: takeBps,
      serviceMinor: 0,
      platformFeeMinor: 0,
      clientProcessingMinor: 0,
      clientTotalMinor: 0,
      processingEstimateMinor: 0,
      sellerReceivesMinor: 0,
    };
  }

  const snap = resolveBookingCommissions({
    tenantId: "preview",
    workspacePlan: "agency",
    offerLineItems: [{ line_total_cents: serviceMinor, talent_cost_total_cents: serviceMinor }],
    currencyCode: currency,
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: {
      default_take_bps: 600,
      default_take_floor_cents: 0,
      plan_tier_bps: {},
      processing_mode: "pass_through",
      pass_through_take_bps: takeBps,
    },
    tenantOverride: null,
    processingFeePayer: input.feePayer,
    processorFeeRates: rates,
  });

  const platformFeeMinor = snap.client_surcharge_cents;
  const clientTotalMinor = snap.gross_charged_cents;
  const clientProcessingMinor = snap.client_processing_fee_cents ?? 0;
  // Seller-pays: charge path freezes provisional lanes before the actual fee
  // is known; the settings preview still shows the estimated deduction.
  const processingEstimateMinor =
    input.feePayer === "client"
      ? clientProcessingMinor
      : estimateProcessorFeeCents(clientTotalMinor, rates);
  const sellerReceivesMinor =
    input.feePayer === "client" ? serviceMinor : serviceMinor - processingEstimateMinor;

  return {
    currency,
    feePayer: input.feePayer,
    platformTakeBps: takeBps,
    serviceMinor,
    platformFeeMinor,
    clientProcessingMinor,
    clientTotalMinor,
    processingEstimateMinor,
    sellerReceivesMinor,
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
