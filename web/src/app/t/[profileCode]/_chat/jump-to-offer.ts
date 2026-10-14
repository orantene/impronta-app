/**
 * TUL-280: "Ver oferta" in the status strip. Scrolls the newest offer card to
 * the centre and focuses its action (Accept / Sign in to accept) so the tap
 * always visibly does something, even when the card was already on screen.
 */

type Focusable = { focus: () => void };
type Anchor = {
  scrollIntoView: (o: { behavior: "auto" | "smooth"; block: "center" }) => void;
  focus: () => void;
  querySelector: (sel: string) => Focusable | null;
};
type Root = { querySelectorAll: (sel: string) => ArrayLike<Anchor> };

export const OFFER_ANCHOR_SELECTOR = "[data-guest-offer-anchor]";

export function jumpToOfferAnchor(root: Root | null, reducedMotion: boolean): boolean {
  if (!root) return false;
  const all = root.querySelectorAll(OFFER_ANCHOR_SELECTOR);
  if (all.length === 0) return false;
  const el = all[all.length - 1];
  el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  const action = el.querySelector("button, a[href]");
  (action ?? el).focus();
  return true;
}
