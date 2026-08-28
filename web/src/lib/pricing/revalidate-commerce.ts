/**
 * revalidate-commerce.ts — one revalidation list for every commercial edit.
 *
 * WHY THIS EXISTS: price, feature, discount and trial edits each revalidated
 * only the admin page they were made on. The marketing surfaces that SELL those
 * prices — /pricing, /get-started and the homepage teaser — kept serving the
 * old numbers until the next deploy, so an admin who changed a price saw it
 * change in HQ and nowhere a customer looks. Four call sites, four chances to
 * forget one; now it is a single function every mutation ends with.
 *
 * Cheap by construction: these are path revalidations, not fetches. Adding a
 * surface here is a one-line change and takes effect everywhere at once.
 */

import { revalidatePath } from "next/cache";

/** The admin surface that owns the whole money model. */
export const COMMERCE_PATH = "/platform/admin/commerce";

/**
 * Public surfaces that read the catalog. `/` carries the homepage plan teaser;
 * `/get-started` prices the signup funnel; `/pricing` is the full table.
 */
const PUBLIC_PRICING_PATHS = ["/pricing", "/get-started", "/"] as const;

/**
 * Revalidate every surface that renders catalog prices, features, discounts or
 * trial copy. Call at the END of a mutation, after the write has succeeded.
 */
export function revalidateCommerceSurfaces(): void {
  revalidatePath(COMMERCE_PATH);
  for (const path of PUBLIC_PRICING_PATHS) revalidatePath(path);
}
