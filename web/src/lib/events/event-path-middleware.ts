/**
 * Middleware adapter for the event URL grammar (`event-page-paths.ts`).
 *
 * Same shape as `cms/clean-url-middleware.ts`, for the same two reasons: the
 * grammar stays a pure string function that is tested without a request, and
 * `proxy.ts` sits under a hard 800-line cap.
 */

import { NextResponse, type NextRequest } from "next/server";

import { syncLocaleCookieForPath } from "@/i18n/locale-middleware";
import type { LanguageSettings } from "@/lib/language-settings/types";
import { resolveEventPathRouting } from "@/lib/events/event-page-paths";

/**
 * A permanent redirect onto the canonical event URL for the resolved locale
 * (`/eventos/x` → `/es/eventos/x`, `/es/events/x` → `/es/eventos/x`), or
 * `null` to keep serving. Safe methods only, like every other canonicalising
 * redirect in the proxy: a POST is never turned into a GET.
 */
export function eventPathRedirectResponse(params: {
  request: NextRequest;
  hostKind: string;
  pathname: string;
  languageSettings: LanguageSettings;
}): NextResponse | null {
  const { request, hostKind, pathname, languageSettings } = params;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const routing = resolveEventPathRouting({ hostKind, pathname, settings: languageSettings });
  if (!routing || routing.kind !== "redirect") return null;
  const url = request.nextUrl.clone();
  url.pathname = routing.to;
  const response = NextResponse.redirect(url, 301);
  syncLocaleCookieForPath(response, routing.to, languageSettings, request);
  return response;
}
