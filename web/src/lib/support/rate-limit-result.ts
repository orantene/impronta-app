/**
 * Pure mapping from the shared KV limiter verdict to the support action
 * failure shape. Kept out of the "use server" actions file so it can be unit
 * tested and so the panel can import the type without pulling server code.
 */
export type SupportActionFail = {
  ok: false;
  error: string;
  /** Machine code so the panel can tell "slow down" apart from "failed". */
  code?: "rate_limited";
  /** Whole seconds until the limiter window frees a slot (rate_limited only). */
  retryAfterSec?: number;
};

export async function rateLimited(
  check: Promise<{ ok: true } | { ok: false; code: string; retryAfterMs: number }>,
): Promise<SupportActionFail | null> {
  const r = await check;
  if (r.ok) return null;
  return {
    ok: false,
    error: "Too many requests. Try again shortly.",
    code: "rate_limited",
    retryAfterSec: Math.max(1, Math.ceil(r.retryAfterMs / 1000)),
  };
}
