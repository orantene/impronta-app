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

/**
 * Sets `desired` now and again after every <head> change that resets it
 * (Next swaps the <title> node or its text). Our own write fires the observer
 * once more and is then a no-op, so it cannot loop. Returns the cleanup.
 */
export function watchDocumentTitle(
  doc: TitleDocument,
  desired: string,
  createObserver: TitleObserverFactory | null,
): () => void {
  let active = true;
  const reassert = () => {
    if (active && shouldReassertTitle(doc.title, desired)) doc.title = desired;
  };
  reassert();
  if (!createObserver || !doc.head) {
    return () => {
      active = false;
    };
  }
  const observer = createObserver(reassert);
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  return () => {
    active = false;
    observer.disconnect();
  };
}
