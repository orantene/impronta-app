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

export const SUPPORT_DESK_HOSTNAMES = [
  SUPPORT_DESK_PRIMARY_HOST,
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
