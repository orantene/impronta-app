/**
 * Support Desk URL helpers — local QA vs dedicated host.
 */

import {
  isSupportDeskHost,
  normalizeHostname,
  SUPPORT_DESK_PRIMARY_HOST,
} from "@/lib/support/desk-hosts";

/** Local QA path on the app host (localhost / app.tulala.digital). */
export const SUPPORT_DESK_LOCAL_PATH = "/platform/admin/support/desk";

/** Canonical path on support.tulala.digital when the flag is on. */
export const SUPPORT_DESK_HOST_PATH = "/desk";

export function supportDeskHref(opts?: {
  ticketId?: string | null;
  view?: string | null;
  /** When true, always return the dedicated-host absolute URL. */
  absoluteHost?: boolean;
  host?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts?.ticketId) params.set("ticket", opts.ticketId);
  if (opts?.view) params.set("view", opts.view);
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  if (opts?.absoluteHost) {
    return `https://${SUPPORT_DESK_PRIMARY_HOST}${SUPPORT_DESK_HOST_PATH}${suffix}`;
  }

  const host = normalizeHostname(opts?.host ?? null);
  if (host && isSupportDeskHost(host)) {
    return `${SUPPORT_DESK_HOST_PATH}${suffix}`;
  }
  return `${SUPPORT_DESK_LOCAL_PATH}${suffix}`;
}

/**
 * HQ "Open Support Desk ↗" — new tab.
 * Dev uses same-origin `/desk` (local QA path redirects there). Prod builds
 * open the dedicated host so agents leave Platform Admin chrome.
 */
export function supportDeskOpenFromHqHref(): string {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    return SUPPORT_DESK_HOST_PATH;
  }
  return `https://${SUPPORT_DESK_PRIMARY_HOST}${SUPPORT_DESK_HOST_PATH}`;
}

/**
 * Target for retiring `/platform/admin/support` when the Desk flag is on —
 * preserves ticket/view query onto the portal entry.
 */
export function supportDeskPortalRedirectHref(opts?: {
  ticketId?: string | null;
  view?: string | null;
}): string {
  const base = supportDeskOpenFromHqHref();
  const params = new URLSearchParams();
  if (opts?.ticketId) params.set("ticket", opts.ticketId);
  if (opts?.view) params.set("view", opts.view);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * On Support Desk hosts, remap post-auth landings that 404 or miss the portal
 * (`/admin`, `/`) onto `/desk`, preserving any query string.
 * Non-desk hosts are unchanged (talent/agency `/admin` intact).
 */
export function supportDeskPostAuthDestination(
  destination: string,
  host: string | null | undefined,
): string {
  if (!isSupportDeskHost(host)) return destination;
  if (!destination.startsWith("/") || destination.startsWith("//")) {
    return destination;
  }
  const qIndex = destination.indexOf("?");
  const path = qIndex === -1 ? destination : destination.slice(0, qIndex);
  const query = qIndex === -1 ? "" : destination.slice(qIndex);
  if (path === "/" || path === "/admin" || path.startsWith("/admin/")) {
    return `${SUPPORT_DESK_HOST_PATH}${query}`;
  }
  return destination;
}
