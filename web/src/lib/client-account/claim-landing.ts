/**
 * TUL-691 (Oran, 2026-10-13): after a guest claims an account, they land on
 * `/client`. `/client` is the client router: it sends a client to their agency
 * shell, or to `/account` on hosts that serve the account area.
 *
 * `clientRootFallback` decides the `/client` page's last resort, once no agency
 * relationship was found. A client with claimed history (a pay-only guest, a
 * hub booker) must reach their account area, never the marketing apex or the
 * role picker.
 */

export const CLIENT_CLAIM_LANDING = "/client";

export type ClientRootFallback = "account" | "discover" | "onboarding";

export function clientRootFallback(input: {
  hasClientProfile: boolean;
  appRole: string | null | undefined;
  accountStatus: string | null | undefined;
  /** The client account area is switched on for this host kind. */
  accountAreaOn: boolean;
}): ClientRootFallback {
  const activeClient = input.appRole === "client" && input.accountStatus === "active";
  if (!input.hasClientProfile && !activeClient) return "onboarding";
  return input.accountAreaOn ? "account" : "discover";
}
