/**
 * fee-payer-setting.ts — client-side contract for "Who pays the card fee".
 *
 * Owner rule: the client pays the service price plus a platform fee
 * (`pass_through_take_bps` from live platform config). By default the seller
 * (talent or workspace) absorbs the card processing fee, deducted at cost.
 * When the seller picks "client", the client also covers processing, so the
 * seller receives 100% of the price.
 *
 * This file is PURE (no "use server"): types + the preview the settings UI
 * shows. Preview math is the SAME pure path the server charges with —
 * `resolveBookingCommissions` over live `takeBps` + `processorFeeRates`
 * (loaded via `engine_platform_processing_mode`), all in integer cents.
 * Callers MUST supply those values — this module does not invent 150 bps or
 * a code-local rate table.
 *
 * The server actions live in ./fee-payer-actions.ts (a "use server" file may
 * only export async functions, so the pure helpers cannot share it).
 */

import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  DEFAULT_PROCESSOR_FEE_RATES,
  estimateProcessorFeeCents,
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
 * @deprecated Prefer live `processor_fee_rates` from
 * `engine_platform_processing_mode`. Kept as a major-unit view of the SQL
 * default table for older call sites / fixtures.
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

/** @deprecated Prefer live `takeBps` from {@link feePreviewConfigFromProcessingModeRow}. */
export const PLATFORM_TAKE_BPS = PASS_THROUGH_DEFAULT_TAKE_BPS;

/** @deprecated Prefer `takeBps / 10000` from the live config. */
export const PLATFORM_FEE_RATE = PLATFORM_TAKE_BPS / 10_000;

export function providerForCurrency(currency: string): FeeProvider {
  return currency.toUpperCase() === "MXN" ? "stripe_mx" : "stripe_us";
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
 *
 * `takeBps` and `processorFeeRates` are REQUIRED — they must come from the
 * live `engine_platform_processing_mode` row (or an identical fixture in tests).
 */
export function previewFeeLines(input: {
  price: number;
  currency: string;
  feePayer: FeePayer;
  /** Live pass_through take (bps) from platform config. */
  takeBps: number;
  /** Live processor rates for the presentment currency. */
  processorFeeRates: ProcessorFeeRates;
  /** Platform take floor in cents (from config / override). Default 0. */
  takeFloorCents?: number;
  /** Optional tenant override floor / take — same shape the engine applies. */
  tenantOverride?: {
    platform_take_bps: number | null;
    platform_take_floor_cents: number | null;
  } | null;
}): FeeLines {
  const currency = input.currency.toUpperCase();
  const serviceMinor = Math.round(Math.max(0, input.price) * 100);
  const takeBps = input.takeBps;
  const rates = input.processorFeeRates;
  const takeFloorCents = input.takeFloorCents ?? 0;

  if (!Number.isFinite(takeBps) || takeBps < 0) {
    throw new Error("previewFeeLines: takeBps required from live platform config");
  }
  if (
    !rates ||
    !Number.isFinite(rates.percent) ||
    !Number.isFinite(rates.fixed_cents)
  ) {
    throw new Error("previewFeeLines: processorFeeRates required from live platform config");
  }

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
      default_take_floor_cents: takeFloorCents,
      plan_tier_bps: {},
      processing_mode: "pass_through",
      pass_through_take_bps: takeBps,
      processor_fee_rates: { default: rates, [currency.toLowerCase()]: rates },
    },
    tenantOverride: input.tenantOverride ?? null,
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
    platformTakeBps: snap.platform_take_bps,
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
