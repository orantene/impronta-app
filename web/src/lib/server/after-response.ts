import { after } from "next/server";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Run a side effect that MUST complete (notification, email, usage metering)
 * after the response is flushed, without slowing the response down (TUL-641).
 *
 * A bare `void someAsync()` is a floating promise: on a serverless instance the
 * function may freeze once the response is sent, and the work dies with it, so
 * an email or notification silently never goes out. `after()` keeps the
 * invocation alive for the work. Outside a request scope (scripts, tests)
 * `after()` throws, so we fall back to running it inline, detached but logged,
 * which matches `support-engine-emit.ts` and `q/[code]/route.ts`.
 *
 * Genuinely optional work (analytics) may stay detached; see the allow-list in
 * `no-detached-dispatch.static.test.ts`.
 */
export function afterResponse(work: () => unknown, label = "afterResponse"): void {
  const run = async () => {
    try {
      await work();
    } catch (err) {
      logServerError(label, err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
