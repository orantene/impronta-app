/**
 * Resolve a Stripe (or manage-link) origin from request headers without
 * trusting a forged `x-forwarded-host`.
 *
 * The host gate (`proxy.ts`) validates the `Host` header against
 * `agency_domains` and stamps the registered name on `x-impronta-host-name`.
 * Payment return URLs must use that same host — never an unvalidated
 * forwarded host that can disagree with the gate.
 */

export type TrustedPublicOriginHeaders = {
  /** Middleware-stamped hostname from `getPublicHostContext().hostname`. */
  stampedHostname: string | null | undefined;
  /** Raw `Host` header (what the gate validated). */
  hostHeader: string | null | undefined;
  /** Raw `x-forwarded-host` — accepted only when it matches stamped or Host. */
  forwardedHost: string | null | undefined;
  /** `x-forwarded-proto`, defaulting to https. */
  proto: string | null | undefined;
};

function hostKey(raw: string): string {
  return (raw.split(":")[0] ?? raw).trim().toLowerCase();
}

/**
 * Pure: pick a trusted host and build `proto://host`.
 * Returns null when no trusted host is available.
 */
export function resolveTrustedPublicOrigin(
  input: TrustedPublicOriginHeaders,
): string | null {
  const stamped = (input.stampedHostname ?? "").trim();
  const hostHeader = (input.hostHeader ?? "").trim();
  const forwarded = (input.forwardedHost ?? "").trim();

  let host = stamped || hostHeader;
  if (!host) return null;

  if (forwarded) {
    const fwdKey = hostKey(forwarded);
    const stampedKey = stamped ? hostKey(stamped) : "";
    const hostKeyNorm = hostHeader ? hostKey(hostHeader) : "";
    // Keep the forwarded spelling (incl. port) only when it names the same
    // registered / gate-validated host — never an attacker-supplied host.
    if (fwdKey && (fwdKey === stampedKey || fwdKey === hostKeyNorm)) {
      host = forwarded;
    }
  }

  const proto = (input.proto ?? "https").trim() || "https";
  return `${proto}://${host}`;
}
