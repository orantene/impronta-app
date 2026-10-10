/**
 * Public booking entry aliases on a talent host.
 *
 * Guests type `/agendar` (ES) or `/book` (EN). Those must open the booking
 * sheet on the home page (`#book`), never 404 as missing page slugs.
 */

import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";
import { talentSiteLocalePath } from "@/lib/talent-site/talent-site-locale-routing";

/** Single-segment aliases (locale-stripped). Reserved so they are never pages. */
export const TALENT_BOOKING_ALIAS_SLUGS = ["agendar", "book"] as const;

export function isTalentBookingAliasPath(pathname: string): boolean {
  return pathname === "/agendar" || pathname === "/book";
}

/**
 * Locale-aware home + booking hash, e.g. `/#book` or `/en#book`.
 * Pure; the proxy redirects here with a 302.
 */
export function talentBookingSheetRedirectPath(
  locale: string,
  primary: string,
  supported: readonly string[],
): string {
  const home = talentSiteLocalePath("/", locale, primary, supported);
  return `${home}${TALENT_BOOK_HREF}`;
}
