import { permanentRedirect } from "next/navigation";

import { loadTalentHubCustomDomainHomeRedirect } from "@/lib/talent-site/server/load-hub-custom-domain-redirect";
import { loadTalentPublicSiteByProfileCode } from "@/lib/talent-site/server/public-load";

/**
 * D1: hub `/t/<code>` goes to the ACTIVE primary custom domain home (308).
 * Staff keep the hub via `?preview=1`; never fires when the domain is not
 * active, or inside the directory quick-open modal.
 */
export async function redirectHubToPrimaryCustomDomain(opts: {
  platformHost: boolean;
  preview: string | undefined;
  isModal: boolean;
  profileCode: string;
}): Promise<void> {
  if (!opts.platformHost || opts.preview === "1" || opts.isModal) return;
  const publicSite = await loadTalentPublicSiteByProfileCode(opts.profileCode);
  if (publicSite.kind === "not_found") return;
  const customHome = await loadTalentHubCustomDomainHomeRedirect({
    talentProfileId: publicSite.talentProfileId,
    platformHost: true,
    isModal: false,
    preview: opts.preview,
  });
  if (customHome) permanentRedirect(customHome);
}
