import "server-only";

import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { clientAccountEnabledFor, type ClientAccountHostKind } from "@/lib/client-account/flag";
import { isMarketingHome, pageUrl } from "./catalog-render";

/**
 * Host kind a branded email lives on: the platform apex means the "app" kind,
 * any tenant's own domain means "agency". Talent-site hosts are not told apart
 * by the brand today, so a caller that knows better passes `hostKind`.
 */
export function brandHostKind(brand: EmailBrand): ClientAccountHostKind {
  return isMarketingHome(brand.homeHref) ? "app" : "agency";
}

/** `/account/visits/<id>` on the brand's host. Only for flagged hosts. */
export function clientAccountVisitUrl(brand: EmailBrand, bookingId: string): string {
  return pageUrl(brand, `/account/visits/${encodeURIComponent(bookingId)}`);
}

/**
 * The link a client email's manage button points at. Flag off (or no booking
 * id) returns `legacyPath` untouched, so output is identical to before.
 */
export function clientManageUrl(
  brand: EmailBrand,
  bookingId: string | null,
  legacyPath: string,
  hostKind: ClientAccountHostKind = brandHostKind(brand),
): string {
  if (bookingId && clientAccountEnabledFor(hostKind)) return clientAccountVisitUrl(brand, bookingId);
  return pageUrl(brand, legacyPath);
}
