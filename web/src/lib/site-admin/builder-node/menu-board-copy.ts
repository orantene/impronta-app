/**
 * menu-board-copy.ts — resolve the menu board island's strings server-side.
 *
 * The island is a client component inside the builder render tree, so it cannot
 * reach the request locale itself. The renderer knows the page's content locale;
 * it resolves the strings here and passes them down as a plain object.
 *
 * Hardcoding English in the island is what shipped a Spanish menu board that
 * said "Send your order" and "Sold out" to Spanish readers.
 */

import { createTranslator } from "@/i18n/messages";
import type { MenuBoardCopy } from "./menu-board-island";
import type { BuilderNodeContentLocaleOptions } from "./render";

const KEYS = [
  "decrease",
  "increase",
  "selectQuantities",
  "quoteOnRequest",
  "from",
  "soldOut",
  "onlyLeft",
  "formTitle",
  "itemsSelected",
  "itemsSelectedOne",
  "selectAtLeastOne",
  "name",
  "email",
  "phone",
  "contactRequired",
  "payInPerson",
  "sending",
  "submit",
  "sent",
  "failed",
  "soldOutError",
] as const satisfies ReadonlyArray<keyof MenuBoardCopy>;

/**
 * Build the island's copy for a page's content locale.
 *
 * `contentLocale` is optional on the render options (the editor canvas and some
 * test harnesses omit it), so an absent locale falls back to the catalog's
 * default rather than throwing — a menu board must never blank a page.
 */
export function menuBoardCopy(
  contentLocale?: BuilderNodeContentLocaleOptions,
  words?: { soldOut: string; orderSent: string; cta: string },
): MenuBoardCopy {
  const t = createTranslator(contentLocale?.locale ?? "en");
  const out = {} as Record<keyof MenuBoardCopy, string>;
  for (const key of KEYS) {
    out[key] = t(`public.menuBoard.${key}`);
  }

  // Three of these are NOUNS the operator owns, so the words engine wins over
  // the catalog: a print shop's board and a taqueria's board are the same code
  // and should not say the same words. `menu.sold_out`, `menu.order_sent` and
  // `menu.cta` carry en/es fallbacks, so an operator who never opened Words
  // still gets correct copy.
  //
  // Absent `words` (a load failure, or a render with no tenant) keeps the
  // catalog value rather than blanking the control — a board with no Order
  // button is worse than one with a generic label.
  if (words) {
    if (words.soldOut.trim()) out.soldOut = words.soldOut;
    if (words.orderSent.trim()) out.sent = words.orderSent;
    if (words.cta.trim()) out.submit = words.cta;
  }
  return out as MenuBoardCopy;
}
