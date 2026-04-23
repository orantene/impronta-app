/**
 * Edit-mode cookie — lightweight presence marker paired with the preview JWT.
 *
 * Two cookies are set together by `enterEditModeAction`:
 *   1. `impronta_preview__<tid>` — HttpOnly JWT; triggers the existing draft
 *      render path (`isPreviewActiveForTenant` → `loadDraftHomepage`). All
 *      draft/revalidation plumbing already works against this cookie; we
 *      reuse it so edit mode doesn't fork that surface.
 *   2. `impronta_edit__<tid>` — this module. NOT HttpOnly, value "1",
 *      read by client chrome to decide between idle (EditPill) vs engaged
 *      (EditShell). Does not authenticate anything — the JWT does that.
 *
 * Why a second cookie?
 *   The preview JWT is HttpOnly so it can't be read from the client, which is
 *   correct for a signed credential. But the client chrome needs to know
 *   "are we in edit mode right now?" to render the pill vs the shell without
 *   a server roundtrip on every navigation. A non-sensitive marker cookie
 *   scoped by tenant is the simplest answer.
 *
 * Tenant-scoped name, same rationale as preview cookie: a shared browser
 * session across multiple tenant edits must not leak one tenant's edit state
 * into another's render when the user switches hosts.
 */

export const EDIT_COOKIE_NAME = "impronta_edit";
export const EDIT_COOKIE_MAX_AGE_SECONDS = 15 * 60;
export const EDIT_COOKIE_VALUE = "1";

const TENANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function editCookieNameFor(tenantId: string): string {
  if (!TENANT_UUID_RE.test(tenantId)) {
    throw new Error(`editCookieNameFor: invalid tenantId "${tenantId}"`);
  }
  return `${EDIT_COOKIE_NAME}__${tenantId.replace(/-/g, "")}`;
}

export interface EditCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

/** Not HttpOnly — client reads this to pick chrome state (pill vs shell). */
export const EDIT_COOKIE_OPTIONS: EditCookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: EDIT_COOKIE_MAX_AGE_SECONDS,
};
