/**
 * Where one service card goes when a guest taps it (TUL-1272 #3, #9).
 *
 * Every card is a REAL link: crawlers and no-JS visitors follow the href, and
 * the href never carries a query string (no indexable parameter URLs). A quick
 * view lives at `#<quickViewId>` on the page holding the widget: the fragment
 * opens the popup (share link), and the facts are already in that page's HTML.
 *
 * Pure: no DB, no React, so the widget, the business site and tests share it.
 */
import { serviceSlug } from "@/lib/talent-site/service-page";
import type { PresentationMode } from "./types";

/** The widget's "Al tocar" setting. `auto` = "Según cada servicio". */
export const SERVICE_TAP_ACTIONS = ["auto", "page", "quick_view", "book"] as const;
export type ServiceTapAction = (typeof SERVICE_TAP_ACTIONS)[number];

export function isServiceTapAction(value: unknown): value is ServiceTapAction {
  return typeof value === "string" && (SERVICE_TAP_ACTIONS as readonly string[]).includes(value);
}

export type ServiceCardOpens = "page" | "quick_view" | "book";

export type ServiceCardTarget = {
  href: string;
  opens: ServiceCardOpens;
  /** The quick view this card needs on the page (also the fragment id), else null. */
  quickViewId: string | null;
};

/**
 * Stable fragment id of a service's quick view: the `servicio-<title>-<id8>` slug its page
 * uses, plus a short key of the widget node so two services widgets on one page never share
 * a dialog id.
 */
export function serviceQuickViewId(o: { id: string; title: string }, nodeKey?: string | null): string {
  const key = (nodeKey ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  return key ? `${serviceSlug(o)}-${key}` : serviceSlug(o);
}

/** The widget setting forces one mode; `auto` keeps the service's resolved mode. */
export function wantedModeForTap(tap: ServiceTapAction, resolved: PresentationMode): PresentationMode {
  if (tap === "page") return "own_page";
  if (tap === "quick_view") return "quick_view";
  if (tap === "book") return "book_direct";
  return resolved;
}

export function serviceCardTarget(input: {
  mode: PresentationMode;
  /** The plan allows own pages (presentation entitlements). */
  pageAllowed: boolean;
  /** The service's page URL on this site, or null where none exists (builder, preview). */
  pageHref: string | null;
  quickViewId: string;
}): ServiceCardTarget {
  const page = input.pageAllowed && input.pageHref ? input.pageHref : null;
  const quick: ServiceCardTarget = {
    // Same-page fragment: valid on whatever page holds the widget (home, /servicios, ...).
    href: `#${input.quickViewId}`,
    opens: "quick_view",
    quickViewId: input.quickViewId,
  };
  if (input.mode === "own_page") return page ? { href: page, opens: "page", quickViewId: null } : quick;
  if (input.mode === "book_direct") {
    return page ? { href: page, opens: "book", quickViewId: null } : { ...quick, opens: "book" };
  }
  return quick;
}
