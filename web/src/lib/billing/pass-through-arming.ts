/**
 * TUL-1366: is the customer-only Tulala service fee ON for this read, and with
 * what platform rate? ONE decision shared by the commission engine, the
 * checkout collect and the offer-time freeze, and it FAILS CLOSED.
 *
 *   off          the kill switch (COMMISSION_PROCESSING_PASS_THROUGH="0"), no
 *                settings row, or the row says 'included'. The legacy model.
 *   on           the row says 'pass_through' AND either the legacy explicit arm
 *                (env "1", how production runs today) or the held migration is
 *                applied (the row carries `plan_service_fee_bps`). Before the
 *                migration an unarmed environment stays OFF: nothing flips by
 *                shipping code.
 *   unavailable  we cannot tell, or it is on but the platform rate is missing /
 *                invalid. The caller REFUSES the checkout with a retry message.
 *                There is no 150 fallback: a missing rate is never a silent 0
 *                and never an invented 1.5%.
 */
import { MAX_SERVICE_FEE_BPS } from "./pass-through-rate";
import type { PlatformProcessingModeRow } from "./platform-processing-mode";

export class FeeUnavailableError extends Error {
  constructor(public readonly detail: string) {
    super(`service fee unavailable: ${detail}`);
    this.name = "FeeUnavailableError";
  }
}

/** Plain, retryable message for a refused checkout (EN; the storefront maps the code to ES/EN). */
export const FEE_UNAVAILABLE_MESSAGE = "We could not confirm the service fee just now. Nothing was charged. Try again.";

export type PassThroughDecision =
  | { mode: "off" }
  | { mode: "unavailable"; detail: string }
  | { mode: "on"; row: PlatformProcessingModeRow; platformBps: number; planFeeBps: Record<string, number> | null };

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
};

export function decideFromRow(row: PlatformProcessingModeRow | null, env: Record<string, string | undefined>): PassThroughDecision {
  if (env.COMMISSION_PROCESSING_PASS_THROUGH === "0") return { mode: "off" };
  if (!row) return { mode: "off" };
  if (row.processing_mode !== "pass_through") return { mode: "off" };
  const migrated = row.plan_service_fee_bps !== undefined && row.plan_service_fee_bps !== null && typeof row.plan_service_fee_bps === "object";
  if (env.COMMISSION_PROCESSING_PASS_THROUGH !== "1" && !migrated) return { mode: "off" };
  const bps = row.pass_through_take_bps;
  if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > MAX_SERVICE_FEE_BPS) {
    return { mode: "unavailable", detail: "platform_rate_missing" };
  }
  return { mode: "on", row, platformBps: bps, planFeeBps: migrated ? (row.plan_service_fee_bps as Record<string, number>) : null };
}

export async function decidePassThrough(
  admin: Rpc,
  env: Record<string, string | undefined> = process.env,
): Promise<PassThroughDecision> {
  if (env.COMMISSION_PROCESSING_PASS_THROUGH === "0") return { mode: "off" };
  try {
    const res = await admin.rpc("engine_platform_processing_mode");
    if (res.error) return { mode: "unavailable", detail: "mode_read_failed" };
    return decideFromRow((res.data as PlatformProcessingModeRow | null) ?? null, env);
  } catch {
    return { mode: "unavailable", detail: "mode_read_threw" };
  }
}
