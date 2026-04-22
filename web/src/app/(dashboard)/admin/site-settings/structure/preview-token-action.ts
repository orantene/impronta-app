"use server";

/**
 * Mint a short-lived preview JWT for the current tenant + actor.
 *
 * Called by the admin LivePreviewPanel on mount and on a ~10-min refresh
 * cycle (token TTL is 15 min). The returned token is appended to the
 * iframe src as `?preview=<jwt>`; the tenant storefront middleware
 * verifies it, sets a tenant-scoped HttpOnly cookie, and 302-redirects
 * to a clean URL so the JWT never persists in browser history or server
 * access logs beyond the handoff.
 *
 * Guards:
 *   - requireStaff: user is an authenticated admin/staff role.
 *   - requireTenantScope: caller has a resolved tenant scope.
 *   - JWT `tid` claim is the resolved tenantId — middleware re-verifies
 *     on the storefront host, so a bad tid silently fails there too.
 */

import { signPreviewJwt } from "@/lib/site-admin/preview/jwt";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export interface PreviewTokenResult {
  ok: boolean;
  token?: string;
  expiresAt?: string;
  error?: string;
}

export async function mintPreviewTokenAction(
  scope: "homepage" | "page",
  pageId?: string,
): Promise<PreviewTokenResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const tenantScope = await requireTenantScope().catch(() => null);
  if (!tenantScope) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  try {
    const signed = signPreviewJwt({
      tenantId: tenantScope.tenantId,
      actorProfileId: auth.user.id,
      subject:
        scope === "page" && pageId ? `page:${pageId}` : "homepage",
    });
    return {
      ok: true,
      token: signed.token,
      expiresAt: signed.expiresAt.toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message.includes("PREVIEW_JWT_SECRET")
            ? "Preview secret is not configured on this environment."
            : "Could not sign a preview token. Try again."
          : "Could not sign a preview token.",
    };
  }
}
