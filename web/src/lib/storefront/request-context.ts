import "server-only";

/**
 * request-context.ts — what a storefront action learns from the request.
 *
 * Every `.server.ts` seam needs the same three things and none of them may
 * come from the client: WHO is asking (a signed-in customer, else the guest
 * session the middleware minted), WHERE the page lives (the public origin, for
 * checkout return URLs and manage links), and WHICH language the page is in.
 *
 * The guest key is the plain id the middleware forwards on `x-impronta-guest`
 * after verifying the HMAC cookie. It identifies a BROWSER, not a person: it
 * satisfies `orders_draft_has_an_identity` for a cart and never satisfies an
 * identity demand, which is why the cart asks for a name before payment.
 */

import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import { getGuestSessionKey } from "@/lib/guest-session";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTrustedPublicOrigin } from "@/lib/storefront/trusted-public-origin";

export type StorefrontIdentity = {
  /** The middleware guest id, or null when the request carried none. */
  guestKey: string | null;
  /** `auth.users.id` when a customer is signed in on this host. */
  userId: string | null;
  email: string | null;
  displayName: string | null;
};

export async function resolveStorefrontIdentity(): Promise<StorefrontIdentity> {
  let guestKey: string | null = null;
  try {
    guestKey = await getGuestSessionKey();
  } catch (error) {
    logServerError("storefront.identity.guest", error);
  }
  try {
    const session = await getCachedActorSession();
    if (session.user) {
      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        session.profile?.display_name ??
        (typeof meta.full_name === "string" ? meta.full_name : null) ??
        (typeof meta.name === "string" ? meta.name : null);
      return {
        guestKey,
        userId: session.user.id,
        email: session.user.email ?? null,
        displayName: typeof name === "string" && name.trim() ? name.trim() : null,
      };
    }
  } catch (error) {
    logServerError("storefront.identity.session", error);
  }
  return { guestKey, userId: null, email: null, displayName: null };
}

/**
 * `https://host` for this request; null when no trusted host is available.
 *
 * Uses the middleware-stamped hostname (agency_domains gate) and the `Host`
 * header — never an unvalidated `x-forwarded-host` alone (TUL-350 / money
 * open-redirect review).
 */
export async function publicOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const ctx = await getPublicHostContext();
    return resolveTrustedPublicOrigin({
      stampedHostname: ctx.hostname,
      hostHeader: h.get("host"),
      forwardedHost: h.get("x-forwarded-host"),
      proto: h.get("x-forwarded-proto"),
    });
  } catch (error) {
    logServerError("storefront.origin", error);
    return null;
  }
}

/** The page's locale, narrowed to the two the catalogues carry in full. */
export async function storefrontLocale(preferred?: string | null): Promise<"en" | "es"> {
  if (preferred === "es" || preferred === "en") return preferred;
  try {
    const locale = await getRequestLocale();
    return locale === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}
