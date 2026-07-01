import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "@/app/(workspace)/[tenantSlug]/_data-bridge";
import type { CtaIdentity } from "@/lib/inquiry/inquiry-context-resolver";
import type { GuestIdentityTier } from "@/lib/inquiry/guest-chat-contract";

/**
 * Resolve who is viewing the guest-chat launcher on a tenant's PUBLIC storefront.
 *
 * The launcher lives on the public host, but the Supabase auth cookie IS present
 * on the tenant host, so the signed-in user is readable server-side here. We
 * reuse the SAME auth + membership path the client workspace uses:
 *   - getCachedActorSession()      → the signed-in actor (one cached auth chain)
 *   - loadClientSelfProfile(u, t)  → proves an ACTIVE client relationship to
 *                                    THIS tenant (returns null otherwise)
 *
 * When BOTH hold, the viewer is a real client of this tenant → we return the
 * "account" identity (hides the guest "create your free account" toolkit) plus a
 * dashboardHref to the client inbox. Anyone else — anonymous guest, a client of
 * a DIFFERENT tenant, staff, talent — falls through to the guest defaults, so a
 * guest is never mis-detected and never shown a dashboard link they cannot open.
 *
 * Any failure (no cookie, auth throw, DB hiccup) resolves to the guest default:
 * detection is additive and must never break the common anonymous-guest flow.
 */
export type ChatViewerIdentity = {
  /** Resolver / analytics axis. */
  ctaIdentity: CtaIdentity;
  /** Trust-tier axis that drives the account toolkit hide + dashboard link. */
  identity: GuestIdentityTier;
  /** `/{tenantSlug}/client/messages` for a signed-in client; null otherwise. */
  dashboardHref: string | null;
};

const GUEST_DEFAULT: ChatViewerIdentity = {
  ctaIdentity: "guest",
  identity: "guest",
  dashboardHref: null,
};

export async function resolveChatViewerIdentity(args: {
  tenantId: string | null;
  tenantSlug: string;
}): Promise<ChatViewerIdentity> {
  const { tenantId, tenantSlug } = args;
  if (!tenantId || !tenantSlug.trim()) return GUEST_DEFAULT;

  try {
    const session = await getCachedActorSession();
    if (!session.user) return GUEST_DEFAULT;

    const clientProfile = await loadClientSelfProfile(session.user.id, tenantId);
    if (!clientProfile) return GUEST_DEFAULT;

    return {
      ctaIdentity: "client",
      identity: "account",
      dashboardHref: `/${tenantSlug}/client/messages`,
    };
  } catch {
    // Never let signed-in detection break the anonymous-guest common case.
    return GUEST_DEFAULT;
  }
}
