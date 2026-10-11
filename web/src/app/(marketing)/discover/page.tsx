import { permanentRedirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { discoverDirectoryRedirectPath } from "@/lib/marketing/discover-directory-redirect";

/**
 * TUL-518 S2: tulala.digital/discover (and /es/discover) used to 404 after
 * the global browse surface moved to /directory. Keep the old URL alive with
 * a locale-preserving permanent redirect.
 */
export default async function DiscoverRedirectPage() {
  const locale = await getRequestLocale();
  permanentRedirect(discoverDirectoryRedirectPath(locale));
}
