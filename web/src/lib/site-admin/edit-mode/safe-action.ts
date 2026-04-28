/**
 * safeAction — wraps a server action call with network-error resilience.
 *
 * Why this exists: Next.js server actions are invoked over `fetch`. When the
 * dev server restarts mid-request, or the network drops, the call rejects
 * with `TypeError: Failed to fetch` from inside `fetchServerAction`. Without
 * a guard, that rejection bubbles into React's error boundary, leaves the UI
 * stuck on a "Publishing…" / "Exiting…" pending state, and surfaces the
 * Next.js dev overlay — exactly the framework-leak problem the audit called
 * out (T1-4).
 *
 * Usage:
 *   const result = await safeAction(
 *     () => publishHomepageFromEditModeAction({ ... }),
 *     { fallback: { ok: false, error: "Network error" } as const }
 *   );
 *
 * The wrapper:
 *   1. Awaits the action; on success returns its real result.
 *   2. On any rejection (network drop, server restart, abort), returns the
 *      caller's `fallback` shape so the UI can render an inline error
 *      instead of getting stuck.
 *   3. Logs the underlying error to `console.warn` for diagnostics, keyed by
 *      the action name if provided.
 *
 * It does NOT change behavior for actions that complete successfully or
 * return their own error envelope — those flow through unchanged.
 */

interface SafeActionOptions<F> {
  /** Returned in place of the action's resolved value on rejection. */
  fallback: F;
  /** Optional label used in console.warn so dev logs show which action failed. */
  name?: string;
}

export async function safeAction<R, F>(
  invoke: () => Promise<R>,
  opts: SafeActionOptions<F>,
): Promise<R | F> {
  try {
    return await invoke();
  } catch (err) {
    const label = opts.name ?? "server action";
    if (err instanceof Error) {
      console.warn(`[safeAction] ${label} failed:`, err.message);
    } else {
      console.warn(`[safeAction] ${label} failed with non-Error:`, err);
    }
    return opts.fallback;
  }
}

/**
 * Detects whether an error is the canonical "network dropped" signal from
 * Next.js's server-action transport. Useful when callers want to display a
 * different copy for network failures vs server-returned errors.
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("load failed") ||
    err.name === "AbortError" ||
    err.name === "TypeError"
  );
}
