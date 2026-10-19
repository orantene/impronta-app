/**
 * TUL-1274: keep the dashboard tab title after an RSC refresh.
 *
 * A refresh of the tree (router.refresh, a revalidating server action) makes
 * Next re-apply the layout's metadata <title> ("Tulala · Vende lo que
 * haces…"). TabTitleBridge only wrote document.title when its own deps
 * changed, so the generic title stuck. This guard watches <head> and writes
 * the wanted title back whenever it drifts. Pure and DOM-free so it is tested
 * with a fake document.
 */

/** Re-assert only a non-empty wanted title that the document no longer shows. */
export function shouldReassertTitle(current: string, desired: string): boolean {
  return desired !== "" && current !== desired;
}

export type TitleDocument = { title: string; head: unknown };

export type TitleObserver = {
  observe: (target: unknown, options: { childList: boolean; subtree: boolean; characterData: boolean }) => void;
  disconnect: () => void;
};

export type TitleObserverFactory = (onChange: () => void) => TitleObserver;

/** The browser's MutationObserver as a TitleObserverFactory, or null when absent. */
export function browserTitleObserverFactory(): TitleObserverFactory | null {
  if (typeof MutationObserver === "undefined") return null;
  return (onChange) => {
    const observer = new MutationObserver(() => onChange());
    return {
      observe: (target, options) => observer.observe(target as Node, options),
      disconnect: () => observer.disconnect(),
    };
  };
}

/** At most this many re-asserts per wanted title: a fight with another writer stops, never spins. */
export const TITLE_REASSERT_BUDGET = 20;

export type TitleScheduler = (run: () => void) => () => void;

/** Macrotask scheduler: a re-assert never runs inside the observer's microtask. */
export const timeoutTitleScheduler: TitleScheduler = (run) => {
  const id = setTimeout(run, 0);
  return () => clearTimeout(id);
};

/**
 * Sets `desired` now and again after <head> changes that reset it (Next swaps
 * the <title> node or its text). Loop-proof by construction: the re-assert is
 * deferred to a macrotask (so the page always gets to paint and run its own
 * work between writes), coalesced (one pending at a time) and capped at
 * TITLE_REASSERT_BUDGET writes (a browser that normalizes the title, or
 * another writer that keeps resetting it, ends the guard instead of looping).
 * Our own write fires the observer once more and is then a no-op. Returns the
 * cleanup.
 */
export function watchDocumentTitle(
  doc: TitleDocument,
  desired: string,
  createObserver: TitleObserverFactory | null,
  schedule: TitleScheduler = timeoutTitleScheduler,
): () => void {
  let active = true;
  let budget = TITLE_REASSERT_BUDGET;
  let cancelPending: (() => void) | null = null;
  if (shouldReassertTitle(doc.title, desired)) doc.title = desired;
  if (!createObserver || !doc.head) {
    return () => {
      active = false;
    };
  }
  const observer = createObserver(() => {
    if (!active || cancelPending) return;
    cancelPending = schedule(() => {
      cancelPending = null;
      if (!active || !shouldReassertTitle(doc.title, desired)) return;
      if (budget <= 0) {
        active = false;
        observer.disconnect();
        return;
      }
      budget -= 1;
      doc.title = desired;
    });
  });
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  return () => {
    active = false;
    cancelPending?.();
    cancelPending = null;
    observer.disconnect();
  };
}
