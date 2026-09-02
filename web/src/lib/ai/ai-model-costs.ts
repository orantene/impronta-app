/**
 * Per-model token pricing (USD per 1M tokens) for estimating AI spend.
 *
 * Used to turn the token counts the providers return into a dollar figure for
 * the platform-admin usage dashboard. Prices are list prices as of 2026-07 and
 * are matched by longest-prefix on the model id, so `claude-opus-4-8-2026…`
 * still resolves to the opus-4-8 row. Unknown models fall back to a conservative
 * estimate so cost is never silently zero.
 */

type Rate = { inputPerM: number; outputPerM: number };

const MODEL_RATES: ReadonlyArray<{ prefix: string; rate: Rate }> = [
  // Anthropic
  { prefix: "claude-opus-4-8", rate: { inputPerM: 5, outputPerM: 25 } },
  { prefix: "claude-opus-4-7", rate: { inputPerM: 5, outputPerM: 25 } },
  { prefix: "claude-opus-4-6", rate: { inputPerM: 5, outputPerM: 25 } },
  { prefix: "claude-opus", rate: { inputPerM: 5, outputPerM: 25 } },
  // Sonnet 5 is $2/$10 — it was recorded at $3/$15, which is the Sonnet 4.6
  // rate. Spend was overstated by 50%, so the $25 monthly cap tripped a third
  // early. The generic "claude-sonnet" fallback below stays at 4.6 pricing and
  // must remain AFTER this entry: matching is longest-prefix.
  { prefix: "claude-sonnet-5", rate: { inputPerM: 2, outputPerM: 10 } },
  { prefix: "claude-sonnet", rate: { inputPerM: 3, outputPerM: 15 } },
  { prefix: "claude-haiku", rate: { inputPerM: 1, outputPerM: 5 } },
  { prefix: "claude-fable-5", rate: { inputPerM: 10, outputPerM: 50 } },
  // OpenAI
  { prefix: "gpt-4o-mini", rate: { inputPerM: 0.15, outputPerM: 0.6 } },
  { prefix: "gpt-4o", rate: { inputPerM: 2.5, outputPerM: 10 } },
  { prefix: "gpt-4.1-mini", rate: { inputPerM: 0.4, outputPerM: 1.6 } },
  { prefix: "gpt-4.1", rate: { inputPerM: 2, outputPerM: 8 } },
];

/** Conservative fallback when the model id is unrecognized. */
const FALLBACK_RATE: Rate = { inputPerM: 3, outputPerM: 15 };

export function rateForModel(model: string | null | undefined): Rate {
  if (!model) return FALLBACK_RATE;
  const m = model.toLowerCase();
  // Longest matching prefix wins (rows are ordered specific → generic per family).
  for (const entry of MODEL_RATES) {
    if (m.startsWith(entry.prefix)) return entry.rate;
  }
  return FALLBACK_RATE;
}

/** Estimated USD cost for one call. Returns 0 when both token counts are null. */
export function estimateCostUsd(
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number {
  const rate = rateForModel(model);
  const inTok = typeof inputTokens === "number" ? inputTokens : 0;
  const outTok = typeof outputTokens === "number" ? outputTokens : 0;
  return (inTok / 1_000_000) * rate.inputPerM + (outTok / 1_000_000) * rate.outputPerM;
}
