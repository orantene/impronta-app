/**
 * Hub/directory "Contact the agency" destination (GRK-050).
 *
 * Distinct from Inquire: Inquire opens the guest-chat / inquiry launcher;
 * Contact lands on the host's `/contact` surface (marketing form on platform
 * hosts, storefront/CMS contact on agency hosts). Never the draft chat drawer.
 */

import { clientLocaleHref } from "@/i18n/client-directory-href";
import type { HostKind } from "@/lib/saas/host-kinds";
import { isPathAllowedForHostKind } from "@/lib/saas/gate";
import { localizedContactUrl } from "@/lib/talent-site/footer-socket";

/** Locale-aware `/contact`, with optional talent code for support context. */
export function agencyContactHref(
  pathname: string,
  opts?: { profileCode?: string | null; hostKind?: HostKind | null },
): string {
  const kind = opts?.hostKind ?? null;
  // Relative /contact resolves only where it is served: marketing hosts via the
  // allow-list, agency hosts via the CMS clean-URL rewrite. Hub (and unknown)
  // hosts 404 on it, so they get the absolute marketing URL instead.
  const relativeOk =
    kind === "agency" || (kind !== null && isPathAllowedForHostKind(kind, "/contact"));
  const isEs = /^\/es(\/|$)/.test(pathname);
  const base = relativeOk
    ? clientLocaleHref(pathname, "/contact")
    : localizedContactUrl(isEs ? "es" : "en");
  const code = (opts?.profileCode ?? "").trim();
  if (!code) return base;
  const params = new URLSearchParams({
    source: "hub-profile",
    code,
  });
  return `${base}?${params.toString()}`;
}
