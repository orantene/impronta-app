/**
 * TUL-1170: a bell deep link into a talent inbox thread must leave keyboard and
 * screen-reader focus IN the thread, not on the whole Messages panel. The thread
 * loads after the page mounts, so watch the region until its heading exists,
 * focus it once, tell the opening announcement to clear, and stop.
 */

export const THREAD_OPENED_EVENT = "tulala:thread-opened";

// Legacy shell thread heading first, then the Messages v5 thread pane.
const HEADING_SELECTOR = '[data-tulala-header-meta] h1, section[data-thread]:not([data-thread="none"])';
const GIVE_UP_MS = 10000;

/** Returns a cleanup function. Safe to call with a null region. */
export function focusThreadHeadingWhenReady(region: HTMLElement | null): () => void {
  if (!region || typeof window === "undefined") return () => undefined;
  let done = false;
  let observer: MutationObserver | null = null;
  let giveUp: number | null = null;

  const finish = () => {
    done = true;
    observer?.disconnect();
    if (giveUp !== null) window.clearTimeout(giveUp);
  };

  const tryFocus = (): boolean => {
    const heading = region.querySelector<HTMLElement>(HEADING_SELECTOR);
    if (!heading) return false;
    // Do not steal focus if the person already moved it somewhere inside the page.
    const active = document.activeElement;
    const untouched = !active || active === document.body || active === region;
    if (untouched) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.dispatchEvent(new Event(THREAD_OPENED_EVENT));
    return true;
  };

  if (tryFocus()) return () => undefined;
  observer = new MutationObserver(() => {
    if (!done && tryFocus()) finish();
  });
  observer.observe(region, { childList: true, subtree: true });
  giveUp = window.setTimeout(finish, GIVE_UP_MS);
  return finish;
}
