import { isOnboardingStatus } from "@/lib/auth-flow";

import { accountFlagKindForHost, accountHomeMode, legacyClientEntryRedirect } from "./agency-area-pure";
import { clientAccountEnabledFor, type ClientAccountHostKind } from "./flag";
import { isClientAccountEligible } from "./pure";

/**
 * What the client account surface may paint on a host kind. One function so the
 * dock mount, the header item and the API route cannot disagree. Flag unset
 * means nothing renders anywhere.
 */
export type ClientAccountMount = { dock: boolean; headerItem: boolean };

export function resolveClientAccountMount(hostKind: ClientAccountHostKind): ClientAccountMount {
  const on = clientAccountEnabledFor(hostKind);
  return { dock: on, headerItem: on };
}

/**
 * Mount kind for a request's `x-impronta-host-context` value. Callers that only
 * know the surface string (`talent_site` / `profile_page`) must still resolve
 * through the real host header — agency and hub are not the `app` flag.
 */
export function mountKindForHostContext(
  hostContext: string | null | undefined,
): ClientAccountHostKind | null {
  return accountFlagKindForHost(hostContext);
}

/**
 * TUL-64: where account entry points send a visitor, given host context
 * (`x-impronta-host-context`), account_status and app_role. Pure — the matrix
 * test pins every cell. Destinations:
 *   - `account_area` — render `/account` (agency / hub / app / marketing)
 *   - `talent_area` — render `/account` on a talent site
 *   - `legacy` — keep the pre-client-account role redirect (`/admin` / `/talent` / `/client`)
 *   - `onboarding` — still needs `/onboarding/role` (and `/start` on the app host)
 *   - `client_resolver` — app-host `/client` thin resolver (never onboarding for an
 *     already-active client)
 */
export type ClientGateTarget =
  | "account_area"
  | "talent_area"
  | "legacy"
  | "onboarding"
  | "client_resolver";

export function resolveClientGate(input: {
  hostContext: string | null | undefined;
  accountStatus: string | null | undefined;
  appRole: string | null | undefined;
  userId: string | null | undefined;
  /** When set, skips re-reading env (tests pass the kind's own flag). */
  flagOn?: boolean;
}): ClientGateTarget {
  const flagKind = accountFlagKindForHost(input.hostContext);
  const flagOn =
    input.flagOn ?? (flagKind ? clientAccountEnabledFor(flagKind) : false);

  if (input.hostContext === "talent_site") {
    if (!flagOn) return "legacy";
    if (!input.userId) return "talent_area";
    if (isClientAccountEligible(input.appRole)) return "talent_area";
    return "legacy";
  }

  const home = accountHomeMode({
    flagOn,
    hostContext: input.hostContext,
    userId: input.userId,
    appRole: input.appRole,
  });
  if (home === "area") return "account_area";

  // Flag off / non-client on a tenant host: staff keep legacy; a client who is
  // still onboarding (or has no role yet) must finish setup; an active client
  // on the app host uses the /client resolver instead of bouncing to /start.
  if (
    input.userId &&
    isClientAccountEligible(input.appRole) &&
    (isOnboardingStatus(input.accountStatus) || !input.appRole)
  ) {
    return "onboarding";
  }

  if (
    input.userId &&
    input.appRole === "client" &&
    input.accountStatus === "active" &&
    (input.hostContext === "app" || input.hostContext === "marketing")
  ) {
    return "client_resolver";
  }

  // Agency/hub with flag off: an active client still must not hit /onboarding.
  // Legacy entry redirects are "stay" when the flag is off; the thin /client
  // page is the remaining path — treat that as the resolver, not onboarding.
  if (
    input.userId &&
    input.appRole === "client" &&
    input.accountStatus === "active" &&
    (input.hostContext === "agency" || input.hostContext === "hub")
  ) {
    const entry = legacyClientEntryRedirect({
      flagOn,
      hostContext: input.hostContext,
      userId: input.userId,
      appRole: input.appRole,
    });
    return entry === "account" ? "account_area" : "client_resolver";
  }

  return "legacy";
}
