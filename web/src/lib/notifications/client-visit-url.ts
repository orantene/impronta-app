import "server-only";

import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { clientAccountEnabledFor, type ClientAccountHostKind } from "@/lib/client-account/flag";
import { publicThreadPath, signThreadToken } from "@/lib/messaging/thread-token";
import { SAVE_BOOKINGS_HREF } from "@/lib/client-account/save-bookings";
import { appPageUrl, isMarketingHome, pageUrl } from "./catalog-render";

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
 * What the sender knows about the conversation behind a booking. `/account/visits`
 * keys on the INQUIRY id, and a signed thread link (`/c/t/<token>`) is the one
 * page a guest with no account can open from an email.
 */
export type ClientManageContext = { inquiryId?: string | null; tenantId?: string | null };

/**
 * The link a client email's manage button points at (TUL-G5).
 *
 * - Flag on: `/account/visits/<id>`, with the INQUIRY id when known (the loader
 *   keys on `inquiries.id`; it also resolves a booking id as a safety net).
 *   The marketing apex does not serve `/account`, so `pageUrl` sends it to the app host.
 * - Flag off: the legacy `/client/bookings/<id>` needs a login and a claimed
 *   booking, which a guest has neither of. When the conversation is known the
 *   link is the signed thread page instead, which opens with no account. With
 *   no conversation the legacy path is returned untouched.
 */
export function clientManageUrl(
  brand: EmailBrand,
  bookingId: string | null,
  legacyPath: string,
  hostKind: ClientAccountHostKind = brandHostKind(brand),
  ctx: ClientManageContext = {},
): string {
  if (bookingId && clientAccountEnabledFor(hostKind)) {
    return clientAccountVisitUrl(brand, ctx.inquiryId || bookingId);
  }
  if (ctx.inquiryId && ctx.tenantId) {
    const token = signThreadToken(ctx.inquiryId, ctx.tenantId);
    if (token) return pageUrl(brand, publicThreadPath(token));
  }
  return pageUrl(brand, legacyPath);
}

/**
 * The "your offer is ready" email's button (TUL-954). A guest has no account, so the old
 * `/client/inquiries/<id>?tab=offer` link sent them to a sign-in wall. When the conversation is
 * known the link is the signed thread page with `?focus=offer`, which opens with no account and
 * scrolls to the offer; otherwise the legacy path is returned untouched.
 */
export function clientOfferUrl(brand: EmailBrand, legacyPath: string, ctx: ClientManageContext = {}): string {
  if (ctx.inquiryId && ctx.tenantId) {
    const token = signThreadToken(ctx.inquiryId, ctx.tenantId);
    if (token) return `${pageUrl(brand, publicThreadPath(token))}?focus=offer`;
  }
  return pageUrl(brand, legacyPath);
}

/**
 * "Save your bookings" link for a guest's email footer: the existing client
 * sign-in, back to `/account`. The marketing apex sends the guest to the app host.
 */
export function guestSaveBookingsUrl(brand: EmailBrand): string {
  return isMarketingHome(brand.homeHref) ? appPageUrl(SAVE_BOOKINGS_HREF) : pageUrl(brand, SAVE_BOOKINGS_HREF);
}
