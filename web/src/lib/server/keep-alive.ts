import { after } from "next/server";

/**
 * Keep a detached (already started) promise alive past the response flush.
 *
 * A bare `void somePromise` can be dropped when a serverless instance freezes
 * right after the response (TUL-641). `after()` registers the promise with the
 * platform's waitUntil so the invocation stays open until it settles. Outside a
 * request scope (crons, scripts, unit tests) `after()` throws; the promise is
 * already running, so we simply let it finish on its own.
 *
 * Rejections are swallowed here: callers own their own error logging.
 */
export function keepAlive(work: Promise<unknown>): void {
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  try {
    after(() => settled);
  } catch {
    // No request scope: the work continues detached, as before.
  }
}
