/**
 * Phase 5 — preview cookie helpers.
 *
 * Name:   impronta_preview__<tenantId>
 * Value:  signed JWT (see ./jwt.ts)
 * Flags:  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900 (15 min)
 *
 * Why tenant-scoped names?
 *   Preview cookies are set on the tenant's public host. A shared browser
 *   session across multiple tenant previews (e.g. a platform admin toggling
 *   tenants) must not overwrite one tenant's cookie with another's — a
 *   single-named cookie would let Tenant B's preview leak into Tenant A's
 *   render when the user switches. Scoping the name by tenant id keeps
 *   each preview session independent.
 *
 * The legacy unscoped PREVIEW_COOKIE_NAME is retained for the M8
 * handoff doc's API references; today's code should always use the
 * tenant-scoped variant via `previewCookieNameFor(tenantId)`.
 *
 * Do NOT expose the cookie to client JS. All reads go via middleware or
 * server actions; the UI shows preview state via a server-side check.
 */

export const PREVIEW_COOKIE_NAME = "impronta_preview";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 15 * 60;
export const PREVIEW_QUERY_PARAM = "preview";

/** UUID regex for tenant-id scoping. Rejects anything that could break the cookie grammar. */
const TENANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function previewCookieNameFor(tenantId: string): string {
  if (!TENANT_UUID_RE.test(tenantId)) {
    throw new Error(`previewCookieNameFor: invalid tenantId "${tenantId}"`);
  }
  // Underscores only — RFC 6265 token grammar — and no dashes in the tenant
  // part since we already validate UUID above; replace() keeps only legal
  // cookie-name characters defensively.
  return `${PREVIEW_COOKIE_NAME}__${tenantId.replace(/-/g, "")}`;
}

export interface PreviewCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

export const PREVIEW_COOKIE_OPTIONS: PreviewCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
};
