/**
 * TUL-1731 · Real cost into the workspace spend counter. `ai_usage_monthly.spend_cents` is an INTEGER, but most AI calls cost a
 * fraction of a cent (an embedding is ~0.0002 cents, a short chat ~0.05 cents). Rounding every call up to a whole cent
 * (the old flat 1 cent, or a 1 cent floor) over-counts cheap calls by 20x to 5000x; rounding down loses them. So the cost is
 * rounded STOCHASTICALLY: the whole cents always, plus one more with probability equal to the fraction. Over many calls the
 * counter is unbiased (it converges on the true spend) with no schema change, and a call that rounds to 0 still counts as a
 * REQUEST (the increment RPC adds 1 to request_count regardless).
 */
import { estimateCostUsd } from "@/lib/ai/ai-model-costs";
import { recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { logServerError } from "@/lib/server/safe-error";

export function usdToSpendCents(usd: number, rng: () => number = Math.random): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const cents = usd * 100;
  const whole = Math.floor(cents);
  return whole + (rng() < cents - whole ? 1 : 0);
}

/** Cost of one chat / vision call from the usage the provider reported. 0 when the usage is unknown. */
export function chatSpendUsd(model: string | null | undefined, usage: { inputTokens?: number | null; outputTokens?: number | null } | null | undefined): number {
  return estimateCostUsd(model, usage?.inputTokens ?? null, usage?.outputTokens ?? null);
}

/**
 * Record a measured cost against a workspace (the platform tenant when none). Never throws. A call whose cost is unknown
 * (no usage reported) falls back to `fallbackCents` so a missing usage block can never make a call free.
 */
export async function recordMeasuredAiSpend(
  tenantId: string,
  usd: number,
  fallbackCents = 1,
  record: (tenantId: string, cents: number) => Promise<void> = recordAiUsageEstimate,
): Promise<void> {
  try {
    await record(tenantId, usd > 0 ? usdToSpendCents(usd) : fallbackCents);
  } catch (err) {
    logServerError("spend-cents/record", err);
  }
}

/** Adds up the real cost of the several model calls one request makes (extraction + reply, retries, ...). */
export class AiSpendCollector {
  private usd = 0;
  private calls = 0;
  add(model: string | null | undefined, usage: { inputTokens?: number | null; outputTokens?: number | null } | null | undefined): void {
    this.usd += chatSpendUsd(model, usage);
    this.calls += 1;
  }
  /** Total measured cost; 0 when no call reported usage. */
  total(): number {
    return this.usd;
  }
  count(): number {
    return this.calls;
  }
}

/**
 * Transcription is priced per minute of audio, and the plain-text response carries no duration. The duration is ESTIMATED
 * from the upload size at a deliberately LOW bitrate (24 kbps, a browser's Opus recording), so the estimate leans
 * toward over-counting minutes, never toward free. Prices per minute: gpt-4o-mini-transcribe 0.003, whisper-1 and
 * gpt-4o-transcribe 0.006 (USD).
 */
export const TRANSCRIBE_BYTES_PER_SECOND = 3_000;
const TRANSCRIBE_USD_PER_MINUTE: ReadonlyArray<{ prefix: string; usd: number }> = [
  { prefix: "gpt-4o-mini-transcribe", usd: 0.003 },
  { prefix: "gpt-4o-transcribe", usd: 0.006 },
  { prefix: "whisper", usd: 0.006 },
];
export function transcriptionSpendUsd(model: string, audioBytes: number): number {
  const m = model.toLowerCase();
  const usdPerMinute = TRANSCRIBE_USD_PER_MINUTE.find((r) => m.startsWith(r.prefix))?.usd ?? 0.006;
  const seconds = Math.max(1, audioBytes) / TRANSCRIBE_BYTES_PER_SECOND;
  return (seconds / 60) * usdPerMinute;
}
