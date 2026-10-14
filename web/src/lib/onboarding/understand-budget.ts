/**
 * TUL-541: time budget for the onboarding "understand" step, so the reading
 * screen never sits spinning.
 *
 * Server: each model call is aborted at EXTRACTION_ATTEMPT_TIMEOUT_MS, and a
 * failed call gets at most ONE retry (the failover provider when it has a
 * key, else the same one) after EXTRACTION_RETRY_BACKOFF_MS. Worst case is
 * about 31 s, inside the client ceiling.
 *
 * Client: the whole call is capped at UNDERSTAND_CEILING_MS and the fallback
 * card load at FALLBACK_CARD_CEILING_MS; past either, the person lands on the
 * short form ("seguir sin IA") instead of the reading ring.
 */

export const EXTRACTION_ATTEMPT_TIMEOUT_MS = 15_000;
export const EXTRACTION_RETRY_BACKOFF_MS = 750;
export const UNDERSTAND_CEILING_MS = 40_000;
export const FALLBACK_CARD_CEILING_MS = 8_000;
/** When the "continue without AI" link shows on the reading screen. */
export const SKIP_AI_OFFER_MS = 8_000;

/** Error codes worth one more try; anything else is final. */
export const RETRYABLE_EXTRACTION_CODES: readonly string[] = ["api_error", "quota", "timeout", "empty_response"];

/** First attempt plus at most one retry: failover when available, else the same provider. */
export function planExtractionAttempts<C>(first: C, failover: C | null): Array<{ chat: C; attempt: "first" | "retry" | "failover" }> {
  return [{ chat: first, attempt: "first" }, failover ? { chat: failover, attempt: "failover" } : { chat: first, attempt: "retry" }];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve `run()` or `onTimeout` after `ms`, whichever comes first; a throw also yields `onTimeout`. */
export function settleWithin<T>(run: () => Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (v: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(onTimeout), ms);
    let p: Promise<T>;
    try {
      p = run();
    } catch {
      finish(onTimeout);
      return;
    }
    p.then(finish, () => finish(onTimeout));
  });
}

export type UnderstandStepOutcome<R, F> =
  | { kind: "understood"; result: R }
  | { kind: "fallback"; result: R | null; card: F }
  | { kind: "entry"; result: R | null };

/**
 * The reading step as one bounded promise: the understand call, then (when it
 * failed or stalled) the fallback card load. Always settles within
 * UNDERSTAND_CEILING_MS + FALLBACK_CARD_CEILING_MS.
 */
export async function runUnderstandStep<R extends { ok: boolean }, F extends { ok: boolean }>(deps: {
  understand: () => Promise<R>;
  loadCard: () => Promise<F>;
  ceilingMs?: number;
  cardCeilingMs?: number;
}): Promise<UnderstandStepOutcome<R, F>> {
  const result = await settleWithin<R | null>(deps.understand, deps.ceilingMs ?? UNDERSTAND_CEILING_MS, null);
  if (result?.ok) return { kind: "understood", result };
  const card = await settleWithin<F | null>(deps.loadCard, deps.cardCeilingMs ?? FALLBACK_CARD_CEILING_MS, null);
  if (card?.ok) return { kind: "fallback", result, card };
  return { kind: "entry", result };
}
