/**
 * Copy for the shared subdomain namespace (PURE, en + es).
 *
 * A talent site slug, an agency slug and an agency subdomain label are one
 * namespace now, so "taken" can be reported from four different code paths. The
 * words live here once so a talent and a workspace owner are told the same
 * thing, in their own language, whichever path rejected them.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export interface SubdomainNamespaceCopy {
  /** A talent tried to claim a site address someone else holds. */
  siteAddressTaken: string;
  /** A workspace tried to claim a name someone else holds. */
  workspaceNameTaken: string;
}

export function subdomainNamespaceCopy(
  locale: string | null | undefined,
): SubdomainNamespaceCopy {
  return pickLocale<SubdomainNamespaceCopy>(locale, {
    en: {
      siteAddressTaken: "That address is taken. Try another.",
      workspaceNameTaken: "That name is taken. Please choose a different one.",
    },
    es: {
      siteAddressTaken: "Esa dirección ya está ocupada. Prueba con otra.",
      workspaceNameTaken: "Ese nombre ya está ocupado. Elige otro, por favor.",
    },
  });
}
