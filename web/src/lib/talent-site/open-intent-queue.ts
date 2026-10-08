/**
 * Ready handshake for opening the guest entry from a link (TUL-246). PURE: the
 * DOM is injected, so the whole contract is unit-testable.
 *
 * `<site>#book` can be followed before the thing it opens has mounted: the
 * contact bridge, the guest dock and the catalog booking sheet are separate
 * trees that hydrate in no fixed order. Instead of repeating the event on a
 * timer, the bridge queues an open INTENT here; each target announces itself
 * (`announceReady`) once its listener is attached, and the queue hands over the
 * intent that targets it. Exactly once.
 *
 * Bounded fallback: if the target has not announced within `fallbackMs`, the
 * intent is dispatched anyway (a sheet intent degrades to the guest chat, which
 * is what a visitor on a page without a booking sheet should get) and is then
 * considered delivered, so a very late mount never re-opens a surface the
 * visitor has long since dismissed.
 */

export type OpenChannel = "chat" | "sheet";

export type OpenIntent =
  | { channel: "chat" }
  | { channel: "sheet"; eventName: string; detail: unknown };

export const OPEN_INTENT_FALLBACK_MS = 4000;

type Timer = ReturnType<typeof setTimeout>;

export function createOpenIntentQueue(opts: {
  dispatch: (intent: OpenIntent) => void;
  fallbackMs?: number;
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (t: Timer) => void;
}) {
  const fallbackMs = opts.fallbackMs ?? OPEN_INTENT_FALLBACK_MS;
  const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((t) => clearTimeout(t));
  const ready = new Set<OpenChannel>();
  let queued: OpenIntent | null = null;
  let timer: Timer | null = null;

  const take = (): OpenIntent | null => {
    const intent = queued;
    queued = null;
    if (timer !== null) {
      clearT(timer);
      timer = null;
    }
    return intent;
  };

  return {
    /** Open now when the target is up; otherwise queue (latest intent wins). */
    request(intent: OpenIntent): void {
      if (ready.has(intent.channel)) {
        take();
        opts.dispatch(intent);
        return;
      }
      queued = intent;
      if (timer !== null) clearT(timer);
      timer = setT(() => {
        const late = take();
        if (!late) return;
        opts.dispatch(late.channel === "sheet" ? { channel: "chat" } : late);
      }, fallbackMs);
    },
    /** A target attached its listener. Returns the cleanup that marks it gone. */
    announceReady(channel: OpenChannel): () => void {
      ready.add(channel);
      if (queued && queued.channel === channel) {
        const intent = take();
        if (intent) opts.dispatch(intent);
      }
      return () => {
        ready.delete(channel);
      };
    },
    /** Test seam: is an intent waiting? */
    hasQueued(): boolean {
      return queued !== null;
    },
  };
}
