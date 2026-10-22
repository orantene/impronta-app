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
 * TUL-1339: the PERMANENT share id of a service's quick view, `servicio-<id8>` (first 8 hex of the
 * offering id). No title and no widget id, so a rename or a rebuilt widget never breaks a link
 * someone already shared. It is the URL fragment (`#servicio-1a2b3c4d`).
 */
export function serviceQuickViewId(o: { id: string; title?: string }): string {
  return `servicio-${o.id.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}

/**
 * TUL-1339: maps a shared fragment to a permanent share id. The exact id passes through; the first
 * #4087 format (`servicio-<title>-<id8>-<widget key>`, or `servicio-<title>-<id8>`) is matched by the
 * `<id8>` token against the share ids really on the page. Anything unmatched returns null (the page
 * simply stays put; nothing throws).
 */
export function canonicalServiceShareKey(fragment: string, knownKeys: readonly string[]): string | null {
  const f = fragment.toLowerCase();
  if (knownKeys.includes(f)) return f;
  if (!f.startsWith("servicio-")) return null;
  const tokens = new Set(f.split("-").slice(1));
  for (const key of knownKeys) {
    const id8 = key.slice("servicio-".length);
    if (id8 && tokens.has(id8)) return key;
  }
  return null;
}

/** The dialog's DOM id: the share id plus a short widget key, unique when two widgets list one service. */
export function serviceQuickViewDomId(shareId: string, nodeKey?: string | null): string {
  const key = (nodeKey ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(-8);
  return key ? `${shareId}--${key}` : shareId;
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
