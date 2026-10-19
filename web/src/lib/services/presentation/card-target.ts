/**
 * Where one service card goes when a guest taps it (TUL-1272 #3, #9).
 *
 * Every card is a REAL link: crawlers and no-JS visitors follow the href, and
 * the href never carries a query string (no indexable parameter URLs). A quick
 * view lives at `<list>#<quickViewId>`: the fragment opens the popup (share
 * link), and the facts are already in the list page's HTML.
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

/** Stable fragment id of a service's quick view: the same `servicio-<title>-<id8>` slug its page uses. */
export function serviceQuickViewId(o: { id: string; title: string }): string {
  return serviceSlug(o);
}

/** The widget setting forces one mode; `auto` keeps the service's resolved mode. */
export function wantedModeForTap(tap: ServiceTapAction, resolved: PresentationMode): PresentationMode {
  if (tap === "page") return "own_page";
  if (tap === "quick_view") return "quick_view";
  if (tap === "book") return "book_direct";
  return resolved;
}

function listFragmentHref(listPath: string, id: string): string {
  const base = listPath.replace(/\/+$/, "");
  return base ? `${base}#${id}` : `/#${id}`;
}

export function serviceCardTarget(input: {
  mode: PresentationMode;
  /** The plan allows own pages (presentation entitlements). */
  pageAllowed: boolean;
  /** The service's page URL on this site, or null where none exists (builder, preview). */
  pageHref: string | null;
  /** Locale path of the page holding the list ("" / "/" / "/en"). */
  listPath: string;
  quickViewId: string;
}): ServiceCardTarget {
  const page = input.pageAllowed && input.pageHref ? input.pageHref : null;
  const quick: ServiceCardTarget = {
    href: listFragmentHref(input.listPath, input.quickViewId),
    opens: "quick_view",
    quickViewId: input.quickViewId,
  };
  if (input.mode === "own_page") return page ? { href: page, opens: "page", quickViewId: null } : quick;
  if (input.mode === "book_direct") {
    return page ? { href: page, opens: "book", quickViewId: null } : { ...quick, opens: "book" };
  }
  return quick;
}
