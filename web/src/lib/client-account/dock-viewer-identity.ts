/**
 * Pure dock identity for talent/agency guest chat mounts (TUL-314).
 *
 * The claim banner (`GuestAccountToolkit`) keys off `GuestIdentityTier`.
 * Password / Google / email-code sessions all share one Supabase cookie;
 * mounts must map that session into a tier so a signed-in client is never
 * treated as an anonymous guest ("Envíame un enlace de acceso").
 */

import type { GuestIdentityTier } from "@/lib/inquiry/guest-chat-contract";

import { isClientAccountEligible } from "./pure";

export type DockViewerIdentityInput = {
  /** Supabase auth user present on this request. */
  hasUser: boolean;
  /** profiles.app_role (null/empty counts as client-eligible). */
  appRole: string | null | undefined;
  /** profiles.account_status when known. */
  accountStatus: string | null | undefined;
};

/**
 * Map a session snapshot to the dock trust tier.
 *
 * - No user, or a business/talent/platform role → `"guest"` (claim UI may show).
 * - Eligible client with `account_status === "active"` → `"account"` (banner off).
 * - Any other eligible client session → `"email_verified"` (quiet "saved" state;
 *   never the magic-link claim CTA). Password and Google sign-in land here when
 *   the profile row is not yet `active`.
 */
export function dockViewerIdentityTier(input: DockViewerIdentityInput): GuestIdentityTier {
  if (!input.hasUser) return "guest";
  if (!isClientAccountEligible(input.appRole)) return "guest";
  if (input.accountStatus === "active") return "account";
  return "email_verified";
}

/** Jon360 / launcher pill: signed-in client vs anonymous guest. */
export function dockViewerCtaIdentity(tier: GuestIdentityTier): "guest" | "client" {
  return tier === "account" || tier === "email_verified" ? "client" : "guest";
}
