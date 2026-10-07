import * as Sentry from "@sentry/nextjs";

import { installHistoryWriteTrace, recentHistoryWrites } from "./history-write-trace";

// Installed at module load, before Next's router effect patches history, so
// every app history write is recorded.
installHistoryWriteTrace();

/**
 * Why server actions on a talent page can hang forever.
 *
 * Next 16 patches window.history.pushState/replaceState: any call with a URL
 * dispatches ACTION_RESTORE into the router action queue. A navigation or
 * restore that arrives while a server action is pending marks that action
 * `discarded`, and a discarded action's promise is never resolved or rejected
 * (next/dist/client/components/app-router-instance.js, runAction ->
 * handleResult). So `await someAction()` called on mount never returns if
 * anything writes history while it is in flight.
 *
 * settleServerAction bounds the wait, retries, and reports the stall to
 * Sentry together with the recent history writes (with call stacks), which
 * names the component that navigated.
 */
export class ServerActionStalledError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not settle within ${ms}ms`);
    this.name = "ServerActionStalledError";
  }
}

export type SettleOptions = {
  /** Server action name, used in Sentry tags and the error message. */
  readonly label: string;
  /** Sentry `area` tag. */
  readonly area: string;
  /** How long one attempt may take before it counts as stalled. */
  readonly budgetMs?: number;
  /** Retries after the first attempt. */
  readonly retries?: number;
  /** Delay before each retry. */
  readonly retryDelayMs?: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withBudget<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ServerActionStalledError(label, ms)), ms);
  });
  return Promise.race([promise, stalled]).finally(() => clearTimeout(timer));
}

function report(error: unknown, opts: SettleOptions, attempt: number): void {
  const e = error as { name?: unknown; message?: unknown; digest?: unknown } | null;
  Sentry.captureException(error, {
    tags: { area: opts.area, action: opts.label },
    extra: {
      attempt,
      name: typeof e?.name === "string" ? e.name : null,
      message: typeof e?.message === "string" ? e.message : String(error),
      digest: typeof e?.digest === "string" ? e.digest : null,
      historyWrites: recentHistoryWrites(),
    },
  });
}

/**
 * Runs `call` with a settle budget and retries. Resolves with the action's
 * value, or rejects with the last error once every attempt failed or stalled.
 * It never hangs.
 */
export async function settleServerAction<T>(call: () => Promise<T>, opts: SettleOptions): Promise<T> {
  const budgetMs = opts.budgetMs ?? 4000;
  const retries = opts.retries ?? 1;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  let last: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await withBudget(call(), opts.label, budgetMs);
    } catch (error) {
      last = error;
      report(error, opts, attempt);
      if (attempt <= retries) await wait(retryDelayMs);
    }
  }
  throw last;
}
