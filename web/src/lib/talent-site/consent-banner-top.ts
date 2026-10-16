/**
 * TUL-528 PM-LIVE7: the open consent card publishes where its top edge sits so
 * the demo badge in `FLOATING_CHROME_STACK_CSS` can ride just above it instead
 * of hiding (the card's height varies by variant, language and width).
 */

/** Distance from the viewport bottom to the consent card's top edge, set by the card while it is open. */
export const CONSENT_BANNER_TOP_VAR = "--consent-banner-top";

/** Publishes {@link CONSENT_BANNER_TOP_VAR} while `card` is mounted; returns the cleanup. */
export function trackConsentBannerTop(card: HTMLElement): () => void {
  const root = card.ownerDocument.documentElement;
  const win = card.ownerDocument.defaultView;
  const update = () => {
    const top = card.getBoundingClientRect().top;
    if (win && top > 0) root.style.setProperty(CONSENT_BANNER_TOP_VAR, `${Math.ceil(win.innerHeight - top)}px`);
  };
  update();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
  ro?.observe(card);
  win?.addEventListener("resize", update);
  return () => {
    ro?.disconnect();
    win?.removeEventListener("resize", update);
    root.style.removeProperty(CONSENT_BANNER_TOP_VAR);
  };
}
