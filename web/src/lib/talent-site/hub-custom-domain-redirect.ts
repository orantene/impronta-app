/**
 * Hub `/t/<code>` → primary custom-domain home (D1).
 *
 * Pure decision: when a visitor opens the platform discovery profile and the
 * talent has an ACTIVE primary custom domain, 308 to that domain's home.
 * Staff keep the hub via `?preview=1`. Modals never redirect.
 */

export function resolveTalentHubCustomDomainHomeRedirect(input: {
  /** Platform discovery hosts (app / marketing). Agency overlays never redirect. */
  platformHost: boolean;
  /** Directory quick-open overlay — keep the hub card in place. */
  isModal: boolean;
  /** Staff / owner flag (`?preview=1`) keeps the hub profile reachable. */
  preview: string | undefined | null;
  /** Active primary custom domain hostname, or null when none / not active. */
  primaryActiveCustomDomain: string | null | undefined;
}): string | null {
  if (!input.platformHost || input.isModal || input.preview === "1") return null;
  const host = (input.primaryActiveCustomDomain ?? "").trim().toLowerCase();
  if (!host) return null;
  return `https://${host}/`;
}
