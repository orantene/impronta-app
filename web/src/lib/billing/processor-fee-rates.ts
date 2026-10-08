import type { ProcessorFeeRates } from "./commission";

/**
 * Canonical processor fee table — shared by charge path + client preview.
 * Mirrors SQL default on platform_commission_config.processor_fee_rates.
 */
export const DEFAULT_PROCESSOR_FEE_RATES: Readonly<Record<string, ProcessorFeeRates>> = {
  default: { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 },
  mxn: { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 },
};

export function processorFeeRatesForCurrency(currency: string): ProcessorFeeRates {
  const key = (currency ?? "").trim().toLowerCase();
  return DEFAULT_PROCESSOR_FEE_RATES[key] ?? DEFAULT_PROCESSOR_FEE_RATES.default;
}
