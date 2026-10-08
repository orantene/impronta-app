/**
 * platform-processing-mode.ts — shared reader for
 * `engine_platform_processing_mode` (the same RPC the booking commission
 * engine and pass-through collect use).
 *
 * PURE helpers resolve take-bps / card rates from the row with the same
 * null-coalesce rules as the charge path. IO lives in {@link readPlatformProcessingMode}.
 */
import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  type ProcessingMode,
  type ProcessorFeeRates,
} from "./commission";

export type PlatformProcessingModeRow = {
  processing_mode?: string | null;
  pass_through_take_bps?: number | null;
  processor_fee_rates?: Record<string, ProcessorFeeRates> | null;
};

/** Resolved platform fee inputs for a settings / quote preview. */
export type FeePreviewPlatformConfig = {
  processingMode: ProcessingMode;
  /** pass_through take in bps — same resolution as resolveBookingCommissions. */
  takeBps: number;
  /** Platform take floor in cents (0 when the row does not carry one). */
  takeFloorCents: number;
  /** Card rates for the presentment currency. */
  processorFeeRates: ProcessorFeeRates;
};

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error?: { message?: string } | null;
  }>;
};

/**
 * Currency → rates from the live `processor_fee_rates` JSONB table.
 * Same lookup as commission-engine / passThroughCollect.
 */
export function processorFeeRatesFromTable(
  table: Record<string, ProcessorFeeRates> | null | undefined,
  currency: string,
): ProcessorFeeRates | null {
  const key = String(currency ?? "").toLowerCase();
  return table?.[key] ?? table?.default ?? null;
}

/**
 * pass_through take bps from a processing-mode row.
 * Mirrors `resolveBookingCommissions`: null/absent → {@link PASS_THROUGH_DEFAULT_TAKE_BPS}.
 * Call this only AFTER the row was loaded from the server — never invent a
 * take rate in the client without that row.
 */
export function resolvePassThroughTakeBps(
  row: Pick<PlatformProcessingModeRow, "pass_through_take_bps">,
): number {
  return typeof row.pass_through_take_bps === "number"
    ? row.pass_through_take_bps
    : PASS_THROUGH_DEFAULT_TAKE_BPS;
}

/** Build preview inputs from a live processing-mode row + presentment currency. */
export function feePreviewConfigFromProcessingModeRow(
  row: PlatformProcessingModeRow,
  currency: string,
  takeFloorCents = 0,
): FeePreviewPlatformConfig | null {
  const rates = processorFeeRatesFromTable(row.processor_fee_rates, currency);
  if (!rates) return null;
  const mode = row.processing_mode === "pass_through" ? "pass_through" : "included";
  return {
    processingMode: mode,
    takeBps: resolvePassThroughTakeBps(row),
    takeFloorCents: Number.isFinite(takeFloorCents) && takeFloorCents > 0 ? Math.round(takeFloorCents) : 0,
    processorFeeRates: rates,
  };
}

/** Read `engine_platform_processing_mode`. Returns null on RPC error / empty. */
export async function readPlatformProcessingMode(
  admin: RpcClient,
): Promise<PlatformProcessingModeRow | null> {
  const modeRes = await admin.rpc("engine_platform_processing_mode");
  if (modeRes.error) return null;
  return (modeRes.data as PlatformProcessingModeRow | null) ?? null;
}
