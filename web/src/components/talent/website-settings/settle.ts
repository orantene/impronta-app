/**
 * Always-settling wrapper for a save call. A server action can reject, or
 * (network down) never settle at all; either way the caller gets
 * `{ ok: false }` so the screen reaches "Couldn't save" + Retry.
 * A late success after the timeout is ignored here; saves write absolute
 * values, so Retry is idempotent.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; reason: "timeout" | "error" };

export const SAVE_TIMEOUT_MS = 20_000;

export function settle<T>(work: () => Promise<T>, timeoutMs = SAVE_TIMEOUT_MS): Promise<Settled<T>> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: Settled<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    let p: Promise<T>;
    try {
      p = work();
    } catch {
      finish({ ok: false, reason: "error" });
      return;
    }
    p.then(
      (value) => finish({ ok: true, value }),
      () => finish({ ok: false, reason: "error" }),
    );
  });
}
