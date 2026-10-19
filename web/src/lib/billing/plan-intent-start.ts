/**
 * plan-intent-start.ts (BILL-B follow-up, TUL-831): how /talent/plan runs the
 * upgrade action for a `?plan=&interval=` intent without getting stuck.
 *
 * On localhost a downgrade intent sat on Settings with no confirm and no
 * drawer: the one action the page fires was aborted or never answered (a
 * shell refresh mid-flight: ERR_ABORTED POST + aborted `?_rsc` GET), and the
 * opener's one-shot ref guard had already fired, so nothing ever retried.
 *
 * This module is the fix, pure so it is unit tested:
 *  - `startWithRetry`: an attempt that rejects, or does not answer within
 *    `timeoutMs`, gets ONE more attempt (the earlier one may still answer;
 *    the first answer wins). Only when every attempt failed does it reject,
 *    so the caller falls back to the plan drawer instead of hanging.
 *  - `sharedPlanIntentStart`: one in-flight run per intent key, so a remounted
 *    opener (shell refresh) joins the run already in flight instead of firing
 *    a second action; the entry is dropped once it settles.
 *
 * Routing only. A repeated `startTalentUpgrade` creates at most another
 * unused Checkout or billing-portal session; it charges nothing and changes no
 * plan (the change happens only on the confirm's explicit button).
 */

export type TimerApi = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const PLAN_INTENT_TIMEOUT_MS = 12_000;
export const PLAN_INTENT_MAX_ATTEMPTS = 2;

export class PlanIntentStartError extends Error {
  constructor(public readonly reason: "rejected" | "timeout") {
    super(`plan intent start failed: ${reason}`);
  }
}

export function startWithRetry<R>(
  start: () => Promise<R>,
  opts: { timeoutMs?: number; maxAttempts?: number; timers?: TimerApi } = {},
): Promise<R> {
  const timeoutMs = opts.timeoutMs ?? PLAN_INTENT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? PLAN_INTENT_MAX_ATTEMPTS);
  const timers = opts.timers ?? realTimers;
  return new Promise<R>((resolve, reject) => {
    let settled = false;
    let launched = 0;
    let failed = 0;
    let lastReason: "rejected" | "timeout" = "rejected";
    const handles: unknown[] = [];
    const finish = () => {
      settled = true;
      for (const h of handles) timers.clear(h);
    };
    const onAttemptFailed = (reason: "rejected" | "timeout") => {
      if (settled) return;
      failed += 1;
      lastReason = reason;
      if (launched < maxAttempts) launch();
      else if (failed >= launched) {
        finish();
        reject(new PlanIntentStartError(lastReason));
      }
    };
    const launch = () => {
      launched += 1;
      let done = false;
      handles.push(
        timers.set(() => {
          if (done) return;
          done = true;
          onAttemptFailed("timeout");
        }, timeoutMs),
      );
      let p: Promise<R>;
      try {
        p = start();
      } catch {
        p = Promise.reject(new Error("start threw"));
      }
      p.then(
        (value) => {
          if (settled) return;
          // A late answer from an attempt that already timed out still wins:
          // it is a real answer, and the retry may be stuck the same way.
          done = true;
          finish();
          resolve(value);
        },
        () => {
          if (done) return;
          done = true;
          onAttemptFailed("rejected");
        },
      );
    };
    launch();
  });
}

const inFlight = new Map<string, Promise<unknown>>();

/** One in-flight run per intent key; the entry is removed when it settles. */
export function sharedPlanIntentStart<R>(
  key: string,
  start: () => Promise<R>,
  opts?: { timeoutMs?: number; maxAttempts?: number; timers?: TimerApi },
): Promise<R> {
  const existing = inFlight.get(key) as Promise<R> | undefined;
  if (existing) return existing;
  const run = startWithRetry(start, opts);
  inFlight.set(key, run);
  const clear = () => {
    if (inFlight.get(key) === run) inFlight.delete(key);
  };
  run.then(clear, clear);
  return run;
}

/** Test seam: forget every in-flight run. */
export function resetPlanIntentStarts(): void {
  inFlight.clear();
}

export function planIntentRunKey(tenantSlug: string, plan: string, interval: string): string {
  return `${tenantSlug}:${plan}:${interval}`;
}
