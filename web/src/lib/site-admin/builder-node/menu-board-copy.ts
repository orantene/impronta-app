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
): MenuBoardCopy {
  const t = createTranslator(contentLocale?.locale ?? "en");
  const out = {} as Record<keyof MenuBoardCopy, string>;
  for (const key of KEYS) {
    out[key] = t(`public.menuBoard.${key}`);
  }
  return out as MenuBoardCopy;
}
