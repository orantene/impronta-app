/**
 * Middleware adapter for the clean-public-URL grammar.
 *
 * `clean-urls.ts` stays a pure string function so it can be unit-tested
 * without a request; this file is the thin layer that turns its answer into a
 * `NextResponse`. It also exists because `proxy.ts` sits under a hard 800-line
 * cap and every routing concern that can be lifted out of it, should be.
 */

import { NextResponse, type NextRequest } from "next/server";

import { syncLocaleCookieForPath } from "@/i18n/locale-middleware";
import type { LanguageSettings } from "@/lib/language-settings/types";
import {
  resolveCleanUrlRewriteTarget,
  resolveLegacyCmsRedirectPath,
} from "@/lib/cms/clean-urls";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

/** Everything the platform itself answers to on a tenant surface. */
const agencyPathAllowed = (path: string) => isPathAllowedForHostKind("agency", path);

/**
 * The internal `/p/<slug>` target for a clean tenant URL, or `null`.
 * `canonicalPath` must already be locale- and tenant-prefix-stripped.
 */
export function resolveCleanUrlRewrite(
  hostKind: string,
  canonicalPath: string,
): string | null {
  return resolveCleanUrlRewriteTarget({
    hostKind,
    canonicalPath,
    isPathAllowed: agencyPathAllowed,
  });
}

/**
 * Collapse a tenant-authored redirect DESTINATION onto the clean form.
 *
 * Without this, an operator rule of `/about → /p/about` (a perfectly sensible
 * thing to have written while `/p/` was the real URL) becomes an infinite
 * loop the moment `/p/about` starts 301ing back to `/about`. Normalising at
 * read time fixes the rows already in the table, not just new ones.
 *
 * Anything that is not a legacy CMS path is returned untouched.
 */
export function normalizeCleanRedirectDestination(
  newPath: string,
  publicLocales: readonly string[],
): string {
  return (
    resolveLegacyCmsRedirectPath({
      hostKind: "agency",
      pathname: newPath,
      languageSettings: { publicLocales: [...publicLocales] },
      isPathAllowed: agencyPathAllowed,
    }) ?? newPath
  );
}

/**
 * A permanent redirect off the legacy `/p/<slug>` form, or `null` to keep
 * serving. Safe methods only: a POST to `/p/<slug>` (a CMS contact form
 * posting back to its own URL) must never be turned into a GET by a 301.
 */
export function cleanPublicUrlRedirectResponse(params: {
  request: NextRequest;
  hostKind: string;
  pathname: string;
  languageSettings: LanguageSettings;
}): NextResponse | null {
  const { request, hostKind, pathname, languageSettings } = params;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const destination = resolveLegacyCmsRedirectPath({
    hostKind,
    pathname,
    languageSettings,
    isPathAllowed: agencyPathAllowed,
  });
  if (!destination) return null;

  const url = request.nextUrl.clone();
  url.pathname = destination;
  const response = NextResponse.redirect(url, 301);
  syncLocaleCookieForPath(response, pathname, languageSettings, request);
  return response;
}
