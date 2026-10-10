/**
 * Hub/directory "Contact the agency" destination (GRK-050).
 *
 * Distinct from Inquire: Inquire opens the guest-chat / inquiry launcher;
 * Contact lands on the host's `/contact` surface (marketing form on platform
 * hosts, storefront/CMS contact on agency hosts). Never the draft chat drawer.
 */

import { clientLocaleHref } from "@/i18n/client-directory-href";

/** Locale-aware `/contact`, with optional talent code for support context. */
export function agencyContactHref(
  pathname: string,
  opts?: { profileCode?: string | null },
): string {
  const base = clientLocaleHref(pathname, "/contact");
  const code = (opts?.profileCode ?? "").trim();
  if (!code) return base;
  const params = new URLSearchParams({
    source: "hub-profile",
    code,
  });
  return `${base}?${params.toString()}`;
}
