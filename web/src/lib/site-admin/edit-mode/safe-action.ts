import { improntaLog } from "@/lib/server/structured-log";
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
  /** Optional guard for action transports that stall without rejecting. */
  timeoutMs?: number;
  /**
   * Optional cancellation signal. When it aborts, `safeAction` stops AWAITING
   * the action and resolves to `fallback` immediately. The timeout path also
   * aborts (it resolves to `fallback` the same way).
   *
   * IMPORTANT — client-only cancellation. A Next.js server action runs over the
   * RSC boundary; there is no way to cancel it once the request is in flight, so
   * aborting here only abandons the CLIENT's wait. The server write may still
   * complete. Callers that depend on ordered, version-stamped writes (e.g. the
   * CAS-versioned draft-save queue) must treat an aborted await as "we stopped
   * waiting on a possibly-already-superseded write" — the next write's CAS read
   * of the live version is what makes this safe.
   */
  signal?: AbortSignal;
}

export async function safeAction<R, F>(
  invoke: () => Promise<R>,
  opts: SafeActionOptions<F>,
): Promise<R | F> {
  const label = opts.name ?? "server action";
  let action: Promise<R | F>;
  try {
    action = invoke().catch((err) => {
      if (err instanceof Error) {
        void improntaLog("site_admin_safe_action.warn", {
          message: `[safeAction] ${label} failed:`,
          err: err.message,
        });
      } else {
        void improntaLog("site_admin_safe_action.warn", {
          message: `[safeAction] ${label} failed with non-Error:`,
          error: String(err),
        });
      }
      return opts.fallback;
    });
  } catch (err) {
    if (err instanceof Error) {
      void improntaLog("site_admin_safe_action.warn", {
        message: `[safeAction] ${label} failed:`,
        err: err.message,
      });
    } else {
      void improntaLog("site_admin_safe_action.warn", {
        message: `[safeAction] ${label} failed with non-Error:`,
        error: String(err),
      });
    }
    return opts.fallback;
  }

  // Build the set of "give up waiting" racers: an optional timeout and an
  // optional caller-supplied abort signal. Each resolves the race to `fallback`
  // WITHOUT rejecting, so the caller still gets its envelope shape. The
  // underlying `action` keeps running (and is already `.catch`-guarded above),
  // so abandoning it here can never surface an unhandled rejection.
  const hasTimeout = Boolean(opts.timeoutMs && opts.timeoutMs > 0);
  const signal = opts.signal;
  const hasSignal = Boolean(signal);

  if (!hasTimeout && !hasSignal) {
    return await action;
  }

  // Fast-path: the caller passed a signal that is ALREADY aborted — don't even
  // wait a tick.
  if (signal?.aborted) {
    void improntaLog("site_admin_safe_action.warn", {
      message: `[safeAction] ${label} aborted before await (superseded)`,
    });
    return opts.fallback;
  }

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let onAbort: (() => void) | null = null;
  const racers: Array<Promise<R | F>> = [action];

  if (hasTimeout) {
    racers.push(
      new Promise<F>((resolve) => {
        timeoutId = globalThis.setTimeout(() => {
          void improntaLog("site_admin_safe_action.warn", {
            message: `[safeAction] ${label} timed out after ${opts.timeoutMs}ms`,
          });
          resolve(opts.fallback);
        }, opts.timeoutMs);
      }),
    );
  }

  if (signal) {
    racers.push(
      new Promise<F>((resolve) => {
        onAbort = () => {
          void improntaLog("site_admin_safe_action.warn", {
            message: `[safeAction] ${label} aborted (superseded by a newer call)`,
          });
          resolve(opts.fallback);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    );
  }

  try {
    return await Promise.race(racers);
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
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
