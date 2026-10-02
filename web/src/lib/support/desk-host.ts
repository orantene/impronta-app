import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_PREFIXES,
  COMPLIANCE_PREFIXES,
  PWA_PATHS,
  SHARED_API_PREFIXES,
  STATIC_PATHS,
  SUPPORT_DESK_API_PREFIXES,
  SUPPORT_DESK_PAGE_PREFIXES,
  WELL_KNOWN_PREFIX,
} from "@/lib/saas/path-groups";
import { anyExact, anyPrefix, hasPrefix } from "@/lib/saas/path-utils";

import { isSupportDeskEnabled, type DeskFlagEnv } from "./desk-flag";
import {
  isHostScopedAuthHost,
  isSupportDeskHost,
  normalizeHostname,
  SUPPORT_DESK_HOSTNAMES,
} from "./desk-hosts";

export {
  isHostScopedAuthHost,
  isSupportDeskHost,
  normalizeHostname,
  SUPPORT_DESK_HOSTNAMES,
};

/**
 * Paths permitted on the support host when the flag is ON. Deliberately
 * narrower than a full `kind=app` surface so flipping the flag does not
 * expose Platform Admin / workspace dashboards on support.tulala.digital.
 *
 * `pathname` must be locale-stripped (same contract as isPathAllowedForHostKind).
 */
export function isPathAllowedOnSupportDeskHost(pathname: string): boolean {
  if (pathname === "/") return true;
  if (anyExact(pathname, STATIC_PATHS)) return true;
  if (anyExact(pathname, PWA_PATHS)) return true;
  if (hasPrefix(pathname, WELL_KNOWN_PREFIX)) return true;
  if (anyPrefix(pathname, SHARED_API_PREFIXES)) return true;
  if (anyPrefix(pathname, COMPLIANCE_PREFIXES)) return true;
  if (anyPrefix(pathname, AUTH_PREFIXES)) return true;
  if (anyPrefix(pathname, SUPPORT_DESK_PAGE_PREFIXES)) return true;
  if (anyPrefix(pathname, SUPPORT_DESK_API_PREFIXES)) return true;
  return false;
}

/**
 * When the request Host is a Support Desk hostname and the flag is off,
 * return a branded 404 rewrite. Otherwise null (caller continues).
 *
 * Uses `/_page-not-found` (not `/_host-unregistered`): the domain may be
 * seeded; the surface is intentionally dead while the flag is off.
 */
export function supportDeskHostDeadResponse(
  request: NextRequest,
  host: string | null | undefined = request.headers.get("host"),
  env: DeskFlagEnv = typeof process !== "undefined" ? process.env : {},
): NextResponse | null {
  if (!isSupportDeskHost(host)) return null;
  if (isSupportDeskEnabled(env)) return null;
  return NextResponse.rewrite(new URL("/_page-not-found", request.url), {
    status: 404,
  });
}

/**
 * When on a Support Desk host with the flag ON, reject paths outside the
 * desk surface. Returns null when the host is not a desk host or the path
 * is allowed.
 */
export function supportDeskHostSurfaceResponse(
  request: NextRequest,
  pathname: string,
  host: string | null | undefined = request.headers.get("host"),
): NextResponse | null {
  if (!isSupportDeskHost(host)) return null;
  if (isPathAllowedOnSupportDeskHost(pathname)) return null;
  return NextResponse.rewrite(new URL("/_page-not-found", request.url), {
    status: 404,
  });
}
