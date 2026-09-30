import type { CSSProperties } from "react";

import type { Locale } from "@/i18n/config";
import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { getPublicCmsNavigationLinks } from "@/lib/cms/public-navigation";
import { buildAgencySocketModel } from "@/lib/talent-site/footer-socket";

/** Agency page tokens mapped onto the socket's token names. */
const AGENCY_TOKEN_STYLE = {
  "--token-color-surface-raised": "var(--background)",
  "--token-color-ink": "var(--foreground)",
  "--token-color-line": "var(--border)",
} as CSSProperties;

/**
 * The global Tulala footer socket on an agency storefront surface: the ONE
 * Tulala credit and the Tulala terms and privacy links. Styled by the page's
 * own tokens, so contrast matches the surface it sits on.
 */
export async function AgencyFooterSocket({
  tenantId,
  locale,
}: {
  tenantId: string;
  locale: Locale;
}) {
  const [whitelabel, links] = await Promise.all([
    loadTenantWhitelabel(tenantId).catch(() => false),
    getPublicCmsNavigationLinks(locale, "footer").catch(() => []),
  ]);
  const model = buildAgencySocketModel({ locale, whitelabel, footerLinks: links });
  return (
    <div style={AGENCY_TOKEN_STYLE} data-agency-socket="">
      <TalentSiteSocket model={model} clearDock={false} />
    </div>
  );
}
