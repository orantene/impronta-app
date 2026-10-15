/**
 * Support Desk dedicated hostnames (pure — safe for client + cookie helpers).
 *
 * Primary: `support.tulala.digital`
 * Optional future alias: `desk.tulala.digital`
 * Local /etc/hosts mirrors: `support.local`, `desk.local`
 *
 * Auth cookies on these hosts must stay host-scoped (own login). Never widen
 * to `.tulala.digital` — see cookie-domain.ts + desk-host.ts.
 */

/** Canonical production Desk host (alias desk.tulala.digital later). */
export const SUPPORT_DESK_PRIMARY_HOST = "support.tulala.digital" as const;

/** Staging Desk host (isolated staging DB + session; never the prod desk). */
export const SUPPORT_DESK_STAGING_HOST = "support.staging.tulala.digital" as const;

export const SUPPORT_DESK_HOSTNAMES = [
  SUPPORT_DESK_PRIMARY_HOST,
  SUPPORT_DESK_STAGING_HOST,
  "desk.tulala.digital",
  "support.local",
  "desk.local",
] as const;

const SUPPORT_DESK_HOST_SET: ReadonlySet<string> = new Set(
  SUPPORT_DESK_HOSTNAMES,
);

/** Strip port + lowercase. */
export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return (host.split(":")[0] ?? "").trim().toLowerCase();
}

/**
 * True for the staging family: staging.tulala.digital, *.staging.tulala.digital
 * (app/pay/hub/support.staging) and staging-qa-*.tulala.digital.
 */
export function isStagingHost(host: string | null | undefined): boolean {
  const h = normalizeHostname(host);
  if (!h) return false;
  return (
    h === "staging.tulala.digital" ||
    h.endsWith(".staging.tulala.digital") ||
    (h.startsWith("staging-qa-") && h.endsWith(".tulala.digital"))
  );
}

/**
 * Absolute Desk host for the environment a request came from. Staging hosts
 * get the staging desk (so the staging session/DB is not abandoned); every
 * other host, including unknown or missing, gets the production desk.
 */
export function supportDeskPrimaryHostFor(
  requestHost?: string | null,
): string {
  return isStagingHost(requestHost)
    ? SUPPORT_DESK_STAGING_HOST
    : SUPPORT_DESK_PRIMARY_HOST;
}

export function isSupportDeskHost(host: string | null | undefined): boolean {
  const h = normalizeHostname(host);
  return h !== "" && SUPPORT_DESK_HOST_SET.has(h);
}

/**
 * Hosts that must keep auth cookies host-scoped (own login; never parent
 * Domain=.tulala.digital). Today this is exactly the Support Desk set.
 */
export function isHostScopedAuthHost(host: string | null | undefined): boolean {
  return isSupportDeskHost(host);
}
