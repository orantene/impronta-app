/**
 * TUL-954: "Ver oferta" on the signed `/c/t/<token>` page. Scrolls the newest live offer to the
 * centre of the screen and focuses its action (Accept, or the sign-in form for a guest), so the
 * tap always visibly does something. A twin of the profile chat's helper; kept here so this page
 * never imports from the locked `app/t/[profileCode]` folder.
 */

type Focusable = { scrollIntoView: (o: { behavior: "auto" | "smooth"; block: "center" }) => void; focus: () => void };
type Root = { querySelectorAll: (sel: string) => ArrayLike<Focusable> };

/** Accept button (signed-in client or a guest who may accept) or the guest sign-in panel. */
export const CLIENT_OFFER_ACTION_SELECTOR = '[data-client-action="accept_offer"], [data-client-offer-sign-in]';

export function jumpToClientOffer(root: Root | null, reducedMotion: boolean): boolean {
  if (!root) return false;
  const all = root.querySelectorAll(CLIENT_OFFER_ACTION_SELECTOR);
  if (all.length === 0) return false;
  const el = all[all.length - 1];
  el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  el.focus();
  return true;
}
