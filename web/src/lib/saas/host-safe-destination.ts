/**
 * Host-safe redirect destinations.
 *
 * Workspace paths (`/admin`, `/client`, `/talent`, `/onboarding/*`,
 * `/<slug>/client/*`) exist on the app + agency surfaces only. The surface
 * allow-list 404s them everywhere else, so a *relative* redirect to one of
 * them from a page that IS reachable on the marketing apex or the hub
 * (`/login`, `/update-password`, `/c/<inquiryId>`, `/get-started`) sends the
 * user straight into "Page not found" with no way forward.
 *
 * `/auth/callback` already solved this by hard-coding `getAppUrl()` in front
 * of the destination. This module generalizes that fix: keep the relative
 * path when the current surface can serve it, and only cross to the app host
 * when it cannot. Session cookies are parent-domain scoped, so the app host
 * sees the same session.
 *
 * Live repro that motivated this (2026-08-07): a brand-new signup
 * (`app_role='client'`, `account_status='onboarding'`) on tulala.digital was
 * bounced to `/onboarding/role` and got a hard 404.
 */
import { getAppUrl } from "@/lib/auth-flow";
import { getPublicHostContext } from "@/lib/saas/scope";
import {
  isPathAllowedForHostKind,
  isSurfaceHostKind,
} from "@/lib/saas/surface-allow-list";

/**
 * Pure form: returns `destination` unchanged when this host kind serves it,
 * otherwise the same path on the canonical app host (absolute URL).
 *
 * An unknown/absent host kind returns the destination unchanged, so callers
 * outside a request context (or mid-deploy, before the header exists) keep
 * today's behavior instead of gaining a surprise cross-host bounce.
 */
export function hostSafeDestination(
  destination: string,
  hostKind: string | null | undefined,
): string {
  // Absolute URLs are already explicit about their host.
  if (!destination.startsWith("/") || destination.startsWith("//")) {
    return destination;
  }
  if (!hostKind || !isSurfaceHostKind(hostKind)) return destination;

  const [path] = destination.split("?", 1);
  if (isPathAllowedForHostKind(hostKind, path)) return destination;

  return `${getAppUrl()}${destination}`;
}

/**
 * Request-scoped form: reads the host kind middleware stamped on the request.
 * Use in server actions / route handlers right before `redirect(...)`.
 */
export async function hostSafeRedirectDestination(
  destination: string,
): Promise<string> {
  // `getPublicHostContext` reads the middleware-stamped headers and answers
  // `unknown` outside a request, which `hostSafeDestination` treats as
  // "leave it alone".
  const { kind } = await getPublicHostContext();
  return hostSafeDestination(destination, kind);
}
